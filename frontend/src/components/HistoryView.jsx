import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchMechanics } from '../api/extra'
import { fetchVehicles } from '../api/vehicles'
import { deleteService, fetchServices } from '../api/services'
import { ConfirmDialog } from './ConfirmDialog'
import { DetailModal } from './DetailModal'
import { IssuePhotoStrip } from './IssuePhotos'
import { StatusSelect } from './StatusSelect'
import { SERVICE_STATUSES, statusWord } from '../lib/serviceStatus'
import { fmtDate } from '../lib/formatDate'

const SERVICE_TYPES = [
  'Refrigeration unit', 'Scheduled service', 'Tyre rotation', 'Tyre replacement',
  'Brake service', 'Repair / parts', 'Registration', 'Fuel log',
]

export function HistoryView({ onEdit, initialStatus = '', initialMechanic = '', onError }) {
  const [vehicle, setVehicle] = useState('')
  const [serviceType, setServiceType] = useState('')
  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [mechanic, setMechanic] = useState(initialMechanic)
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [showFilters, setShowFilters] = useState(Boolean(initialStatus || initialMechanic))
  const queryClient = useQueryClient()

  const vehiclesQuery = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const mechanicsQuery = useQuery({ queryKey: ['mechanics'], queryFn: fetchMechanics })
  const filters = { vehicle: vehicle || undefined, service_type: serviceType || undefined, status: statusFilter || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined, search: search || undefined, mechanic: mechanic || undefined, page }
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
    setVehicle(''); setServiceType(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); setSearch(''); setMechanic(''); setPage(1)
  }

  const data = servicesQuery.data
  const rows = data?.results ?? []
  const count = data?.count ?? 0
  const pageSize = 25
  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const hasFilters = Boolean(vehicle || serviceType || statusFilter || dateFrom || dateTo || search || mechanic)

  const sel = 'h-[34px] rounded-md border border-line bg-white px-2.5 text-[13px]'
  const label = 'flex flex-col gap-1 text-[11px] font-medium tracking-wide text-off uppercase'
  const extraFilters = Boolean(serviceType || statusFilter || dateFrom || dateTo || mechanic)

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      {/* Van and search are always there; the rest fold under "Filters". */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line bg-[#fafafa] p-3">
        <select value={vehicle} onChange={(e) => { setVehicle(e.target.value); setPage(1) }} aria-label="Van" className={sel}>
          <option value="">All vans</option>
          {(vehiclesQuery.data ?? []).map((v) => (
            <option key={v.id} value={v.id}>{v.label} · {v.rego}</option>
          ))}
        </select>
        <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search: van, mechanic, notes…" aria-label="Search" className={sel + ' min-w-[180px] flex-1'} />
        <button onClick={() => setShowFilters((x) => !x)} className="h-[34px] rounded-md px-2.5 text-[13px] font-medium text-primary hover:bg-[#e8f1fb]">
          Filters {extraFilters ? '(on) ' : ''}{showFilters ? '▴' : '▾'}
        </button>
        {hasFilters && <button onClick={clearFilters} className="h-[34px] rounded-md border border-line bg-white px-3 text-xs font-medium hover:bg-[#f5f5f5]">Clear</button>}
        <span className="ml-auto text-xs text-off">{count} record{count === 1 ? '' : 's'}</span>
        {showFilters && (
          <div className="flex w-full flex-wrap items-end gap-2.5 border-t border-line pt-3">
            <label className={label}>
              What
              <select value={serviceType} onChange={(e) => { setServiceType(e.target.value); setPage(1) }} className={sel}>
                <option value="">All types</option>
                {SERVICE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className={label}>
              Status
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className={sel}>
                <option value="">All statuses</option>
                {SERVICE_STATUSES.map((t) => <option key={t} value={t}>{statusWord(t)}</option>)}
              </select>
            </label>
            <label className={label}>
              Mechanic
              <select value={mechanic} onChange={(e) => { setMechanic(e.target.value); setPage(1) }} className={sel}>
                <option value="">All mechanics</option>
                {(mechanicsQuery.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className={label}>
              From
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className={sel} />
            </label>
            <label className={label}>
              To
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className={sel} />
            </label>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line bg-[#fafafa] text-xs text-off">
              <th className="px-3 py-2.5 text-left font-medium">Van</th>
              <th className="px-3 py-2.5 text-left font-medium">What</th>
              <th className="px-3 py-2.5 text-left font-medium">Mechanic</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Cost</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-off">{hasFilters ? 'No services match.' : 'No services yet.'}</td></tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className="cursor-pointer border-b border-[#f0f0f0] align-top hover:bg-[#fafafa]" onClick={() => setDetail(s)}>
                  <td className="px-3 py-2.5 text-[14px] font-semibold whitespace-nowrap">{s.vehicleLabel}</td>
                  <td className="px-3 py-2.5">
                    <div>{s.service_type}</div>
                    <div className="text-xs text-off">
                      {fmtDate(s.date)}
                      {s.odometer ? ` · ${s.odometer.toLocaleString()} km` : ''}
                    </div>
                    {s.issues && <div className="max-w-[420px] text-xs whitespace-pre-wrap text-warn">⚠ {s.issues}</div>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{s.mechanicName || <span className="text-xs text-off">not set</span>}</td>
                  <td className="px-3 py-2.5"><StatusSelect service={s} onError={onError} /></td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{s.cost && Number(s.cost) ? `$${Number(s.cost).toLocaleString('en-AU', { minimumFractionDigits: 2 })}` : <span className="text-off">—</span>}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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
          subtitle={detail.vehicleSub}
          vehicleId={detail.vehicle}
          rows={[
            ['Type', detail.service_type],
            ['Date', fmtDate(detail.date)],
            ['Status', statusWord(detail.status)],
            ['Mechanic', detail.mechanicName || '—'],
            ['Odometer', detail.odometer ? `${detail.odometer.toLocaleString()} km` : '—'],
            ['Cost', detail.cost && Number(detail.cost) ? `$${Number(detail.cost).toLocaleString('en-AU', { minimumFractionDigits: 2 })}` : 'not entered yet'],
            ['Next due', /^\d+$/.test(detail.next_due || '') ? `${Number(detail.next_due).toLocaleString()} km` : detail.next_due || '—'],
            ['Issues for mechanic', detail.issues || '—'],
            ['Work done / parts', detail.notes || '—'],
          ]}
          extra={<IssuePhotoStrip service={detail.id} />}
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
