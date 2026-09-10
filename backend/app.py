"""
NAFT-GUARD backend API.

Wraps the NEFT-GUARD AI_MODULE (Sentinel-1 SAR oil-spill segmentation U-Net +
wind/ocean-current spread forecast) behind a small FastAPI service that the
NAFT-GUARD web frontend talks to.

The AI module itself is NOT copied here — this file imports it directly from
its original location (AI_MODULE_DIR, default E:\\AI_MODULE) so the model
weights, ocean-current data and inference code stay exactly as provided.
"""

import os
import sys
import json
import uuid
import shutil
import traceback
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import transform_bounds
from PIL import Image

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import select

import db

# --------------------------------------------------------------------------
# Wire up the AI module (imported in place, not duplicated)
# --------------------------------------------------------------------------

def _find_ai_module_dir() -> Path:
    """Locate the AI_MODULE folder without assuming any one machine's layout.

    Checked in order: an explicit AI_MODULE_DIR env var, the repo-relative
    location (AI_MODULE/ sitting next to backend/ in the same checkout —
    this is what makes deployment portable, since the model then travels
    with the git repo instead of depending on a machine-specific path),
    then a couple of conventional fallbacks for local dev.
    """
    candidates = [
        os.environ.get("AI_MODULE_DIR"),
        Path(__file__).resolve().parent.parent / "AI_MODULE",  # repo-relative
        r"E:\AI_MODULE" if os.name == "nt" else None,
        "/opt/naft-guard/AI_MODULE" if os.name != "nt" else None,
    ]
    for candidate in candidates:
        if candidate and (Path(candidate) / "inference").exists():
            return Path(candidate).resolve()
    raise RuntimeError(
        "Could not find the AI_MODULE folder (checked AI_MODULE_DIR, the repo-relative "
        "location, and common defaults). Set the AI_MODULE_DIR environment variable."
    )


AI_MODULE_DIR = _find_ai_module_dir()
INFERENCE_DIR = AI_MODULE_DIR / "inference"

sys.path.insert(0, str(INFERENCE_DIR))
sys.path.insert(0, str(AI_MODULE_DIR))

from spread_forecast import forecast_spread, FORECAST_HOURS  # noqa: E402

SAMPLE_TIF = AI_MODULE_DIR / "sample" / "2018_09_26.tif"
ONNX_MODEL_PATH = AI_MODULE_DIR / "models" / "oil_segmentation_model.onnx"

# On memory-constrained hosts (e.g. Render's 512MB free tier), importing
# torch alone adds ~150MB of resident memory before a single request is
# served. INFERENCE_ENGINE=onnx swaps to ONNX Runtime (~30MB) running the
# exact same trained weights (exported via export_onnx.py, verified to match
# the torch model's output within floating-point noise). AI_MODULE itself is
# untouched either way — this only changes which of our own wrapper
# functions runs the forward pass. Default (unset) keeps using AI_MODULE's
# own predict.detect_oil() as provided.
#
# Critically, predict.py itself does `import torch` at module scope — so
# whichever branch we DON'T take must never import predict.py, or torch gets
# pulled in anyway and this whole optimization is pointless.
INFERENCE_ENGINE = os.environ.get("INFERENCE_ENGINE", "torch").lower()

if INFERENCE_ENGINE == "onnx":
    if not ONNX_MODEL_PATH.exists():
        raise RuntimeError(
            f"INFERENCE_ENGINE=onnx but {ONNX_MODEL_PATH} doesn't exist. "
            "Run `python export_onnx.py` first."
        )
    from onnx_infer import detect_oil_onnx, THRESHOLD as DEFAULT_THRESHOLD

    def run_detect_oil(image_path, output_dir, threshold):
        return detect_oil_onnx(image_path, str(ONNX_MODEL_PATH), output_dir=output_dir, threshold=threshold)
else:
    from predict import detect_oil, THRESHOLD as DEFAULT_THRESHOLD

    def run_detect_oil(image_path, output_dir, threshold):
        return detect_oil(image_path=image_path, output_dir=output_dir, threshold=threshold)

# --------------------------------------------------------------------------
# App setup
# --------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
RUNS_DIR = BASE_DIR / "runs"
RUNS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="NAFT-GUARD Oil Spill AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/runs", StaticFiles(directory=str(RUNS_DIR)), name="runs")

db.init_db()
if db.engine is not None:
    print(f"[db] connected — persistence enabled ({db.engine.url.host})")
else:
    print("[db] DATABASE_URL not set — running without persistence (in-memory only)")

# Detection is CPU-bound and single-request-at-a-time is fine for a demo,
# but we still push it to a worker thread so the event loop stays responsive
# (health checks / forecast calls keep working while a detection runs).
_executor = ThreadPoolExecutor(max_workers=1)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _quicklook(sar_path: Path, mask_path: Path, out_path: Path, max_size: int = 1000) -> None:
    """Render a browser-friendly PNG: greyscale SAR backscatter with the
    AI's probable-oil mask painted on top in red.

    Reads both rasters directly at (approximately) the output resolution
    via rasterio's decimated read, instead of loading the full-resolution
    image into memory and shrinking afterwards — for a large scene, doing
    it the naive way briefly needs 3 full-size RGB float32 arrays (the
    single biggest memory spike in this whole service), which is both
    slow and, on a memory-constrained host, a real crash risk.
    """

    with rasterio.open(sar_path) as src:
        scale = min(1.0, max_size / max(src.width, src.height))
        out_w = max(1, int(round(src.width * scale)))
        out_h = max(1, int(round(src.height * scale)))
        sar = src.read(1, out_shape=(out_h, out_w), resampling=Resampling.average).astype(np.float32)

    with rasterio.open(mask_path) as src:
        mask = src.read(1, out_shape=(out_h, out_w), resampling=Resampling.nearest).astype(bool)

    valid = np.isfinite(sar)
    if valid.any():
        p1, p99 = np.percentile(sar[valid], [1, 99])
    else:
        p1, p99 = 0.0, 1.0

    norm = np.clip((sar - p1) / (p99 - p1 + 1e-6), 0, 1)
    norm[~valid] = 0
    gray = (norm * 255).astype(np.uint8)

    rgb = np.stack([gray, gray, gray], axis=-1).astype(np.float32)
    tint = rgb.copy()
    tint[mask] = [230.0, 66.0, 56.0]
    blended = (0.5 * rgb + 0.5 * tint).astype(np.uint8)

    Image.fromarray(blended).save(out_path)


def _region_confidence(prob_path: Path, mask_path: Path) -> float | None:
    if not prob_path.exists() or not mask_path.exists():
        return None
    with rasterio.open(prob_path) as src:
        prob = src.read(1)
    with rasterio.open(mask_path) as src:
        mask = src.read(1).astype(bool)
    if not mask.any():
        return None
    return float(round(prob[mask].mean() * 100, 1))


def _image_bounds_wgs84(image_path: Path) -> dict | None:
    """WGS84 lat/lon bounding box of the source raster, so the browser can
    place the quicklook image on a real map at its true location."""
    try:
        with rasterio.open(image_path) as src:
            west, south, east, north = transform_bounds(src.crs, "EPSG:4326", *src.bounds)
        return {
            "west": round(west, 6),
            "south": round(south, 6),
            "east": round(east, 6),
            "north": round(north, 6),
        }
    except Exception:
        traceback.print_exc()
        return None


# On a memory-constrained host, the tiled prediction loop in AI_MODULE's own
# predict.py holds several full-resolution float32 arrays at once (the raw
# image, its normalized copy, a running probability sum, etc.) — for a large
# scene that can be several hundred MB. Rather than editing the provided AI
# module to change that, we optionally shrink the *input* file first (a
# decimated read + rewrite, done here in the wrapper) so its own memory use
# stays bounded. Off by default (0) — only set MAX_IMAGE_DIMENSION where the
# host actually needs it (e.g. Render's free 512MB tier).
MAX_IMAGE_DIMENSION = int(os.environ.get("MAX_IMAGE_DIMENSION", "0")) or None


def _maybe_downsample_input(image_path: str, run_dir: Path) -> tuple[str, bool]:
    if not MAX_IMAGE_DIMENSION:
        return image_path, False

    with rasterio.open(image_path) as src:
        scale = min(1.0, MAX_IMAGE_DIMENSION / max(src.width, src.height))
        if scale >= 1.0:
            return image_path, False

        out_w = max(1, int(round(src.width * scale)))
        out_h = max(1, int(round(src.height * scale)))
        data = src.read(1, out_shape=(out_h, out_w), resampling=Resampling.average)

        profile = src.profile.copy()
        transform = src.transform * src.transform.scale(src.width / out_w, src.height / out_h)
        profile.update(width=out_w, height=out_h, transform=transform)

    downsampled_path = run_dir / "input_downsampled.tif"
    with rasterio.open(downsampled_path, "w", **profile) as dst:
        dst.write(data, 1)

    return str(downsampled_path), True


def _run_detection(image_path: str, run_dir: Path, threshold: float) -> dict:
    image_path, downsampled = _maybe_downsample_input(image_path, run_dir)

    result = run_detect_oil(image_path, str(run_dir), threshold)
    result["input_downsampled"] = downsampled

    quicklook_url = None
    mask_path = run_dir / "oil_mask.tif"
    prob_path = run_dir / "oil_probability.tif"

    if mask_path.exists():
        try:
            quicklook_path = run_dir / "quicklook.png"
            _quicklook(Path(image_path), mask_path, quicklook_path)
            quicklook_url = f"/runs/{run_dir.name}/quicklook.png"
        except Exception:
            traceback.print_exc()
            quicklook_url = None

    result["confidence_percent"] = _region_confidence(prob_path, mask_path)
    result["quicklook_url"] = quicklook_url
    result["image_bounds"] = _image_bounds_wgs84(Path(image_path))
    return result


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------

class ForecastRequest(BaseModel):
    latitude: float
    longitude: float
    wind_speed_mps: float = Field(6.0, ge=0, le=60)
    wind_direction_deg: float = Field(270.0, ge=0, lt=360)
    incident_id: str | None = None  # when set and the DB is configured, the forecast is saved against this incident


class ActionStatusUpdate(BaseModel):
    status: str


def _require_db():
    if db.engine is None:
        raise HTTPException(503, "No database configured (set DATABASE_URL in backend/.env) — this feature needs persistence.")


def _build_incident(result: dict, run_id: str) -> dict:
    """Turn a raw detection result into the incident shape the UI expects,
    keyed off the largest detected region."""
    top = result["regions"][0]
    area = result["probable_oil_area_km2"]
    confidence = result.get("confidence_percent") or result.get("predicted_coverage_percent") or 0
    ns = "N" if top["latitude"] >= 0 else "S"
    ew = "E" if top["longitude"] >= 0 else "W"
    return {
        "id": f"OG-{run_id[:6].upper()}",
        "location": f"{abs(top['latitude']):.3f}°{ns}, {abs(top['longitude']):.3f}°{ew}",
        "area_km2": area,
        "severity": "HIGH" if area > 20 else ("MEDIUM" if area > 5 else "LOW"),
        "confidence": round(confidence),
        "classification": "AI-detected probable oil sheen (Sentinel-1 SAR · U-Net segmentation)",
        "status": "MONITORING",
        "lat": top["latitude"],
        "lng": top["longitude"],
        "run_id": run_id,
    }


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------

@app.get("/")
def root():
    """This is the API server, not the website — it has no page of its own."""
    return {
        "message": "NAFT-GUARD API is running. This is the backend, not the website.",
        "website": "Open the frontend dev server instead (typically http://localhost:5173).",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "ai_module_dir": str(AI_MODULE_DIR),
        "model_weights": str(AI_MODULE_DIR / "models" / "oil_segmentation_model.pth"),
        "sample_scene_available": SAMPLE_TIF.exists(),
        "forecast_hours": FORECAST_HOURS,
        "default_threshold": DEFAULT_THRESHOLD,
        "database_connected": db.engine is not None,
    }


@app.get("/api/sample-scene")
def sample_scene():
    return {
        "id": "sample",
        "label": "Sentinel-1 SAR sample — 2018-09-26 (Gulf of Mexico)",
        "available": SAMPLE_TIF.exists(),
    }


@app.post("/api/detect")
async def api_detect(
    file: UploadFile = File(None),
    use_sample: bool = Form(False),
    threshold: float = Form(DEFAULT_THRESHOLD),
):
    run_id = uuid.uuid4().hex[:12]
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    if use_sample or file is None:
        if not SAMPLE_TIF.exists():
            raise HTTPException(400, "No file uploaded and the bundled sample scene was not found.")
        image_path = str(SAMPLE_TIF)
        source_name = SAMPLE_TIF.name
    else:
        suffix = Path(file.filename or "upload.tif").suffix or ".tif"
        image_path = str(run_dir / f"input{suffix}")
        with open(image_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        source_name = file.filename

    try:
        result = await run_in_threadpool(_run_detection, image_path, run_dir, threshold)
    except Exception as e:
        traceback.print_exc()
        shutil.rmtree(run_dir, ignore_errors=True)
        raise HTTPException(422, f"Detection failed: {e}")

    result["run_id"] = run_id
    result["source_image"] = source_name

    if result.get("oil_detected") and result.get("regions"):
        incident_fields = _build_incident(result, run_id)
        if db.engine is not None:
            with db.SessionLocal() as session:
                incident = db.Incident(**incident_fields)
                session.add(incident)
                session.add(db.Alert(
                    id=f"AL-{uuid.uuid4().hex[:8]}",
                    text=f"New detection confirmed — {incident_fields['area_km2']} km² estimated",
                    incident_id=incident.id,
                    lat=incident.lat, lng=incident.lng,
                ))
                session.commit()
                session.refresh(incident)
                result["incident"] = incident.to_dict()
        else:
            # No DB configured — return an ephemeral incident shape so the
            # frontend still behaves the same, it just won't persist.
            now = datetime.now(timezone.utc)
            result["incident"] = {
                "id": incident_fields["id"],
                "detectedAt": now.strftime("%H:%M"),
                "location": incident_fields["location"],
                "area": incident_fields["area_km2"],
                "severity": incident_fields["severity"],
                "confidence": incident_fields["confidence"],
                "classification": incident_fields["classification"],
                "status": incident_fields["status"],
                "lat": incident_fields["lat"],
                "lng": incident_fields["lng"],
                "runId": run_id,
            }

    return result


@app.post("/api/forecast")
async def api_forecast(req: ForecastRequest):
    try:
        result = await run_in_threadpool(
            forecast_spread,
            req.latitude,
            req.longitude,
            req.wind_speed_mps,
            req.wind_direction_deg,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(422, f"Forecast failed: {e}")

    if req.incident_id and db.engine is not None:
        with db.SessionLocal() as session:
            if session.get(db.Incident, req.incident_id) is not None:
                session.add(db.Forecast(
                    incident_id=req.incident_id,
                    wind_speed_mps=req.wind_speed_mps,
                    wind_direction_deg=req.wind_direction_deg,
                    payload=result,
                ))
                session.commit()

    return result


# --------------------------------------------------------------------------
# Persisted app state (incidents / alerts / response actions)
# --------------------------------------------------------------------------

@app.get("/api/state")
def api_state():
    _require_db()
    with db.SessionLocal() as session:
        incidents = session.scalars(
            select(db.Incident).order_by(db.Incident.detected_at.desc())
        ).all()
        alerts = session.scalars(
            select(db.Alert).order_by(db.Alert.time.desc())
        ).all()
        actions = session.scalars(select(db.ResponseAction)).all()
        state = session.get(db.SystemState, 1)

        return {
            "incidents": [i.to_dict() for i in incidents],
            "alerts": [a.to_dict() for a in alerts],
            "actions": [a.to_dict() for a in actions],
            "warningsIssued": state.warnings_issued if state else 0,
        }


@app.patch("/api/actions/{action_id}")
def api_update_action(action_id: str, body: ActionStatusUpdate):
    _require_db()
    with db.SessionLocal() as session:
        action = session.get(db.ResponseAction, action_id)
        if action is None:
            raise HTTPException(404, "Action not found")
        action.status = body.status
        session.commit()
        session.refresh(action)
        return action.to_dict()


@app.post("/api/incidents/{incident_id}/warning")
def api_issue_warning(incident_id: str):
    _require_db()
    with db.SessionLocal() as session:
        incident = session.get(db.Incident, incident_id)
        if incident is None:
            raise HTTPException(404, "Incident not found")

        incident.status = "WARNING ISSUED"

        alert = db.Alert(
            id=f"AL-{uuid.uuid4().hex[:8]}",
            text="Coastal warning issued to authorities",
            incident_id=incident.id,
            lat=incident.lat, lng=incident.lng,
        )
        session.add(alert)

        state = session.get(db.SystemState, 1)
        if state is None:
            state = db.SystemState(id=1, warnings_issued=0)
            session.add(state)
        state.warnings_issued += 1

        session.commit()
        session.refresh(incident)
        session.refresh(alert)

        return {
            "incident": incident.to_dict(),
            "alert": alert.to_dict(),
            "warningsIssued": state.warnings_issued,
        }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
