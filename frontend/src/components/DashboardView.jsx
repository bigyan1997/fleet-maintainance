import { useQuery } from '@tanstack/react-query'
import { fetchDashboard } from '../api/dashboard'

function Metric({ label, value, color }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="mb-1 text-xs text-off">{label}</div>
      <div className={'text-2xl font-semibold ' + (color ?? 'text-ink')}>{value}</div>
    </div>
  )
}

export function DashboardView({ onOpenService, onGoTo }) {
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })
  if (!data) return null

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Vehicles" value={data.vehicleCount} />
        <Metric label="Services logged" value={data.serviceCount} />
        <Metric label="Due / overdue" value={data.dueCount} color="text-due" />
        <Metric label="Open incidents" value={data.openIncidentCount} color="text-due" />
        <Metric label="Total spend" value={`$${Number(data.totalSpend).toLocaleString()}`} />
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
