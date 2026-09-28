import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchVehicles } from '../api/vehicles'
import { fetchAnalytics } from '../api/analytics'
import { BarList } from './charts/BarList'
import { LineChart } from './charts/LineChart'

function Metric({ label, value, color }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="mb-1 text-xs text-off">{label}</div>
      <div className={'text-2xl font-semibold ' + (color ?? 'text-ink')}>{value}</div>
    </div>
  )
}

function money(n) {
  return `$${Number(n).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`
}

export function AnalyticsView() {
  const [vehicle, setVehicle] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const vehiclesQuery = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const filters = { vehicle: vehicle || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined }
  const { data } = useQuery({ queryKey: ['analytics', filters], queryFn: () => fetchAnalytics(filters) })

  const clearFilters = () => { setVehicle(''); setDateFrom(''); setDateTo('') }
  const rangeLabel = dateFrom || dateTo ? 'selected range' : 'last 12 months'
  const selectedVehicle = vehiclesQuery.data?.find((v) => String(v.id) === String(vehicle))

  if (!data) return null

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-2.5 rounded-lg border border-line bg-white p-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium tracking-wide text-off uppercase">Vehicle</label>
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="h-[34px] rounded-md border border-line px-2.5 text-[13px]">
            <option value="">All vehicles</option>
            {(vehiclesQuery.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.label} ({v.rego})</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium tracking-wide text-off uppercase">Date from</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-[34px] rounded-md border border-line px-2.5 text-[13px]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium tracking-wide text-off uppercase">Date to</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-[34px] rounded-md border border-line px-2.5 text-[13px]" />
        </div>
        <button onClick={clearFilters} className="h-[34px] rounded-md border border-line bg-white px-3 text-xs font-medium hover:bg-[#f5f5f5]">Clear</button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Maintenance spend" value={money(data.totalSpend)} />
        <Metric label="This month's maintenance" value={money(data.monthSpend)} />
        <Metric label="Avg. service cost" value={money(data.avgService)} />
        <Metric label="Open incident cost" value={money(data.openIncidentCost)} color="text-due" />
        <Metric label="This month's fuel cost" value={money(data.fuelMonthCost)} />
        <Metric label="This month's fuel (L)" value={`${Number(data.fuelMonthLitres).toLocaleString('en-AU', { maximumFractionDigits: 0 })} L`} />
      </div>

      <div className="mb-4 rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Monthly maintenance spend — {rangeLabel}</h2>
        <LineChart rows={data.monthlySpend} />
      </div>

      <div className="mb-4 rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Cost by vehicle</h2>
        {selectedVehicle ? (
          <div className="py-6 text-center text-sm text-off">Showing "{selectedVehicle.label}" only — clear the vehicle filter to compare across the fleet.</div>
        ) : (
          <BarList rows={data.costByVehicle ?? []} />
        )}
      </div>

      <div className="mb-4 rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Cost by service type{selectedVehicle ? ` — ${selectedVehicle.label}` : ''}</h2>
        <BarList rows={data.costByType ?? []} />
      </div>

      <div className="mb-4 rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Monthly fuel cost — {rangeLabel}</h2>
        <LineChart rows={data.monthlyFuel} />
      </div>

      <div className="rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Fuel cost by vehicle</h2>
        {selectedVehicle ? (
          <div className="py-6 text-center text-sm text-off">Showing "{selectedVehicle.label}" only — clear the vehicle filter to compare across the fleet.</div>
        ) : (
          <BarList rows={data.fuelByVehicle ?? []} />
        )}
      </div>
    </div>
  )
}
