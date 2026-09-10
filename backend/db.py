"""
Persistence layer for NAFT-GUARD, backed by Postgres (Neon).

Everything the app shows — incidents, alerts, response actions, forecasts —
is stored here so it survives a page refresh and is shared across anyone
using the app, instead of living only in the browser's React state.

If DATABASE_URL isn't set, `engine` is None and the rest of the app falls
back to its original in-memory/mock behaviour — persistence is additive,
not required for the AI pipeline itself to work.
"""

import os
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from sqlalchemy import (
    create_engine, Column, String, Float, DateTime, ForeignKey, Integer, JSON, select, update,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

load_dotenv()

_raw_url = os.environ.get("DATABASE_URL")
DATABASE_URL = _raw_url.replace("postgresql://", "postgresql+psycopg://", 1) if _raw_url else None

engine = create_engine(DATABASE_URL, pool_pre_ping=True) if DATABASE_URL else None
SessionLocal = sessionmaker(bind=engine) if engine else None

Base = declarative_base()


def now():
    return datetime.now(timezone.utc)


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True)
    detected_at = Column(DateTime(timezone=True), default=now)
    location = Column(String)
    area_km2 = Column(Float)
    severity = Column(String)
    confidence = Column(Float)
    classification = Column(String)
    status = Column(String, default="MONITORING")
    lat = Column(Float)
    lng = Column(Float)
    run_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=now)

    alerts = relationship("Alert", back_populates="incident", cascade="all, delete-orphan")
    forecasts = relationship("Forecast", back_populates="incident", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "detectedAt": self.detected_at.strftime("%H:%M") if self.detected_at else None,
            "location": self.location,
            "area": self.area_km2,
            "severity": self.severity,
            "confidence": self.confidence,
            "classification": self.classification,
            "status": self.status,
            "lat": self.lat,
            "lng": self.lng,
            "runId": self.run_id,
        }


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True)
    time = Column(DateTime(timezone=True), default=now)
    text = Column(String)
    incident_id = Column(String, ForeignKey("incidents.id"), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)

    incident = relationship("Incident", back_populates="alerts")

    def to_dict(self):
        return {
            "id": self.id,
            "time": self.time.strftime("%I:%M %p").lstrip("0") if self.time else None,
            "text": self.text,
            "incidentId": self.incident_id,
            "lat": self.lat,
            "lng": self.lng,
        }


class ResponseAction(Base):
    __tablename__ = "response_actions"

    id = Column(String, primary_key=True)
    title = Column(String)
    priority = Column(String)
    reason = Column(String)
    status = Column(String, default="PENDING")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "priority": self.priority,
            "reason": self.reason,
            "status": self.status,
        }


class Forecast(Base):
    __tablename__ = "forecasts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    incident_id = Column(String, ForeignKey("incidents.id"))
    created_at = Column(DateTime(timezone=True), default=now)
    wind_speed_mps = Column(Float)
    wind_direction_deg = Column(Float)
    payload = Column(JSON)  # full forecast_spread() result

    incident = relationship("Incident", back_populates="forecasts")

    def to_dict(self):
        return {
            "incidentId": self.incident_id,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            **self.payload,
        }


class SystemState(Base):
    __tablename__ = "system_state"

    id = Column(Integer, primary_key=True, default=1)
    warnings_issued = Column(Integer, default=8)


# --------------------------------------------------------------------------
# Seed data — mirrors the original frontend mock data, so the first run
# looks the same as before but now lives in Postgres.
# --------------------------------------------------------------------------

_SEED_INCIDENTS = [
    dict(id="OG-1042", location="Gulf of Mexico, ~140km SE of New Orleans",
         area_km2=6.8, severity="HIGH", confidence=91, status="MONITORING", lat=28.93, lng=-89.02,
         classification="Historical case (seed data)"),
    dict(id="OG-1038", location="Mississippi Canyon block approach",
         area_km2=1.2, severity="LOW", confidence=76, status="RESOLVED", lat=28.6, lng=-88.4,
         classification="Historical case (seed data)"),
    dict(id="OG-1031", location="Chandeleur Sound coastal shelf",
         area_km2=3.4, severity="MEDIUM", confidence=83, status="CONTAINED", lat=29.4, lng=-88.7,
         classification="Historical case (seed data)"),
]

_SEED_ALERTS = [
    ("Oil spill detected", "OG-1042", 28.93, -89.02),
    ("Spill expansion detected", "OG-1042", 28.93, -89.02),
    ("Coastal region entered predicted risk zone", "OG-1042", 28.93, -89.02),
    ("Warning threshold reached", "OG-1042", 28.93, -89.02),
]

_SEED_ACTIONS = [
    dict(id="RA-1", title="Deploy containment barriers", priority="HIGH",
         reason="Slows lateral spread before the next tidal shift.", status="PENDING"),
    dict(id="RA-2", title="Dispatch response vessel", priority="HIGH",
         reason="Nearest recovery vessel is 3.5 hours from the site.", status="PENDING"),
    dict(id="RA-3", title="Increase monitoring frequency", priority="MEDIUM",
         reason="Confirms drift model accuracy against satellite passes.", status="IN_PROGRESS"),
    dict(id="RA-4", title="Notify coastal authorities", priority="HIGH",
         reason="Coastal arrival is estimated within the forecast window.", status="PENDING"),
    dict(id="RA-5", title="Monitor fishing zones", priority="MEDIUM",
         reason="Active trawling grounds overlap the current boundary.", status="PENDING"),
    dict(id="RA-6", title="Protect sensitive ecological areas", priority="MEDIUM",
         reason="Delta wetlands are within the forecast cone.", status="PENDING"),
]


def init_db():
    """Create tables if they don't exist yet, and seed them once."""
    if engine is None:
        return
    Base.metadata.create_all(engine)
    with SessionLocal() as session:
        if session.scalar(select(Incident).limit(1)) is None:
            for row in _SEED_INCIDENTS:
                session.add(Incident(**row))
            for text_, incident_id, lat, lng in _SEED_ALERTS:
                session.add(Alert(id=f"AL-{uuid.uuid4().hex[:8]}", text=text_, incident_id=incident_id, lat=lat, lng=lng))
            for row in _SEED_ACTIONS:
                session.add(ResponseAction(**row))
            session.add(SystemState(id=1, warnings_issued=8))
            session.commit()
