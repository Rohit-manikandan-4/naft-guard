import { AlertTriangle, ArrowUpRight } from 'lucide-react'
import MapView from '../MapView'
import { useApp } from '../../context/AppState'

export default function Overview({ goTo }) {
  const { activeIncident, mapFocus, horizon, incidents } = useApp()

  return (
    <div className="split-layout">
      <section className="panel map-card">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Marine Scene</span>
            <h2>Gulf of Mexico, Louisiana Offshore Sector</h2>
          </div>
          <span className="status-flag warn"><AlertTriangle size={13} /> Active spill in view</span>
        </div>
        <MapView focus={mapFocus} horizon={horizon} />
      </section>

      <aside className="panel side-panel">
        <div className="side-block">
          <span className="eyebrow">Incident Case</span>
          <h3>{activeIncident.id}</h3>
          <div className="kv-grid">
            <div><label>Detected</label><strong>{activeIncident.detectedAt}</strong></div>
            <div><label>Location</label><strong>{activeIncident.location}</strong></div>
            <div><label>Est. area</label><strong>{activeIncident.area} km²</strong></div>
            <div><label>Confidence</label><strong>{activeIncident.confidence}%</strong></div>
            <div><label>Severity</label><strong className={`sev sev-${activeIncident.severity.toLowerCase()}`}>{activeIncident.severity}</strong></div>
            <div><label>Status</label><strong>{activeIncident.status}</strong></div>
          </div>
          <button className="link-btn" onClick={() => goTo('incidents')}>
            View all incidents <ArrowUpRight size={14} />
          </button>
        </div>

        <div className="side-block">
          <span className="eyebrow">Open Cases</span>
          <ul className="mini-list">
            {incidents.slice(0, 4).map((i) => (
              <li key={i.id}>
                <span>{i.id}</span>
                <span className={`sev-tag sev-${i.severity.toLowerCase()}`}>{i.severity}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="side-block callout">
          <p>Predicted drift may reach the coastline within the current forecast window.</p>
          <button className="btn-secondary" onClick={() => goTo('prediction')}>Open Spread Prediction</button>
        </div>
      </aside>
    </div>
  )
}
