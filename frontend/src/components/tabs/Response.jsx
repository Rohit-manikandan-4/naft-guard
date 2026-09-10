import { useApp } from '../../context/AppState'

const STATUS_FLOW = ['PENDING', 'IN_PROGRESS', 'COMPLETED']
const STATUS_LABEL = { PENDING: 'Pending', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed' }

export default function Response() {
  const { actions, updateActionStatus } = useApp()

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">AI-Assisted Recommendations</span>
          <h2>Response Planning</h2>
        </div>
      </div>

      <div className="response-list">
        {actions.map((a) => (
          <div key={a.id} className="response-row">
            <div className="response-main">
              <span className={`priority-tag pr-${a.priority.toLowerCase()}`}>{a.priority}</span>
              <div>
                <strong>{a.title}</strong>
                <p>{a.reason}</p>
              </div>
            </div>
            <div className="response-status">
              {STATUS_FLOW.map((s) => (
                <button
                  key={s}
                  className={a.status === s ? 'status-chip active' : 'status-chip'}
                  onClick={() => updateActionStatus(a.id, s)}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
