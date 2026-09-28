import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchVehicles } from '../api/vehicles'
import { deleteFuelLog, fetchFuelLogs } from '../api/fuelLogs'
import { ConfirmDialog } from './ConfirmDialog'
import { DetailModal } from './DetailModal'

export function FuelView({ onEdit, onAdd }) {
  const [vehicle, setVehicle] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const queryClient = useQueryClient()

  const vehiclesQuery = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const filters = { vehicle: vehicle || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined, search: search || undefined, page }
  const fuelQuery = useQuery({ queryKey: ['fuel-logs', filters], queryFn: () => fetchFuelLogs(filters) })

  const deleteMutation = useMutation({
    mutationFn: deleteFuelLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel-logs'] })
      setDeleteTarget(null)
      setDetail(null)
    },
  })

  const clearFilters = () => { setVehicle(''); setDateFrom(''); setDateTo(''); setSearch(''); setPage(1) }
  const rows = fuelQuery.data?.results ?? []
  const count = fuelQuery.data?.count ?? 0
  const pageSize = 25
  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const hasFilters = Boolean(vehicle || dateFrom || dateTo || search)

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-3">
        <h2 className="text-[15px] font-semibold text-ink">Fuel log</h2>
        <button onClick={onAdd} className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#f5f5f5]">Log fuel</button>
      </div>
      <div className="flex flex-wrap items-end gap-2.5 border-b border-line bg-[#fafafa] p-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium tracking-wide text-off uppercase">Vehicle</label>
          <select value={vehicle} onChange={(e) => { setVehicle(e.target.value); setPage(1) }} className="h-[34px] rounded-md border border-line px-2.5 text-[13px]">
            <option value="">All vehicles</option>
            {(vehiclesQuery.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.label} ({v.rego})</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium tracking-wide text-off uppercase">Date from</label>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className="h-[34px] rounded-md border border-line px-2.5 text-[13px]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium tracking-wide text-off uppercase">Date to</label>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className="h-[34px] rounded-md border border-line px-2.5 text-[13px]" />
        </div>
        <div className="flex min-w-[180px] flex-1 flex-col gap-1">
          <label className="text-[11px] font-medium tracking-wide text-off uppercase">Search</label>
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Rego, VIN, make, invoice #…" className="h-[34px] rounded-md border border-line px-2.5 text-[13px]" />
        </div>
        <button onClick={clearFilters} className="h-[34px] rounded-md border border-line bg-white px-3 text-xs font-medium hover:bg-[#f5f5f5]">Clear</button>
        <span className="ml-auto self-center text-xs text-off">{count} record{count === 1 ? '' : 's'}</span>
      </div>
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
                  <td className="max-w-[140px] overflow-hidden px-3 py-2.5 text-ellipsis whitespace-nowrap">{f.vehicleLabel}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{f.date}</td>
                  <td className="px-3 py-2.5">{f.litres} L</td>
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
          rows={[
            ['Date', detail.date], ['Litres', `${detail.litres} L`], ['Cost', `$${detail.cost}`],
            ['Price per litre', detail.pricePerLitre ? `$${detail.pricePerLitre}` : '—'],
            ['Odometer', detail.odometer ? `${detail.odometer.toLocaleString()} km` : '—'],
            ['Invoice #', detail.invoice_number || '—'], ['Notes', detail.notes || '—'],
          ]}
          onClose={() => setDetail(null)}
          onEdit={() => { onEdit(detail); setDetail(null) }}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog title="Delete fuel record?" message="This can't be undone." confirming={deleteMutation.isPending} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteMutation.mutate(deleteTarget.id)} />
      )}
    </div>
  )
}
