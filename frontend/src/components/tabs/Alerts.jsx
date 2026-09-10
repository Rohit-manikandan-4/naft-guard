import { Radio } from 'lucide-react'
import { useApp } from '../../context/AppState'

export default function Alerts({ goTo }) {
  const { alerts, focusAlert } = useApp()

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Alert Center</span>
          <h2>Incident Timeline</h2>
        </div>
      </div>

      <ul className="alert-timeline">
        {alerts.map((a) => (
          <li key={a.id}>
            <button
              className="alert-item"
              onClick={() => { focusAlert(a); goTo && goTo('overview') }}
            >
              <span className="alert-time">{a.time}</span>
              <span className="alert-dot"><Radio size={12} /></span>
              <span className="alert-text">{a.text}</span>
              <span className="alert-inc">{a.incidentId}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
