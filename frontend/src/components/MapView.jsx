import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polygon, Circle, Marker, Popup, useMap, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { Leaf } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  SCENE_CENTER, COASTLINE, SENSITIVE_AREAS,
  SPILL_POLYGON, PREDICTED_POLYGON,
} from '../data/mockData'
import { useApp } from '../context/AppState'

function icon(node, color) {
  const html = renderToStaticMarkup(
    <span style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 22, height: 22, borderRadius: '50%', background: '#0d1a18',
      border: `2px solid ${color}`, color,
    }}>{node}</span>,
  )
  return L.divIcon({ html, className: 'og-marker', iconSize: [22, 22], iconAnchor: [11, 11] })
}

const sensitiveIcon = icon(<Leaf size={12} />, '#7fbf8f')

function FocusHandler({ focus }) {
  const map = useMap()
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], 9, { duration: 0.8 })
  }, [focus, map])
  return null
}

export default function MapView({ focus, onSelectSpill, onSelectPrediction, horizon = '6h' }) {
  const [layers, setLayers] = useState({ spill: true, forecast: true, sensitive: true })
  const { spillRegions, driftForecastPoints } = useApp()

  const toggle = (key) => setLayers((l) => ({ ...l, [key]: !l[key] }))

  const fallbackPredicted = useMemo(() => PREDICTED_POLYGON[horizon] || PREDICTED_POLYGON['6h'], [horizon])
  const horizonHours = parseInt(horizon, 10)
  const selectedPoint = driftForecastPoints?.find((p) => p.hours === horizonHours)
  const driftPath = driftForecastPoints?.map((p) => [p.lat, p.lng])

  const center = spillRegions?.[0] ? [spillRegions[0].lat, spillRegions[0].lng] : SCENE_CENTER

  return (
    <div className="map-shell">
      <MapContainer
        center={center}
        zoom={8}
        scrollWheelZoom
        className="leaflet-instance"
        zoomControl={false}
      >
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />

        <FocusHandler focus={focus} />

        <Polyline positions={COASTLINE} pathOptions={{ color: '#3a4f4b', weight: 3 }} />

        {layers.spill && (
          spillRegions ? (
            spillRegions.map((r) => (
              <Circle
                key={r.id}
                center={[r.lat, r.lng]}
                radius={Math.max(r.radiusKm, 0.15) * 1000}
                pathOptions={{
                  color: '#e2534d', fillColor: '#e2534d',
                  fillOpacity: r.id === 1 ? 0.4 : 0.25, weight: r.id === 1 ? 2 : 1,
                }}
                eventHandlers={{ click: () => onSelectSpill && onSelectSpill() }}
              >
                <Popup>AI-detected region #{r.id} — {r.areaKm2} km²</Popup>
              </Circle>
            ))
          ) : (
            <Polygon
              positions={SPILL_POLYGON}
              pathOptions={{ color: '#e2534d', fillColor: '#e2534d', fillOpacity: 0.35, weight: 2 }}
              eventHandlers={{ click: () => onSelectSpill && onSelectSpill() }}
            >
              <Popup>Detected slick boundary — click for case details</Popup>
            </Polygon>
          )
        )}

        {layers.forecast && (
          driftForecastPoints ? (
            <>
              <Polyline positions={driftPath} pathOptions={{ color: '#f2a93b', weight: 2, dashArray: '6 5' }} />
              {selectedPoint && (
                <Circle
                  center={[selectedPoint.lat, selectedPoint.lng]}
                  radius={Math.max(selectedPoint.radiusKm, 0.15) * 1000}
                  pathOptions={{ color: '#f2a93b', fillColor: '#f2a93b', fillOpacity: 0.15, weight: 2, dashArray: '6 5' }}
                  eventHandlers={{ click: () => onSelectPrediction && onSelectPrediction() }}
                >
                  <Popup>Predicted position — +{selectedPoint.hours}h</Popup>
                </Circle>
              )}
            </>
          ) : (
            <Polygon
              positions={fallbackPredicted}
              pathOptions={{ color: '#f2a93b', fillColor: '#f2a93b', fillOpacity: 0.12, weight: 2, dashArray: '6 5' }}
              eventHandlers={{ click: () => onSelectPrediction && onSelectPrediction() }}
            >
              <Popup>Predicted spread — {horizon} horizon</Popup>
            </Polygon>
          )
        )}

        {layers.sensitive && SENSITIVE_AREAS.map((a) => (
          <Marker key={a.id} position={[a.lat, a.lng]} icon={sensitiveIcon}>
            <Popup><strong>{a.name}</strong><br />{a.type}</Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="map-overlay-controls">
        <button className={layers.spill ? 'chip active' : 'chip'} onClick={() => toggle('spill')}>Slick</button>
        <button className={layers.forecast ? 'chip active' : 'chip'} onClick={() => toggle('forecast')}>Forecast</button>
        <button className={layers.sensitive ? 'chip active' : 'chip'} onClick={() => toggle('sensitive')}>Sensitive Areas</button>
      </div>
    </div>
  )
}
