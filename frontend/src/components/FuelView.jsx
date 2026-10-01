import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchVehicles } from '../api/vehicles'
import { deleteFuelLog, fetchFuelLogs } from '../api/fuelLogs'
import { ConfirmDialog } from './ConfirmDialog'
import { DetailModal } from './DetailModal'
import { FuelByVan } from './FuelByVan'
import { FuelImport } from './FuelImport'
import { fmtDate } from '../lib/formatDate'

// ISO date helpers for statement periods (they run e.g. 09-08 to 08-09).
function shiftMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate()
  dt.setUTCDate(Math.min(d, last))
  return dt.toISOString().slice(0, 10)
}
function addDays(iso, n) {
  const dt = new Date(iso + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

export function FuelView({ onEdit, onAdd, hideHeaderActions }) {
  const [vehicle, setVehicle] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [importing, setImporting] = useState(false)
  const [view, setView] = useState('van')
  const [showFilters, setShowFilters] = useState(false)
  // Which statement to show: 0 = the latest, 1 = the one before, … or 'all'.
  const [period, setPeriod] = useState(0)
  const queryClient = useQueryClient()

  const vehiclesQuery = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const latestQuery = useQuery({ queryKey: ['fuel-logs', { latest: true }], queryFn: () => fetchFuelLogs({ page_size: 1 }) })
  const latest = latestQuery.data?.results?.[0]?.date
  // A statement period ends on the latest fuel date and starts the day after
  // the same date a month earlier (08-09 -> 09-08 to 08-09).
  const ownDates = Boolean(dateFrom || dateTo)
  const periodTo = latest && period !== 'all' ? shiftMonths(latest, -period) : null
  const periodFrom = periodTo ? addDays(shiftMonths(periodTo, -1), 1) : null
  const from = ownDates ? dateFrom : periodFrom
  const to = ownDates ? dateTo : periodTo
  const filters = { vehicle: vehicle || undefined, date_from: from || undefined, date_to: to || undefined, search: search || undefined, page }
  // By van needs every matching fill-up to total them, not just one page.
  const queryFilters = view === 'van' ? { ...filters, page: undefined, page_size: 5000 } : filters
  const fuelQuery = useQuery({ queryKey: ['fuel-logs', queryFilters], queryFn: () => fetchFuelLogs(queryFilters) })

  const deleteMutation = useMutation({
    mutationFn: deleteFuelLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel-logs'] })
      setDeleteTarget(null)
      setDetail(null)
    },
  })

  const clearFilters = () => { setVehicle(''); setDateFrom(''); setDateTo(''); setSearch(''); setPage(1); setPeriod(0) }
  const rows = fuelQuery.data?.results ?? []
  const count = fuelQuery.data?.count ?? 0
  const pageSize = 25
  const totalPages = view === 'van' ? 1 : Math.max(1, Math.ceil(count / pageSize))
  const hasFilters = Boolean(vehicle || dateFrom || dateTo || search || view !== 'van')

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-3">
        <h2 className="text-[15px] font-semibold text-ink">Fuel</h2>
        <div className={hideHeaderActions ? 'hidden' : 'flex gap-2'}>
          <button onClick={() => setImporting(true)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark">Import statement</button>
          <button onClick={onAdd} className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#f5f5f5]">Log fill-up</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line bg-[#fafafa] p-3 text-[13px]">
        {ownDates ? (
          <span className="font-semibold">Your dates: {from ? fmtDate(from) : 'start'} – {to ? fmtDate(to) : 'today'}</span>
        ) : period === 'all' ? (
          <span className="font-semibold">All fuel, every statement</span>
        ) : (
          <>
            <button onClick={() => { setPeriod((p) => p + 1); setPage(1) }} className="rounded-md border border-line bg-white px-2.5 py-1 hover:bg-[#f5f5f5]" title="Earlier statement">‹</button>
            <span className="font-semibold">
              {period === 0 ? 'Latest statement' : `${period} statement${period === 1 ? '' : 's'} back`}
              {periodFrom && <span className="font-normal text-off"> · {fmtDate(periodFrom)} – {fmtDate(periodTo)}</span>}
            </span>
            <button disabled={period === 0} onClick={() => { setPeriod((p) => p - 1); setPage(1) }} className="rounded-md border border-line bg-white px-2.5 py-1 hover:bg-[#f5f5f5] disabled:opacity-40" title="Later statement">›</button>
          </>
        )}
        <button onClick={() => { setPeriod(period === 'all' ? 0 : 'all'); setDateFrom(''); setDateTo(''); setPage(1) }} className="rounded-md px-2.5 py-1 font-medium text-primary hover:bg-[#e8f1fb]">
          {period === 'all' && !ownDates ? 'Back to latest statement' : 'All time'}
        </button>
        <button onClick={() => setShowFilters((x) => !x)} className="rounded-md px-2.5 py-1 font-medium text-primary hover:bg-[#e8f1fb]">
          Filters {hasFilters ? '(on) ' : ''}{showFilters ? '▴' : '▾'}
        </button>
        <span className="ml-auto text-xs text-off">{count} record{count === 1 ? '' : 's'}</span>
        {showFilters && (
          <div className="flex w-full flex-wrap items-end gap-2.5 border-t border-line pt-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium tracking-wide text-off uppercase">Van</label>
              <select value={vehicle} onChange={(e) => { setVehicle(e.target.value); setPage(1) }} className="h-[34px] rounded-md border border-line bg-white px-2.5 text-[13px]">
                <option value="">All vans</option>
                {(vehiclesQuery.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.label} · {v.rego}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium tracking-wide text-off uppercase">From</label>
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className="h-[34px] rounded-md border border-line bg-white px-2.5 text-[13px]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium tracking-wide text-off uppercase">To</label>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className="h-[34px] rounded-md border border-line bg-white px-2.5 text-[13px]" />
            </div>
            <div className="flex min-w-[180px] flex-1 flex-col gap-1">
              <label className="text-[11px] font-medium tracking-wide text-off uppercase">Search</label>
              <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Van 1, rego, docket #…" className="h-[34px] rounded-md border border-line bg-white px-2.5 text-[13px]" />
            </div>
            <div className="flex h-[34px] overflow-hidden rounded-md border border-line text-xs font-medium">
              {[['van', 'By van'], ['list', 'Every line']].map(([key, label]) => (
                <button key={key} onClick={() => { setView(key); setPage(1) }} className={`px-3 ${view === key ? 'bg-primary text-white' : 'bg-white hover:bg-[#f5f5f5]'}`}>{label}</button>
              ))}
            </div>
            <button onClick={clearFilters} className="h-[34px] rounded-md border border-line bg-white px-3 text-xs font-medium hover:bg-[#f5f5f5]">Clear</button>
          </div>
        )}
      </div>
      {view === 'van' ? (
        <FuelByVan
          rows={rows}
          emptyText={hasFilters || period !== 0 ? 'No fuel in this period.' : 'No fuel records yet. Use Import statement to add the monthly fuel card statement.'}
          onPick={setDetail}
          onEdit={onEdit}
          onDelete={setDeleteTarget}
        />
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line bg-[#fafafa] text-xs text-off">
              <th className="px-3 py-2.5 text-left font-medium">Vehicle</th>
              <th className="px-3 py-2.5 text-left font-medium">Date</th>
              <th className="px-3 py-2.5 text-left font-medium">Litres</th>
              <th className="px-3 py-2.5 text-left font-medium">Cost</th>
              <th className="px-3 py-2.5 text-left font-medium">$/L</th>
              <th className="px-3 py-2.5 text-left font-medium">Odometer</th>
              <th className="px-3 py-2.5 text-left font-medium">Invoice #</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-off">{hasFilters ? 'No fuel records match the current filters.' : 'No fuel records yet.'}</td></tr>
            ) : (
              rows.map((f) => (
                <tr key={f.id} className="cursor-pointer border-b border-[#f0f0f0] hover:bg-[#fafafa]" onClick={() => setDetail(f)}>
                  <td className="max-w-[260px] overflow-hidden px-3 py-2.5 text-ellipsis whitespace-nowrap">{f.vehicleLabel}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(f.date)}</td>
                  <td className="px-3 py-2.5">{f.isFuel ? `${f.litres} L` : <span className="text-off">{f.product}</span>}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">${f.cost}</td>
                  <td className="px-3 py-2.5">{f.pricePerLitre ? `$${f.pricePerLitre}` : '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{f.odometer ? `${f.odometer.toLocaleString()} km` : '—'}</td>
                  <td className="px-3 py-2.5 text-off">{f.invoice_number || '—'}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onEdit(f)} className="mr-1 rounded px-1.5 py-1 text-off hover:bg-[#f0f0f0]" title="Edit">✎</button>
                    <button onClick={() => setDeleteTarget(f)} className="rounded px-1.5 py-1 text-off hover:bg-due-bg hover:text-due" title="Delete">✕</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2.5 border-t border-line px-3.5 py-2.5">
          <span className="text-xs text-off">Page {page} of {totalPages}</span>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-line bg-white px-2.5 py-1 text-xs disabled:opacity-40">Prev</button>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-line bg-white px-2.5 py-1 text-xs disabled:opacity-40">Next</button>
        </div>
      )}
      {detail && (
        <DetailModal
          title={detail.vehicleLabel}
          subtitle={detail.vehicleSub}
          vehicleId={detail.vehicle}
          rows={[
            ['Date', fmtDate(detail.date)], ['Product', detail.product || 'Fuel'], ['Litres', `${detail.litres} L`], ['Cost', `$${detail.cost}`],
            ['Price per litre', detail.pricePerLitre ? `$${detail.pricePerLitre}` : '—'],
            ['Odometer', detail.odometer ? `${detail.odometer.toLocaleString()} km` : '—'],
            ['Invoice #', detail.invoice_number || '—'], ['Notes', detail.notes || '—'],
          ]}
          onClose={() => setDetail(null)}
          onEdit={() => { onEdit(detail); setDetail(null) }}
        />
      )}
      {importing && <FuelImport onClose={() => setImporting(false)} />}
      {deleteTarget && (
        <ConfirmDialog title="Delete fuel record?" message="This can't be undone." confirming={deleteMutation.isPending} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteMutation.mutate(deleteTarget.id)} />
      )}
    </div>
  )
}
