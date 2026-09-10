import { TriangleAlert, Megaphone, FileText, CircleCheck } from 'lucide-react'
import { useApp } from '../context/AppState'

export default function EarlyWarning({ goTo }) {
  const { warningStatus, issueWarning, horizon, activeIncident, predictionMeta } = useApp()
  const meta = predictionMeta[horizon]

  return (
    <section className="panel warning-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Early Warning</span>
          <h2>High Risk — Coastal Impact Likely</h2>
        </div>
        <span className="status-flag danger"><TriangleAlert size={13} /> High risk</span>
      </div>

      <p className="warning-copy">
        Predicted spill movement may affect the nearby coastal region within approximately {meta.arrival === '—' ? '12 hours' : meta.arrival}.
        This assessment is based on the current drift model for incident {activeIncident.id}.
      </p>

      <div className="kv-grid">
        <div><label>Estimated coastal arrival</label><strong>{meta.arrival}</strong></div>
        <div><label>Distance to coastline</label><strong>{meta.distance}</strong></div>
        <div><label>Predicted affected area</label><strong>{activeIncident.area} km²</strong></div>
        <div><label>Confidence</label><strong>{meta.confidence != null ? `${meta.confidence}%` : `${activeIncident.confidence}%`}</strong></div>
        <div><label>Risk level</label><strong className="sev sev-high">HIGH</strong></div>
      </div>

      <div className="warning-actions">
        {warningStatus === 'READY' ? (
          <button className="btn-primary" onClick={issueWarning}>
            <Megaphone size={16} /> Issue Warning
          </button>
        ) : (
          <span className="status-flag ok"><CircleCheck size={14} /> Warning issued</span>
        )}
        <button className="btn-secondary" onClick={() => goTo && goTo('response')}>
          <FileText size={15} /> View Response Plan
        </button>
      </div>
    </section>
  )
}
