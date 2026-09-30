import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchAlerts } from '../api/alerts'

const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'overdue', label: 'Overdue', match: (a) => a.overdue },
  { key: 'upcoming', label: 'Upcoming', match: (a) => !a.overdue },
]

// Rego/insurance alerts count days; service/tyre alerts count km.
function howFar(a) {
  const n = Math.abs(a.days_or_km_left).toLocaleString()
  const unit = a.title.includes('expires') ? (Math.abs(a.days_or_km_left) === 1 ? 'day' : 'days') : 'km'
  return a.overdue ? `${n} ${unit} overdue` : `${n} ${unit} left`
}

export function AlertsView() {
  const { data } = useQuery({ queryKey: ['alerts'], queryFn: fetchAlerts })
  const [filter, setFilter] = useState('all')
  // Overdue first, then whatever is closest to due.
  const alerts = [...(data ?? [])].sort((a, b) => (b.overdue - a.overdue) || (a.days_or_km_left - b.days_or_km_left))
  const shown = alerts.filter(FILTERS.find((f) => f.key === filter).match)

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Upcoming &amp; overdue</h2>
        <div className="flex gap-1 rounded-md border border-line p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={
                'rounded px-3 py-1 text-xs font-medium ' +
                (filter === f.key ? 'bg-primary text-white' : 'text-off hover:bg-[#f5f5f5] hover:text-ink')
              }
            >
              {f.label} ({alerts.filter(f.match).length})
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="py-6 text-center text-off">
          {alerts.length === 0 ? 'No alerts — all vehicles up to date.' : `No ${filter} alerts.`}
        </div>
      ) : (
        shown.map((a, i) => (
          <div key={i} className="flex items-center justify-between gap-3 border-b border-[#f0f0f0] py-2.5 last:border-0">
            <div>
              <div className="text-sm font-medium text-ink">{a.vehicle}</div>
              <div className="mt-0.5 text-xs text-off">{a.title} — {a.sub}</div>
            </div>
            <div className="shrink-0 text-right">
              <span className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + (a.overdue ? 'bg-due-bg text-due' : 'bg-warn-bg text-warn')}>
                {a.overdue ? 'Overdue' : 'Due soon'}
              </span>
              <div className="mt-1 text-[11px] text-off">{howFar(a)}</div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
