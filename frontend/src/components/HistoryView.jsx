import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchVehicles } from '../api/vehicles'
import { deleteService, fetchServices } from '../api/services'
import { ConfirmDialog } from './ConfirmDialog'
import { DetailModal } from './DetailModal'
import { StatusSelect } from './StatusSelect'
import { SERVICE_STATUSES } from '../lib/serviceStatus'
import { fmtDate } from '../lib/formatDate'

const SERVICE_TYPES = [
  'Refrigeration unit', 'Scheduled service', 'Tyre rotation', 'Tyre replacement',
  'Brake service', 'Repair / parts', 'Registration', 'Insurance', 'Fuel log', 'Van wash',
]

export function HistoryView({ onEdit, initialStatus = '', onError }) {
  const [vehicle, setVehicle] = useState('')
  const [serviceType, setServiceType] = useState('')
  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const queryClient = useQueryClient()

  const vehiclesQuery = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const filters = { vehicle: vehicle || undefined, service_type: serviceType || undefined, status: statusFilter || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined, search: search || undefined, page }
  const servicesQuery = useQuery({ queryKey: ['services', filters], queryFn: () => fetchServices(filters) })

  const deleteMutation = useMutation({
    mutationFn: deleteService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      setDeleteTarget(null)
      setDetail(null)
    },
  })

  const clearFilters = () => {
    setVehicle(''); setServiceType(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); setSearch(''); setPage(1)
  }

  const data = servicesQuery.data
  const rows = data?.results ?? []
  const count = data?.count ?? 0
  const pageSize = 25
  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const hasFilters = Boolean(vehicle || serviceType || statusFilter || dateFrom || dateTo || search)

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-end gap-2.5 border-b border-line bg-[#fafafa] p-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium tracking-wide text-off uppercase">Vehicle</label>
          <select value={vehicle} onChange={(e) => { setVehicle(e.target.value); setPage(1) }} className="h-[34px] rounded-md border border-line px-2.5 text-[13px]">
            <option value="">All vehicles</option>
            {(vehiclesQuery.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>{v.label} ({v.rego})</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium tracking-wide text-off uppercase">Service type</label>
          <select value={serviceType} onChange={(e) => { setServiceType(e.target.value); setPage(1) }} className="h-[34px] rounded-md border border-line px-2.5 text-[13px]">
            <option value="">All types</option>
            {SERVICE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium tracking-wide text-off uppercase">Status</label>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className="h-[34px] rounded-md border border-line px-2.5 text-[13px]">
            <option value="">All statuses</option>
            {SERVICE_STATUSES.map((t) => <option key={t}>{t}</option>)}
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
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Van 1, rego, VIN, make, notes…" className="h-[34px] rounded-md border border-line px-2.5 text-[13px]" />
        </div>
        <button onClick={clearFilters} className="h-[34px] rounded-md border border-line bg-white px-3 text-xs font-medium hover:bg-[#f5f5f5]">Clear</button>
        <span className="ml-auto self-center text-xs text-off">{count} record{count === 1 ? '' : 's'}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line bg-[#fafafa] text-xs text-off">
              <th className="px-3 py-2.5 text-left font-medium">Vehicle</th>
              <th className="px-3 py-2.5 text-left font-medium">Type</th>
              <th className="px-3 py-2.5 text-left font-medium">Date</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
              <th className="px-3 py-2.5 text-left font-medium">Odometer</th>
              <th className="px-3 py-2.5 text-left font-medium">Cost</th>
              <th className="px-3 py-2.5 text-left font-medium">Notes</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-off">{hasFilters ? 'No records match the current filters.' : 'No records yet.'}</td></tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className="cursor-pointer border-b border-[#f0f0f0] hover:bg-[#fafafa]" onClick={() => setDetail(s)}>
                  <td className="max-w-[260px] overflow-hidden px-3 py-2.5 text-ellipsis whitespace-nowrap">{s.vehicleLabel}</td>
                  <td className="px-3 py-2.5">{s.service_type}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(s.date)}</td>
                  <td className="px-3 py-2.5"><StatusSelect service={s} onError={onError} /></td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{s.odometer ? `${s.odometer.toLocaleString()} km` : '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{s.cost ? `$${s.cost}` : '—'}</td>
                  <td className="max-w-[320px] overflow-hidden px-3 py-2.5 text-ellipsis whitespace-nowrap text-off">{s.notes || '—'}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onEdit(s)} className="mr-1 rounded px-1.5 py-1 text-off hover:bg-[#f0f0f0]" title="Edit">✎</button>
                    <button onClick={() => setDeleteTarget(s)} className="rounded px-1.5 py-1 text-off hover:bg-due-bg hover:text-due" title="Delete">✕</button>
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
            ['Type', detail.service_type],
            ['Date', fmtDate(detail.date)],
            ['Status', detail.status],
            ['Odometer', detail.odometer ? `${detail.odometer.toLocaleString()} km` : '—'],
            ['Cost', detail.cost ? `$${detail.cost}` : '—'],
            ['Next due', detail.next_due || '—'],
            ['Issues for mechanic', detail.issues || '—'],
            ['Work done / parts', detail.notes || '—'],
          ]}
          onClose={() => setDetail(null)}
          onEdit={() => { onEdit(detail); setDetail(null) }}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete service record?"
          message="This can't be undone."
          confirming={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </div>
  )
}
