import { useMemo, useState } from 'react'
import { Search, ArrowUpDown } from 'lucide-react'
import { useApp } from '../../context/AppState'

const SEVERITY_ORDER = { HIGH: 3, MEDIUM: 2, LOW: 1 }

export default function Incidents({ goTo }) {
  const { incidents, focusIncident } = useApp()
  const [query, setQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [sortKey, setSortKey] = useState('detectedAt')
  const [sortDir, setSortDir] = useState('desc')

  const filtered = useMemo(() => {
    let rows = incidents.filter((i) => {
      const q = query.trim().toLowerCase()
      const matchesQuery = !q || i.id.toLowerCase().includes(q) || i.location.toLowerCase().includes(q)
      const matchesSeverity = severityFilter === 'ALL' || i.severity === severityFilter
      return matchesQuery && matchesSeverity
    })
    rows = [...rows].sort((a, b) => {
      let av = a[sortKey]
      let bv = b[sortKey]
      if (sortKey === 'severity') { av = SEVERITY_ORDER[av]; bv = SEVERITY_ORDER[bv] }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return rows
  }, [incidents, query, severityFilter, sortKey, sortDir])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const columns = [
    ['id', 'Incident ID'], ['detectedAt', 'Detected'], ['location', 'Location'],
    ['area', 'Area (km²)'], ['severity', 'Severity'], ['confidence', 'Confidence'], ['status', 'Status'],
  ]

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Case Log</span>
          <h2>Incidents</h2>
        </div>
        <div className="table-controls">
          <div className="search-box">
            <Search size={14} />
            <input placeholder="Search ID or location" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
            <option value="ALL">All severities</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th key={key} onClick={() => toggleSort(key)}>
                  {label} <ArrowUpDown size={12} className={sortKey === key ? 'sort-active' : ''} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} onClick={() => { focusIncident(i.id); goTo && goTo('overview') }}>
                <td className="mono">{i.id}</td>
                <td>{i.detectedAt}</td>
                <td>{i.location}</td>
                <td>{i.area}</td>
                <td><span className={`sev-tag sev-${i.severity.toLowerCase()}`}>{i.severity}</span></td>
                <td>{i.confidence}%</td>
                <td>{i.status}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="empty-row">No incidents match this search.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
