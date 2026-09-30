import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { deleteVehicle, fetchVehicles } from '../api/vehicles'
import { fetchServices } from '../api/services'
import { ConfirmDialog } from './ConfirmDialog'
import { SortTh } from './SortTh'
import { fmtAgo, fmtDate } from '../lib/formatDate'
import { STATUS_STYLES } from '../lib/serviceStatus'
import { useSort } from '../lib/useSort'

const BADGE = {
  ok: { label: 'OK', className: 'bg-ok-bg text-ok', rank: 2 },
  due_soon: { label: 'Due soon', className: 'bg-warn-bg text-warn', rank: 1 },
  attention: { label: 'Attention', className: 'bg-due-bg text-due', rank: 0 },
}

const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'attention', label: 'Needs attention', match: (v) => v.statusBadge !== 'ok' },
  { key: 'booked', label: 'Booked in', match: (v) => Boolean(v.openJob) },
]

const SORT_TYPES = { statusRank: 'number', odometer: 'number', serviceKm: 'number', washDays: 'number' }
const VIEW_KEY = 'fleet-view'

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) || 'table'
  } catch {
    return 'table'
  }
}

function StatusBadge({ status }) {
  const b = BADGE[status] ?? BADGE.ok
  return <span className={'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ' + b.className}>{b.label}</span>
}

function kmColour(kmLeft) {
  if (kmLeft < 0) return 'text-due'
  if (kmLeft < 2000) return 'text-warn'
  return ''
}

// "· Booked 30-09-2026 (tomorrow)" — shown when a due service already has a job open.
function BookedNote({ job }) {
  const verb = job.status === 'Booked' ? 'Booked' : job.status
  return (
    <span className="font-medium text-primary">
      {' '}· {verb} {fmtDate(job.date)} ({fmtAgo(job.date)})
    </span>
  )
}

function serviceText(svc) {
  if (!svc) return 'No service logged'
  return svc.km_left < 0 ? `${Math.abs(svc.km_left).toLocaleString()} km overdue` : `${svc.km_left.toLocaleString()} km left`
}

function washText(v) {
  if (!v.wash_needed) return 'No need'
  return v.lastWashed ? fmtAgo(v.lastWashed) : 'Never logged'
}

function expiryCell(date) {
  if (!date) return <span className="text-off">—</span>
  const days = Math.round((new Date(date) - new Date(new Date().toDateString())) / 86400000)
  const colour = days < 0 ? 'text-due font-medium' : days < 60 ? 'text-warn font-medium' : ''
  return <span className={colour}>{fmtDate(date)}</span>
}

// ── Table view ────────────────────────────────────────────────────────────

function FleetTable({ rows, onOpen }) {
  const sort = useSort(rows, SORT_TYPES)
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full min-w-[980px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line bg-[#fafafa] text-xs text-off">
            <SortTh label="Van" col="label" sort={sort} />
            <SortTh label="Rego" col="rego" sort={sort} />
            <SortTh label="Odometer" col="odometer" sort={sort} />
            <SortTh label="Next service" col="serviceKm" sort={sort} />
            <SortTh label="Rego expiry" col="rego_expiry" sort={sort} />
            <SortTh label="Insurance" col="insurance_expiry" sort={sort} />
            <SortTh label="Last washed" col="washDays" sort={sort} />
            <SortTh label="Status" col="statusRank" sort={sort} />
          </tr>
        </thead>
        <tbody>
          {sort.sorted.map((v) => {
            const svc = v.nextServiceDue
            return (
              <tr key={v.id} onClick={() => onOpen(v)} className="cursor-pointer border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]">
                <td className="px-2 py-2.5 font-medium text-ink">{v.label}</td>
                <td className="px-2 py-2.5 whitespace-nowrap">{v.rego || '—'}</td>
                <td className="px-2 py-2.5 whitespace-nowrap">{v.odometer ? `${v.odometer.toLocaleString()} km` : '—'}</td>
                <td className="px-2 py-2.5">
                  <span className={svc ? kmColour(svc.km_left) + (svc.km_left < 2000 ? ' font-medium' : '') : 'text-off'}>{serviceText(svc)}</span>
                  {svc?.booked && <BookedNote job={svc.booked} />}
                  {v.openJob && v.openJob.id !== svc?.booked?.id && (
                    <div className="text-[11px] font-medium text-primary">
                      🔧 {v.openJob.service_type}: {v.openJob.status.toLowerCase()} {fmtDate(v.openJob.date)}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap">{expiryCell(v.rego_expiry)}</td>
                <td className="px-2 py-2.5 whitespace-nowrap">{expiryCell(v.insurance_expiry)}</td>
                <td className={'px-2 py-2.5 whitespace-nowrap ' + (v.wash_needed ? '' : 'text-off')}>{washText(v)}</td>
                <td className="px-2 py-2.5"><StatusBadge status={v.statusBadge} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Card view (the original layout) ───────────────────────────────────────

function VehicleCard({ vehicle, onOpen }) {
  const svc = vehicle.nextServiceDue
  return (
    <div onClick={() => onOpen(vehicle)} className="cursor-pointer rounded-lg border border-line bg-white p-4 hover:border-[#bbb]">
      <div className="mb-2 text-sm font-semibold text-ink">{vehicle.label}</div>
      <div className="mb-2 text-xs text-off">
        {vehicle.rego || 'No rego'}
        {vehicle.vehicle_number ? ` · ${vehicle.vehicle_number}` : ''}
        {vehicle.odometer ? ` · ${vehicle.odometer.toLocaleString()} km` : ''}
      </div>
      <StatusBadge status={vehicle.statusBadge} />
      <div className={'mt-2 text-[11px] ' + (svc ? kmColour(svc.km_left) || 'text-off' : 'text-off')}>
        Service: {serviceText(svc)}
        {svc?.booked && <BookedNote job={svc.booked} />}
      </div>
      {vehicle.openJob && vehicle.openJob.id !== svc?.booked?.id && (
        <div className="mt-1 text-[11px] font-medium text-primary">
          🔧 {vehicle.openJob.service_type}: {vehicle.openJob.status.toLowerCase()} {fmtDate(vehicle.openJob.date)}
        </div>
      )}
      <div className="mt-2 text-[11px] text-[#aaa]">Last washed: {washText(vehicle)}</div>
    </div>
  )
}

// ── Details panel (click a row / card) ────────────────────────────────────

function Detail({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#f0f0f0] py-1.5 last:border-0">
      <span className="text-off">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

function VehicleDetail({ vehicle: v, onClose, onEdit, onDelete }) {
  const svc = v.nextServiceDue
  const tyre = v.nextTyreDue
  const history = useQuery({
    queryKey: ['services', { vehicle: v.id, page_size: 5 }],
    queryFn: () => fetchServices({ vehicle: v.id, page_size: 5 }),
  })
  const recent = history.data?.results ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,.45)] px-5" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink">{v.label}</h3>
            <div className="text-xs text-off">{v.rego || 'No rego'}{v.vehicle_number ? ` · #${v.vehicle_number}` : ''}</div>
          </div>
          <StatusBadge status={v.statusBadge} />
        </div>

        <div className="mb-4 text-[13px] text-[#333]">
          <Detail label="Odometer">{v.odometer ? `${v.odometer.toLocaleString()} km` : '—'}</Detail>
          <Detail label="Next service">
            {svc ? `${svc.due_at.toLocaleString()} km (${serviceText(svc)})` : 'No service logged'}
            {svc?.booked && <BookedNote job={svc.booked} />}
          </Detail>
          <Detail label="Next tyre change">{tyre ? `${tyre.due_at.toLocaleString()} km (${serviceText(tyre)})` : '—'}</Detail>
          <Detail label="Rego expiry">{expiryCell(v.rego_expiry)}</Detail>
          <Detail label="Insurance expiry">{expiryCell(v.insurance_expiry)}</Detail>
          <Detail label="Last washed">{v.wash_needed ? (v.lastWashed ? `${fmtDate(v.lastWashed)} (${fmtAgo(v.lastWashed)})` : 'Never logged') : 'No need (driver takes it home)'}</Detail>
          <Detail label="VIN"><span className="font-mono text-xs">{v.vin || '—'}</span></Detail>
          <Detail label="Fuel">{[v.fuel_type, v.fuel_card_number && `card ${v.fuel_card_number}`].filter(Boolean).join(' · ') || '—'}</Detail>
          <Detail label="Intervals">
            service every {v.service_interval_km?.toLocaleString()} km{v.tyre_interval_km ? ` · tyres every ${v.tyre_interval_km.toLocaleString()} km` : ''}
          </Detail>
        </div>

        <div className="mb-4">
          <div className="mb-2 text-[13px] font-semibold text-ink">Recent services</div>
          {recent.length === 0 ? (
            <div className="text-[13px] text-off">{history.isLoading ? 'Loading…' : 'No services logged.'}</div>
          ) : (
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                {recent.map((s) => (
                  <tr key={s.id} className="border-b border-[#f0f0f0] last:border-0">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{fmtDate(s.date)}</td>
                    <td className="py-1.5 pr-2">{s.service_type}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{s.odometer ? `${s.odometer.toLocaleString()} km` : ''}</td>
                    <td className="py-1.5 text-right">
                      <span className={'inline-block rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap ' + (STATUS_STYLES[s.status] ?? '')}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-between gap-2">
          <button onClick={() => onDelete(v)} className="rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-medium text-off hover:bg-due-bg hover:text-due">
            Delete vehicle
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#f5f5f5]">
              Close
            </button>
            <button onClick={() => onEdit(v)} className="rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-dark">
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export function FleetView({ onEdit, onAdd }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [view, setViewState] = useState(readView)
  const [openVehicle, setOpenVehicle] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const queryClient = useQueryClient()
  const vehiclesQuery = useQuery({ queryKey: ['vehicles', search], queryFn: () => fetchVehicles(search) })

  const setView = (v) => {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* private window etc. — the choice just won't be remembered */
    }
  }

  const deleteMutation = useMutation({
    mutationFn: deleteVehicle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      setDeleteTarget(null)
      setOpenVehicle(null)
    },
    onError: (err) => setDeleteError(err?.response?.data?.detail ?? 'Could not delete vehicle.'),
  })

  // Sort keys for the table; the default order puts vans needing attention
  // first, then whichever is closest to its next service.
  const vehicles = useMemo(
    () =>
      (vehiclesQuery.data ?? [])
        .map((v) => ({
          ...v,
          statusRank: (BADGE[v.statusBadge] ?? BADGE.ok).rank,
          serviceKm: v.nextServiceDue ? v.nextServiceDue.km_left : Number.MAX_SAFE_INTEGER,
          washDays: !v.wash_needed ? 100000 : v.lastWashed ? Math.round((new Date(new Date().toDateString()) - new Date(v.lastWashed)) / 86400000) : 99999,
        }))
        .sort((a, b) => a.statusRank - b.statusRank || a.serviceKm - b.serviceKm),
    [vehiclesQuery.data],
  )
  const shown = vehicles.filter(FILTERS.find((f) => f.key === filter).match)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold text-ink">All vehicles</h2>
          <div className="flex gap-1 rounded-md border border-line bg-white p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={'rounded px-3 py-1 text-xs font-medium ' + (filter === f.key ? 'bg-primary text-white' : 'text-off hover:bg-[#f5f5f5] hover:text-ink')}
              >
                {f.label} ({vehicles.filter(f.match).length})
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Van 1, make, model, rego, VIN…"
            className="max-w-[280px] flex-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-[13px]"
          />
          <div className="flex gap-1 rounded-md border border-line bg-white p-0.5">
            {['table', 'cards'].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={'rounded px-2.5 py-1 text-xs font-medium capitalize ' + (view === v ? 'bg-ink text-white' : 'text-off hover:bg-[#f5f5f5]')}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-line bg-white py-10 text-center text-off">
          {search || filter !== 'all' ? 'No vehicles match.' : (
            <>
              No vehicles yet.{' '}
              <button onClick={onAdd} className="font-medium text-primary underline">
                Add one
              </button>
            </>
          )}
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shown.map((v) => (
            <VehicleCard key={v.id} vehicle={v} onOpen={setOpenVehicle} />
          ))}
        </div>
      ) : (
        <FleetTable rows={shown} onOpen={setOpenVehicle} />
      )}

      {openVehicle && (
        <VehicleDetail
          vehicle={openVehicle}
          onClose={() => setOpenVehicle(null)}
          onEdit={(v) => { setOpenVehicle(null); onEdit(v) }}
          onDelete={(v) => { setDeleteTarget(v); setDeleteError(null) }}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete vehicle?"
          message={`Delete ${deleteTarget.label} (${deleteTarget.rego || 'no rego'})? This can't be undone.`}
          errorMessage={deleteError}
          confirming={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </div>
  )
}
