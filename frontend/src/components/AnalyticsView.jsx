import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchVehicles } from '../api/vehicles'
import { fetchAnalytics } from '../api/analytics'
import { BarList } from './charts/BarList'
import { LineChart } from './charts/LineChart'
import { fmtDate } from '../lib/formatDate'

function Metric({ label, value, color, sub }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="mb-1 text-xs text-off">{label}</div>
      <div className={'text-2xl font-semibold ' + (color ?? 'text-ink')}>{value}</div>
      {sub && <div className="mt-1 text-[11px] leading-snug text-off">{sub}</div>}
    </div>
  )
}

// Exact to the cent, for figures people check against the fuel statement.
function cents(n) {
  return `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
        <Metric
          label={`Fuel card total — ${rangeLabel}`}
          value={cents(data.fuelCost)}
          sub={<>Fuel {cents(data.fuelOnlyCost)} + card fees {cents(data.fuelFees)}<br />Same as the fuel card statement total</>}
        />
        <Metric
          label={`Fuel litres — ${rangeLabel}`}
          value={`${Number(data.fuelLitres).toLocaleString('en-AU', { maximumFractionDigits: 0 })} L`}
          sub="Diesel only (AdBlue not included)"
        />
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

      <FuelUse vans={data.fuelVans ?? []} fleetAvg={data.fuelFleetPer100} />
      <FuelFlags flags={data.fuelFlags ?? []} />

      <div className="mb-4 rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Monthly fuel card spend — {rangeLabel}</h2>
        <p className="-mt-2 mb-3 text-xs text-off">Fuel + card fees, by the date on each line of the statement.</p>
        <LineChart rows={data.monthlyFuel} />
      </div>

      <div className="rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Fuel card spend by vehicle</h2>
        <p className="-mt-2 mb-3 text-xs text-off">Fuel + card fees for each van — matches each card's total on the statement.</p>
        {selectedVehicle ? (
          <div className="py-6 text-center text-sm text-off">Showing "{selectedVehicle.label}" only — clear the vehicle filter to compare across the fleet.</div>
        ) : (
          <BarList rows={data.fuelByVehicle ?? []} />
        )}
      </div>
    </div>
  )
}

// Which vans burn the most fuel per 100 km — a sudden rise is often tyres,
// brakes or injectors, or how the van is being driven.
function FuelUse({ vans, fleetAvg }) {
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold text-ink">Fuel use by van</h2>
        {fleetAvg && <span className="text-xs text-off">Fleet average <b className="text-ink">{fleetAvg} L/100km</b> · highlighted vans use 15%+ more</span>}
      </div>
      {vans.length === 0 ? (
        <div className="px-4 pb-6 text-center text-sm text-off">No fuel logged in this range.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-y border-line bg-[#fafafa] text-xs text-off">
                <th className="px-4 py-2 text-left font-medium">Van</th>
                <th className="px-3 py-2 text-left font-medium">L/100km</th>
                <th className="px-3 py-2 text-left font-medium">Km driven</th>
                <th className="px-3 py-2 text-left font-medium">Cost per km<div className="font-normal">(incl. fees)</div></th>
                <th className="px-3 py-2 text-left font-medium">Fill-ups</th>
                <th className="px-3 py-2 text-left font-medium">Litres</th>
                <th className="px-3 py-2 text-right font-medium">Fuel</th>
                <th className="px-3 py-2 text-right font-medium">Card fees</th>
                <th className="px-3 py-2 text-right font-medium">Total<div className="font-normal">(as on statement)</div></th>
              </tr>
            </thead>
            <tbody>
              {vans.map((v) => (
                <tr key={v.id} className={`border-b border-[#f0f0f0] ${v.highUse ? 'bg-warn-bg' : ''}`}>
                  <td className="px-4 py-2 font-medium">{v.label} <span className="font-normal text-off">({v.rego})</span></td>
                  <td className={`px-3 py-2 font-semibold ${v.highUse ? 'text-warn' : ''}`}>{v.per100 ?? '—'}{v.highUse && ' ▲'}</td>
                  <td className="px-3 py-2">{v.km ? `${v.km.toLocaleString()} km` : '—'}</td>
                  <td className="px-3 py-2">{v.costPerKm ? `$${v.costPerKm.toFixed(2)}` : '—'}</td>
                  <td className="px-3 py-2">{v.fills}</td>
                  <td className="px-3 py-2">{v.litres.toLocaleString('en-AU', { maximumFractionDigits: 0 })} L</td>
                  <td className="px-3 py-2 text-right tabular-nums">{cents(v.fuelCost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-off">{cents(v.fees)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{cents(v.cost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-[#fafafa] font-semibold">
                <td className="px-4 py-2">All vans</td>
                <td className="px-3 py-2">{fleetAvg ? `${fleetAvg} avg` : '—'}</td>
                <td colSpan={2} />
                <td className="px-3 py-2">{vans.reduce((s, v) => s + v.fills, 0)}</td>
                <td className="px-3 py-2">{vans.reduce((s, v) => s + v.litres, 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })} L</td>
                <td className="px-3 py-2 text-right tabular-nums">{cents(vans.reduce((s, v) => s + v.fuelCost, 0))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{cents(vans.reduce((s, v) => s + v.fees, 0))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{cents(vans.reduce((s, v) => s + v.cost, 0))}</td>
              </tr>
            </tfoot>
          </table>
          <p className="px-4 py-2.5 text-xs text-off">
            L/100km, km and litres count diesel only. Card fees = roadside assist, card &amp; management fees, AdBlue and other non-fuel charges on the card.
            "—" means not enough odometer readings were entered at the pump to work it out.
          </p>
        </div>
      )}
    </div>
  )
}

// Fill-ups that look odd enough to ask the driver about.
function FuelFlags({ flags }) {
  return (
    <div className="mb-4 rounded-lg border border-line bg-white p-4">
      <h2 className="mb-3 text-[15px] font-semibold text-ink">Fuel — worth checking {flags.length > 0 && <span className="ml-1 rounded-full bg-warn-bg px-2 py-0.5 text-xs text-warn">{flags.length}</span>}</h2>
      {flags.length === 0 ? (
        <div className="py-4 text-center text-sm text-off">Nothing unusual in this range.</div>
      ) : (
        <ul className="divide-y divide-[#f0f0f0] text-[13px]">
          {flags.map((f, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
              <span className="w-[84px] shrink-0 text-off">{fmtDate(f.date)}</span>
              <span className="w-[200px] shrink-0 font-medium">{f.vehicleLabel}</span>
              <span className="rounded bg-warn-bg px-1.5 py-0.5 text-xs font-medium text-warn">{f.kind}</span>
              <span className="text-off">{f.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
