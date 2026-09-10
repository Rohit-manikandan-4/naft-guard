import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { RISK_ZONES } from '../../data/mockData'
import EarlyWarning from '../EarlyWarning'

export default function Risk({ goTo }) {
  const [openId, setOpenId] = useState(RISK_ZONES[0].id)

  return (
    <div className="stack-layout">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Exposure Analysis</span>
            <h2>Risk Assessment by Category</h2>
          </div>
        </div>

        <div className="risk-list">
          {RISK_ZONES.map((r) => (
            <div key={r.id} className={openId === r.id ? 'risk-row open' : 'risk-row'}>
              <button className="risk-row-head" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                <span className="risk-name">{r.name}</span>
                <span className={`risk-level level-${r.level.toLowerCase()}`}>{r.level}</span>
                <ChevronDown size={16} className="chev" />
              </button>
              {openId === r.id && <p className="risk-detail">{r.detail}</p>}
            </div>
          ))}
        </div>
      </section>

      <EarlyWarning goTo={goTo} />
    </div>
  )
}
