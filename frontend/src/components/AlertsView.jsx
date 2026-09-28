import { useQuery } from '@tanstack/react-query'
import { fetchAlerts } from '../api/alerts'

export function AlertsView() {
  const { data } = useQuery({ queryKey: ['alerts'], queryFn: fetchAlerts })
  const alerts = data ?? []

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <h2 className="mb-3 text-[15px] font-semibold text-ink">Upcoming &amp; overdue</h2>
      {alerts.length === 0 ? (
        <div className="py-6 text-center text-off">No alerts — all vehicles up to date.</div>
      ) : (
        alerts.map((a, i) => (
          <div key={i} className="flex items-center justify-between gap-3 border-b border-[#f0f0f0] py-2.5 last:border-0">
            <div>
              <div className="text-sm font-medium text-ink">{a.vehicle}</div>
              <div className="mt-0.5 text-xs text-off">{a.title} — {a.sub}</div>
            </div>
            <span className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + (a.overdue ? 'bg-due-bg text-due' : 'bg-warn-bg text-warn')}>
              {a.overdue ? 'Overdue' : 'Due soon'}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
