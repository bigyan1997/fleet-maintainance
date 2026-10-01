import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { fetchVehicles } from '../api/vehicles'
import { SortTh } from './SortTh'
import { fmtAgo, fmtDate } from '../lib/formatDate'
import { expiryCell, kmColour, serviceText, washText } from '../lib/fleet'
import { navigate } from '../lib/router'
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

export function StatusBadge({ status }) {
  const b = BADGE[status] ?? BADGE.ok
  return <span className={'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ' + b.className}>{b.label}</span>
}


// "· Booked 30-09-2026 (tomorrow)" — shown when a due service already has a job open.
export function BookedNote({ job }) {
  const verb = job.status === 'Booked' ? 'Booked' : job.status
  return (
    <span className="font-medium text-primary">
      {' '}· {verb} {fmtDate(job.date)} ({fmtAgo(job.date)})
    </span>
  )
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
            <SortTh label="Driver" col="driverName" sort={sort} />
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
                <td className="px-2 py-2.5 whitespace-nowrap">{v.driverName || <span className="text-off">—</span>}</td>
                <td className="px-2 py-2.5 whitespace-nowrap">{v.odometer ? `${v.odometer.toLocaleString()} km` : '—'}</td>
                <td className="px-2 py-2.5">
                  {svc && <div className="font-semibold text-ink tabular-nums">{svc.due_at.toLocaleString()} km</div>}
                  <span className={'text-xs ' + (svc ? kmColour(svc.km_left) + (svc.km_left < 2000 ? ' font-medium' : '') : 'text-off')}>{serviceText(svc)}</span>
                  {svc?.booked && <span className="text-xs"><BookedNote job={svc.booked} /></span>}
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
        Service: {svc ? `due at ${svc.due_at.toLocaleString()} km · ${serviceText(svc)}` : serviceText(svc)}
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

// ── Page ──────────────────────────────────────────────────────────────────

export function FleetView({ onAdd }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [view, setViewState] = useState(readView)
  const openVehicle = (v) => navigate('vans', v.id)
  const vehiclesQuery = useQuery({ queryKey: ['vehicles', search], queryFn: () => fetchVehicles(search) })

  const setView = (v) => {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* private window etc. — the choice just won't be remembered */
    }
  }

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
            <VehicleCard key={v.id} vehicle={v} onOpen={openVehicle} />
          ))}
        </div>
      ) : (
        <FleetTable rows={shown} onOpen={openVehicle} />
      )}

    </div>
  )
}
