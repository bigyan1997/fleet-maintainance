import { useQuery } from '@tanstack/react-query'
import { fetchDashboard } from '../api/dashboard'
import { STATUS_STYLES } from '../lib/serviceStatus'
import { StatusSelect } from './StatusSelect'

function Metric({ label, value, color }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="mb-1 text-xs text-off">{label}</div>
      <div className={'text-2xl font-semibold ' + (color ?? 'text-ink')}>{value}</div>
    </div>
  )
}

function StatusTile({ status, count, onClick }) {
  return (
    <button onClick={onClick} className={'rounded-lg border p-3 text-left hover:brightness-95 ' + STATUS_STYLES[status]}>
      <div className="mb-1 text-xs font-medium">{status}</div>
      <div className="text-2xl font-semibold">{count}</div>
    </button>
  )
}

export function DashboardView({ onOpenService, onGoTo, onShowStatus, onError }) {
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })
  if (!data) return null

  return (
    <div>
      <h2 className="mb-2 text-[15px] font-semibold text-ink">Service status</h2>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.statusCounts.map((c) => (
          <StatusTile key={c.status} status={c.status} count={c.count} onClick={() => onShowStatus(c.status)} />
        ))}
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Vehicles" value={data.vehicleCount} />
        <Metric label="Services logged" value={data.serviceCount} />
        <Metric label="Due / overdue" value={data.dueCount} color="text-due" />
        <Metric label="Open incidents" value={data.openIncidentCount} color="text-due" />
        <Metric label="Total spend" value={`$${Number(data.totalSpend).toLocaleString()}`} />
      </div>
      <div className="mb-5 rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Jobs in progress</h2>
        {data.inProgressServices.length === 0 ? (
          <div className="py-6 text-center text-off">Nothing in progress — every job is invoiced</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-xs text-off">
                  <th className="px-2 py-2 text-left font-medium">Vehicle</th>
                  <th className="px-2 py-2 text-left font-medium">Type</th>
                  <th className="px-2 py-2 text-left font-medium">Date</th>
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.inProgressServices.map((s) => (
                  <tr key={s.id} className="cursor-pointer border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]" onClick={() => onOpenService(s)}>
                    <td className="px-2 py-2">{s.vehicleLabel}</td>
                    <td className="px-2 py-2">{s.service_type}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{s.date}</td>
                    <td className="px-2 py-2"><StatusSelect service={s} onError={onError} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="rounded-lg border border-line bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Recent services</h2>
          <button onClick={() => onGoTo('history')} className="text-xs font-medium text-primary hover:underline">View all</button>
        </div>
        {data.recentServices.length === 0 ? (
          <div className="py-6 text-center text-off">No services logged yet</div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-xs text-off">
                <th className="px-2 py-2 text-left font-medium">Vehicle</th>
                <th className="px-2 py-2 text-left font-medium">Type</th>
                <th className="px-2 py-2 text-left font-medium">Date</th>
                <th className="px-2 py-2 text-left font-medium">Status</th>
                <th className="px-2 py-2 text-left font-medium">Odometer</th>
                <th className="px-2 py-2 text-left font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.recentServices.map((s) => (
                <tr key={s.id} className="cursor-pointer border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]" onClick={() => onOpenService(s)}>
                  <td className="px-2 py-2">{s.vehicleLabel}</td>
                  <td className="px-2 py-2">{s.service_type}</td>
                  <td className="px-2 py-2">{s.date}</td>
                  <td className="px-2 py-2">
                    <span className={'inline-block rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ' + (STATUS_STYLES[s.status] ?? '')}>{s.status}</span>
                  </td>
                  <td className="px-2 py-2">{s.odometer ? `${s.odometer.toLocaleString()} km` : '—'}</td>
                  <td className="px-2 py-2">{s.cost ? `$${s.cost}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
