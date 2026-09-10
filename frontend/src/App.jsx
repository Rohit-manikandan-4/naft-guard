import { useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { AppProvider, useApp } from './context/AppState'
import Header from './components/Header'
import Overview from './components/tabs/Overview'
import Detection from './components/tabs/Detection'
import Prediction from './components/tabs/Prediction'
import Risk from './components/tabs/Risk'
import Alerts from './components/tabs/Alerts'
import Incidents from './components/tabs/Incidents'
import Response from './components/tabs/Response'
import Reports from './components/tabs/Reports'
import './styles.css'

function Shell() {
  const [active, setActive] = useState('overview')
  const { toast, theme } = useApp()

  const views = {
    overview: <Overview goTo={setActive} />,
    detection: <Detection />,
    prediction: <Prediction />,
    risk: <Risk goTo={setActive} />,
    alerts: <Alerts goTo={setActive} />,
    incidents: <Incidents goTo={setActive} />,
    response: <Response />,
    reports: <Reports />,
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <Header active={active} onChange={setActive} />
      <main className="app-main">{views[active]}</main>
      <footer className="app-footer">
        <span>NAFT-GUARD — Marine Environmental Intelligence Platform</span>
        <span>Demo data · not for operational decision-making</span>
        <span className="credit">By Team TechLADS</span>
      </footer>
      {toast && (
        <div className="toast"><CircleCheck size={16} /> {toast}</div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
