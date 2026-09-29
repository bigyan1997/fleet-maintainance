import { useQuery } from '@tanstack/react-query'
import { fetchDashboard } from '../api/dashboard'
import { STATUS_STYLES } from '../lib/serviceStatus'
import { useSort } from '../lib/useSort'
import { StatusSelect } from './StatusSelect'
import { fmtDate } from '../lib/formatDate'

const SORT_TYPES = { status: 'status', odometer: 'number', cost: 'number' }

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

// Clickable column header, same look as NPD Tracker's: ▲/▼ on the active column.
function SortTh({ label, col, sort }) {
  return (
    <th className="cursor-pointer px-2 py-2 text-left font-medium select-none hover:text-ink" onClick={() => sort.onSort(col)}>
      {label}
      {sort.sortKey === col && <span className="ml-1">{sort.sortDir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )
}

function JobsInProgress({ rows, onOpenService, onError }) {
  const sort = useSort(rows, SORT_TYPES)
  return (
    <div className="mb-5 rounded-lg border border-line bg-white p-4">
      <h2 className="mb-3 text-[15px] font-semibold text-ink">Jobs in progress</h2>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-off">Nothing in progress — every job is invoiced</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-xs text-off">
                <SortTh label="Vehicle" col="vehicleLabel" sort={sort} />
                <SortTh label="Type" col="service_type" sort={sort} />
                <SortTh label="Date" col="date" sort={sort} />
                <SortTh label="Status" col="status" sort={sort} />
              </tr>
            </thead>
            <tbody>
              {sort.sorted.map((s) => (
                <tr key={s.id} className="cursor-pointer border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]" onClick={() => onOpenService(s)}>
                  <td className="px-2 py-2">{s.vehicleLabel}</td>
                  <td className="px-2 py-2">
                    {s.service_type}
                    {s.issues && <div className="mt-0.5 max-w-[320px] text-xs whitespace-pre-wrap text-warn">⚠ {s.issues}</div>}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{fmtDate(s.date)}</td>
                  <td className="px-2 py-2"><StatusSelect service={s} onError={onError} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RecentServices({ rows, onOpenService, onGoTo }) {
  const sort = useSort(rows, SORT_TYPES)
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">Recent services</h2>
        <button onClick={() => onGoTo('history')} className="text-xs font-medium text-primary hover:underline">View all</button>
      </div>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-off">No services logged yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-xs text-off">
                <SortTh label="Vehicle" col="vehicleLabel" sort={sort} />
                <SortTh label="Type" col="service_type" sort={sort} />
                <SortTh label="Date" col="date" sort={sort} />
                <SortTh label="Status" col="status" sort={sort} />
                <SortTh label="Odometer" col="odometer" sort={sort} />
                <SortTh label="Cost" col="cost" sort={sort} />
              </tr>
            </thead>
            <tbody>
              {sort.sorted.map((s) => (
                <tr key={s.id} className="cursor-pointer border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]" onClick={() => onOpenService(s)}>
                  <td className="px-2 py-2">{s.vehicleLabel}</td>
                  <td className="px-2 py-2">{s.service_type}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{fmtDate(s.date)}</td>
                  <td className="px-2 py-2">
                    <span className={'inline-block rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ' + (STATUS_STYLES[s.status] ?? '')}>{s.status}</span>
                  </td>
                  <td className="px-2 py-2">{s.odometer ? `${s.odometer.toLocaleString()} km` : '—'}</td>
                  <td className="px-2 py-2">{s.cost ? `$${s.cost}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
      <JobsInProgress rows={data.inProgressServices} onOpenService={onOpenService} onError={onError} />
      <RecentServices rows={data.recentServices} onOpenService={onOpenService} onGoTo={onGoTo} />
    </div>
  )
}
