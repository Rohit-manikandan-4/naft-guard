import { useState } from 'react'
import { MapContainer, TileLayer, Circle, Popup, Polyline } from 'react-leaflet'
import { useApp } from '../context/AppState'
import { areaKm2ToRadiusKm } from '../lib/geo'

// Same visual language as the Overview/Prediction map: detected regions as
// red circles (sized by area) and the drift forecast as a dashed orange
// path, over the plain satellite basemap — no raw grayscale SAR overlay,
// which gets unreadable once there are more than a handful of regions.
export default function DetectionMap({ bounds, regions = [] }) {
  const { driftForecastPoints, horizon } = useApp()
  const [layers, setLayers] = useState({ slick: true, forecast: true })
  const toggle = (key) => setLayers((l) => ({ ...l, [key]: !l[key] }))

  if (!bounds || !regions.length) return null

  const leafletBounds = [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  ]

  const horizonHours = parseInt(horizon, 10)
  const selectedPoint = driftForecastPoints?.find((p) => p.hours === horizonHours)
  const driftPath = driftForecastPoints?.map((p) => [p.lat, p.lng])

  return (
    <div className="map-shell">
      <MapContainer
        bounds={leafletBounds}
        className="leaflet-instance"
        scrollWheelZoom
        zoomControl
      >
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />

        {layers.slick && regions.map((r) => (
          <Circle
            key={r.region_id}
            center={[r.latitude, r.longitude]}
            radius={Math.max(areaKm2ToRadiusKm(r.area_km2), 0.15) * 1000}
            pathOptions={{
              color: '#e2534d', fillColor: '#e2534d',
              fillOpacity: r.region_id === 1 ? 0.45 : 0.25,
              weight: r.region_id === 1 ? 2 : 1,
            }}
          >
            <Popup>
              Region #{r.region_id} — {r.area_km2} km²<br />
              {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
            </Popup>
          </Circle>
        ))}

        {layers.forecast && driftForecastPoints && (
          <>
            <Polyline positions={driftPath} pathOptions={{ color: '#f2a93b', weight: 2, dashArray: '6 5' }} />
            {selectedPoint && (
              <Circle
                center={[selectedPoint.lat, selectedPoint.lng]}
                radius={Math.max(selectedPoint.radiusKm, 0.15) * 1000}
                pathOptions={{ color: '#f2a93b', fillColor: '#f2a93b', fillOpacity: 0.15, weight: 2, dashArray: '6 5' }}
              >
                <Popup>Predicted position — +{selectedPoint.hours}h</Popup>
              </Circle>
            )}
          </>
        )}
      </MapContainer>

      <div className="map-overlay-controls">
        <button className={layers.slick ? 'chip active' : 'chip'} onClick={() => toggle('slick')}>Slick</button>
        <button className={layers.forecast ? 'chip active' : 'chip'} onClick={() => toggle('forecast')}>Forecast</button>
      </div>
    </div>
  )
}
