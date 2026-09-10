import { useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import MapView from '../MapView'
import { useApp } from '../../context/AppState'

export default function Prediction() {
  const {
    horizon, setHorizon, horizons, activeIncident, detection, forecast, forecasting, forecastError,
    runForecast, windSpeed, setWindSpeed, windDirection, setWindDirection, predictionMeta, conditions,
  } = useApp()

  const meta = predictionMeta[horizon]
  const region = detection?.regions?.[0]

  const series = useMemo(() => {
    if (!forecast) return [{ t: '0h', distance: 0 }]
    return [
      { t: '0h', distance: 0 },
      ...forecast.forecast.map((f) => ({ t: `${f.hours}h`, distance: f.distance_km })),
    ]
  }, [forecast])

  const recalc = () => {
    const lat = region?.latitude ?? activeIncident?.lat
    const lon = region?.longitude ?? activeIncident?.lng
    if (lat != null && lon != null) runForecast(lat, lon, windSpeed, windDirection)
  }

  return (
    <div className="split-layout">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Drift Forecast · Wind + Ocean Current Model</span>
            <h2>Predicted Spread Distance Over Time</h2>
          </div>
          <div className="segmented">
            {horizons.map((r) => (
              <button key={r} className={horizon === r ? 'seg active' : 'seg'} onClick={() => setHorizon(r)}>{r}</button>
            ))}
          </div>
        </div>

        <div className="chart-frame">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#1c2f2c" vertical={false} />
              <XAxis dataKey="t" stroke="#7c948d" fontSize={12} tickLine={false} axisLine={{ stroke: '#25423d' }} />
              <YAxis stroke="#7c948d" fontSize={12} tickLine={false} axisLine={{ stroke: '#25423d' }} unit=" km" width={64} />
              <Tooltip contentStyle={{ background: '#0f201d', border: '1px solid #234641', borderRadius: 6, fontSize: 13 }} labelStyle={{ color: '#cfe4de' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9fb5ae' }} />
              <Line type="monotone" dataKey="distance" name="Predicted drift distance" stroke="#f2a93b" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {!forecast && (
          <p className="note">Run a scan in the Spill Detection tab first — the drift model forecasts spread from a detected location.</p>
        )}
        {forecastError && <p className="note" style={{ color: '#e2534d' }}>{forecastError}</p>}

        <div className="metric-strip">
          <div><label>Spill area</label><strong>{detection?.probable_oil_area_km2 ?? activeIncident?.area ?? '—'} km²</strong></div>
          <div><label>Drift distance ({horizon})</label><strong>{meta.distanceKm != null ? `${meta.distanceKm} km` : '—'}</strong></div>
          <div><label>Spread direction</label><strong>{meta.direction}</strong></div>
          <div><label>Drift velocity</label><strong>{meta.velocity}</strong></div>
          <div><label>Est. coastal arrival</label><strong>{meta.arrival}</strong></div>
        </div>

        <div className="panel-head" style={{ marginTop: 18 }}>
          <div>
            <span className="eyebrow">Forecast Inputs</span>
            <h2>Wind Conditions</h2>
          </div>
        </div>

        <div className="field-row">
          <label className="field">
            Wind speed (m/s)
            <input
              type="number" min="0" max="40" step="0.5" value={windSpeed}
              onChange={(e) => setWindSpeed(parseFloat(e.target.value) || 0)}
            />
          </label>
          <label className="field">
            Wind direction (° — coming from)
            <input
              type="number" min="0" max="359" step="5" value={windDirection}
              onChange={(e) => setWindDirection(parseFloat(e.target.value) || 0)}
            />
          </label>
          <button className="btn-secondary" onClick={recalc} disabled={forecasting}>
            {forecasting ? 'Recalculating…' : 'Recalculate Forecast'}
          </button>
        </div>
      </section>

      <aside className="panel side-panel">
        <div className="side-block map-mini">
          <span className="eyebrow">Forecast Boundary</span>
          <MapView horizon={horizon} />
        </div>
        <div className="side-block">
          <span className="eyebrow">Environmental Conditions</span>
          <div className="kv-grid">
            <div><label>Wind direction</label><strong>{conditions.windDirection}</strong></div>
            <div><label>Wind speed</label><strong>{conditions.windSpeed}</strong></div>
            <div><label>Ocean current</label><strong>{conditions.current}</strong></div>
            <div><label>Distance to coast</label><strong>{meta.distanceToCoastKm != null ? `${meta.distanceToCoastKm} km` : '—'}</strong></div>
          </div>
        </div>
      </aside>
    </div>
  )
}
