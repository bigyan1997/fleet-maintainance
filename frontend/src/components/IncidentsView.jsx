import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchVehicles } from '../api/vehicles'
import { deleteIncident, fetchIncidents } from '../api/incidents'
import { ConfirmDialog } from './ConfirmDialog'
import { DetailModal } from './DetailModal'
import { IncidentLog } from './IncidentLog'
import { fmtDate } from '../lib/formatDate'

const TYPES = ['Accident', 'Breakdown', 'Damage', 'Other']
const STATUSES = ['Open', 'In progress', 'Resolved']
const STATUS_BADGE = { Open: 'bg-due-bg text-due', 'In progress': 'bg-warn-bg text-warn', Resolved: 'bg-ok-bg text-ok' }

export function IncidentsView({ onEdit, onAdd }) {
  const [vehicle, setVehicle] = useState('')
  const [type, setType] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const queryClient = useQueryClient()

  const vehiclesQuery = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const filters = { vehicle: vehicle || undefined, incident_type: type || undefined, status: statusFilter || undefined, search: search || undefined, page_size: 1000 }
  const incidentsQuery = useQuery({ queryKey: ['incidents', filters], queryFn: () => fetchIncidents(filters) })

  const deleteMutation = useMutation({
    mutationFn: deleteIncident,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      setDeleteTarget(null)
      setDetail(null)
    },
  })

  const clearFilters = () => { setVehicle(''); setType(''); setStatusFilter(''); setSearch('') }
  const rows = incidentsQuery.data?.results ?? []
  const count = incidentsQuery.data?.count ?? 0
  const hasFilters = Boolean(vehicle || type || statusFilter || search)

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-3">
        <h2 className="text-[15px] font-semibold text-ink">Incidents &amp; breakdowns</h2>
        <button onClick={onAdd} className="rounded-md border border-[#fca5a5] bg-white px-3 py-1.5 text-xs font-medium text-due hover:bg-due-bg">Log incident</button>
      </div>
      <div className="flex flex-wrap items-end gap-2.5 border-b border-line bg-[#fafafa] p-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium tracking-wide text-off uppercase">Vehicle</label>
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="h-[34px] rounded-md border border-line px-2.5 text-[13px]">
            <option value="">All vehicles</option>
            {(vehiclesQuery.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.label} ({v.rego})</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium tracking-wide text-off uppercase">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-[34px] rounded-md border border-line px-2.5 text-[13px]">
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium tracking-wide text-off uppercase">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-[34px] rounded-md border border-line px-2.5 text-[13px]">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex min-w-[180px] flex-1 flex-col gap-1">
          <label className="text-[11px] font-medium tracking-wide text-off uppercase">Search</label>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rego, VIN, make, description…" className="h-[34px] rounded-md border border-line px-2.5 text-[13px]" />
        </div>
        <button onClick={clearFilters} className="h-[34px] rounded-md border border-line bg-white px-3 text-xs font-medium hover:bg-[#f5f5f5]">Clear</button>
        <span className="ml-auto self-center text-xs text-off">{count} record{count === 1 ? '' : 's'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line bg-[#fafafa] text-xs text-off">
              <th className="px-3 py-2.5 text-left font-medium">Vehicle</th>
              <th className="px-3 py-2.5 text-left font-medium">Type</th>
              <th className="px-3 py-2.5 text-left font-medium">Date</th>
              <th className="px-3 py-2.5 text-left font-medium">Severity</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
              <th className="px-3 py-2.5 text-left font-medium">Cost</th>
              <th className="px-3 py-2.5 text-left font-medium">Description</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-off">{hasFilters ? 'No incidents match the current filters.' : 'No incidents logged.'}</td></tr>
            ) : (
              rows.map((x) => (
                <tr key={x.id} className="cursor-pointer border-b border-[#f0f0f0] hover:bg-[#fafafa]" onClick={() => setDetail(x)}>
                  <td className="max-w-[140px] overflow-hidden px-3 py-2.5 text-ellipsis whitespace-nowrap">{x.vehicleLabel}</td>
                  <td className="px-3 py-2.5">{x.incident_type}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(x.date)}</td>
                  <td className="px-3 py-2.5">{x.severity}</td>
                  <td className="px-3 py-2.5"><span className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + (STATUS_BADGE[x.status] ?? '')}>{x.status}</span></td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{x.cost ? `$${x.cost}` : '—'}</td>
                  <td className="max-w-[220px] overflow-hidden px-3 py-2.5 text-ellipsis whitespace-nowrap text-off">{x.description || '—'}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onEdit(x)} className="mr-1 rounded px-1.5 py-1 text-off hover:bg-[#f0f0f0]" title="Edit">✎</button>
                    <button onClick={() => setDeleteTarget(x)} className="rounded px-1.5 py-1 text-off hover:bg-due-bg hover:text-due" title="Delete">✕</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {detail && (
        <DetailModal
          title={detail.vehicleLabel}
          rows={[
            ['Type', detail.incident_type], ['Date', fmtDate(detail.date)], ['Severity', detail.severity],
            ['Status', detail.status], ['Location', detail.location || '—'], ['Cost', detail.cost ? `$${detail.cost}` : '—'],
            ['Description', detail.description || '—'],
            ['Updates', <div className="text-left font-normal"><IncidentLog updates={detail.updates} /></div>],
            ...(detail.status === 'Resolved'
              ? [['Resolution', detail.resolution || '—'], ['Resolved date', fmtDate(detail.resolved_date) || '—']]
              : []),
          ]}
          onClose={() => setDetail(null)}
          onEdit={() => { onEdit(detail); setDetail(null) }}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog title="Delete incident record?" message="This can't be undone." confirming={deleteMutation.isPending} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteMutation.mutate(deleteTarget.id)} />
      )}
    </div>
  )
}
