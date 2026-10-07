import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { fetchVehicles } from '../api/vehicles'
import { SortTh } from './SortTh'
import { fmtAgo, fmtDate } from '../lib/formatDate'
import { kmColour, serviceText } from '../lib/fleet'
import { href, navigate } from '../lib/router'
import { statusWord } from '../lib/serviceStatus'
import { useSort } from '../lib/useSort'

const BADGE = {
  ok: { label: 'OK', className: 'bg-ok-bg text-ok', rank: 2 },
  due_soon: { label: 'Due soon', className: 'bg-warn-bg text-warn', rank: 1 },
  attention: { label: 'Attention', className: 'bg-due-bg text-due', rank: 0 },
}

const SORT_TYPES = { statusRank: 'number', odometer: 'number', serviceKm: 'number', vanNumber: 'number' }

export function StatusBadge({ status }) {
  const b = BADGE[status] ?? BADGE.ok
  return <span className={'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ' + b.className}>{b.label}</span>
}


// "· Booked 30-09-2026 (tomorrow)" — shown when a due service already has a job open.
export function BookedNote({ job }) {
  const verb = statusWord(job.status)
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
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line bg-[#fafafa] text-xs text-off">
            <SortTh label="Van" col="vanNumber" sort={sort} />
            <SortTh label="Odometer now" col="odometer" sort={sort} />
            <SortTh label="Next service" col="serviceKm" sort={sort} />
            <SortTh label="Status" col="statusRank" sort={sort} />
          </tr>
        </thead>
        <tbody>
          {sort.sorted.map((v) => {
            const svc = v.nextServiceDue
            return (
              <tr key={v.id} onClick={() => onOpen(v)} className="cursor-pointer border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]">
                <td className="px-2 py-3">
                  <div className="text-[14px] font-semibold text-ink">{v.label}</div>
                  <div className="text-xs text-off">{v.subtitle}</div>
                </td>
                <td className="px-2 py-3 whitespace-nowrap tabular-nums">{v.odometer ? `${v.odometer.toLocaleString()} km` : '—'}</td>
                <td className="px-2 py-3">
                  {svc ? (
                    <>
                      <div className="font-semibold text-ink tabular-nums">{svc.due_at.toLocaleString()} km</div>
                      <span className={'text-xs ' + kmColour(svc.km_left) + (svc.km_left < 2000 ? ' font-medium' : '')}>{svc.km_left < 0 ? serviceText(svc) : `${svc.km_left.toLocaleString()} km to go`}</span>
                      {svc.booked && <span className="text-xs"><BookedNote job={svc.booked} /></span>}
                    </>
                  ) : (
                    <span className="text-off">no service logged yet</span>
                  )}
                  {v.openJob && v.openJob.id !== svc?.booked?.id && (
                    <div className="text-[11px] font-medium text-primary">
                      🔧 {v.openJob.service_type}: {statusWord(v.openJob.status).toLowerCase()} {fmtDate(v.openJob.date)}
                    </div>
                  )}
                </td>
                <td className="px-2 py-3"><StatusBadge status={v.statusBadge} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export function FleetView({ onAdd }) {
  const [search, setSearch] = useState('')
  const openVehicle = (v) => navigate('vans', v.id)
  const vehiclesQuery = useQuery({ queryKey: ['vehicles', search], queryFn: () => fetchVehicles(search) })

  // Soonest service first (overdue ones are negative, so they lead); vans
  // with no service logged go last.
  const vehicles = useMemo(
    () =>
      (vehiclesQuery.data ?? [])
        .map((v) => ({
          ...v,
          statusRank: (BADGE[v.statusBadge] ?? BADGE.ok).rank,
          vanNumber: Number((v.label.match(/\d+/) ?? [9999])[0]),
          serviceKm: v.nextServiceDue ? v.nextServiceDue.km_left : Number.MAX_SAFE_INTEGER,
        }))
        .sort((a, b) => a.serviceKm - b.serviceKm),
    [vehiclesQuery.data],
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder='Find a van: "van 4", rego, make…'
          aria-label="Find a van"
          className="w-full max-w-[300px] rounded-md border border-line bg-white px-2.5 py-1.5 text-[13px]"
        />
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px]">
          <button onClick={onAdd} className="rounded-md border border-line bg-white px-3 py-1.5 font-medium hover:bg-[#f5f5f5]">+ Add vehicle</button>
          {[['dates', 'Rego dates'], ['drivers', 'Drivers'], ['tyres', 'Tyres'], ['qr', 'QR stickers']].map(([key, label]) => (
            <a key={key} href={href('vans', key)} className="rounded-md px-2.5 py-1.5 font-medium text-primary no-underline hover:bg-[#e8f1fb]">{label}</a>
          ))}
        </div>
      </div>

      {vehicles.length === 0 ? (
        <div className="rounded-lg border border-line bg-white py-10 text-center text-off">
          {search ? 'No van matches that search.' : (
            <>
              No vehicles yet.{' '}
              <button onClick={onAdd} className="font-medium text-primary underline">
                Add one
              </button>
            </>
          )}
        </div>
      ) : (
        <FleetTable rows={vehicles} onOpen={openVehicle} />
      )}
    </div>
  )
}
