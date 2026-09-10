import { Bell, Database, Moon, Sun, UserRound, Waves } from 'lucide-react'
import { SYSTEM_STATUS } from '../data/mockData'
import { useApp } from '../context/AppState'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'detection', label: 'Spill Detection' },
  { id: 'prediction', label: 'Spread Prediction' },
  { id: 'risk', label: 'Risk Assessment' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'response', label: 'Status' },
  { id: 'reports', label: 'Reports' },
]

export default function Header({ active, onChange }) {
  const { alerts, warningsIssued, activeIncident, theme, toggleTheme, persisted } = useApp()

  return (
    <header className="app-header">
      <div className="header-top">
        <div className="brand">
          <span className="brand-mark"><Waves size={18} strokeWidth={2.2} /></span>
          <div className="brand-text">
            <span className="brand-name">NAFT-GUARD</span>
            <span className="brand-sub">Oil Spill Spread Detection &amp; Early Warning System</span>
          </div>
        </div>

        <nav className="header-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={active === t.id ? 'htab active' : 'htab'}
              onClick={() => onChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <span className="status-pill">
            <i className="status-dot" /> System Online
          </span>
          <span
            className={persisted ? 'status-pill' : 'status-pill warn'}
            title={persisted ? 'Incidents, alerts and actions are saved to the database.' : 'No database connected — data resets on refresh.'}
          >
            <Database size={12} /> {persisted ? 'Database Connected' : 'Local Only'}
          </span>
          <button className="icon-btn" title={`${alerts.length} alerts logged`}>
            <Bell size={17} />
            {alerts.length > 0 && <span className="badge">{alerts.length}</span>}
          </button>
          <button
            className="icon-btn"
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="icon-btn avatar" title="Response Officer"><UserRound size={17} /></button>
        </div>
      </div>

      <div className="header-strip">
        <span>Stations {SYSTEM_STATUS.stationsOnline}/{SYSTEM_STATUS.stationsTotal}</span>
        <span className="sep" />
        <span>
          Coordinates {activeIncident ? `${activeIncident.lat.toFixed(2)}°N, ${activeIncident.lng.toFixed(2)}°E` : '—'}
        </span>
        <span className="sep" />
        <span>Warnings issued {warningsIssued}</span>
        <span className="sep" />
        <span>Last satellite pass {SYSTEM_STATUS.lastSatelliteUpdate}</span>
      </div>
    </header>
  )
}
