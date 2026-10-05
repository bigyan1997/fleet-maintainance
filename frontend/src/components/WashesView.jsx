import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createService, deleteService } from '../api/services'
import { fetchWashes } from '../api/washes'
import { useActions } from '../lib/actions'
import { fmtAgo, fmtDate, todayIso } from '../lib/formatDate'
import { ConfirmDialog } from './ConfirmDialog'

const SOON_DAYS = 4 // a van shows "due in N days" this close to the end of its cycle

// Sydney's date, whatever time zone this device is set to.
const today = todayIso

// Washes run on a 2-week cycle. Vans due (or never washed) come first, each
// with one button; recent washes underneath; take-home vans fold away.
export function WashesView({ onError }) {
  const { data } = useQuery({ queryKey: ['washes'], queryFn: fetchWashes })
  const { openForm, toast } = useActions()
  const queryClient = useQueryClient()
  const [removing, setRemoving] = useState(null)
  const cycle = data?.cycleDays ?? 14
  const vans = data?.vans ?? []
  const recent = data?.recent ?? []

  const refresh = () => {
    for (const key of ['washes', 'services', 'vehicles']) queryClient.invalidateQueries({ queryKey: [key] })
  }
  // A wash is done the moment it's logged, so it's saved straight as done.
  const washed = useMutation({
    mutationFn: (vehicle) => createService({ vehicle, service_type: 'Van wash', date: today(), status: 'Invoiced' }),
    onSuccess: () => { refresh(); toast('Wash logged for today.') },
    onError: () => onError?.('Could not log the wash.'),
  })
  const remove = useMutation({
    mutationFn: (w) => deleteService(w.id),
    onSuccess: () => { refresh(); setRemoving(null); toast('Wash removed.') },
    onError: () => onError?.('Could not remove the wash.'),
  })

  const onCycle = vans.filter((w) => w.washNeeded)
  const takeHome = vans.filter((w) => !w.washNeeded)
  const due = onCycle
    .filter((w) => w.daysSince === null || w.daysSince >= cycle - SOON_DAYS)
    .sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999))

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Due a wash</h2>
          <span className="text-xs text-off">every {cycle / 7} weeks</span>
        </div>
        {due.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-off">All washed: nothing due right now.</div>
        ) : (
          <ul className="divide-y divide-[#f0f0f0]">
            {due.map((w) => {
              const overdue = w.daysSince === null || w.daysSince >= cycle
              const loggedToday = w.lastWashed === today()
              return (
                <li key={w.vehicle} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                  <div className="min-w-[160px] flex-1">
                    <span className="text-[14px] font-semibold">{w.vehicleLabel}</span> <span className="text-xs text-off">· {w.rego}</span>
                  </div>
                  <span className={'text-xs font-medium ' + (overdue ? 'text-due' : 'text-warn')}>
                    {w.lastWashed ? `last washed ${fmtDate(w.lastWashed)} (${fmtAgo(w.lastWashed)})` : 'never logged'}
                    {!overdue && ` · due in ${cycle - w.daysSince} day${cycle - w.daysSince === 1 ? '' : 's'}`}
                  </span>
                  <button
                    disabled={washed.isPending || loggedToday}
                    onClick={() => washed.mutate(w.vehicle)}
                    className="rounded-md bg-primary px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    {loggedToday ? 'Logged ✓' : 'Washed today'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Washed recently</h2>
          <span className="text-xs text-off">last {cycle / 7} weeks</span>
        </div>
        {recent.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-off">No washes logged in the last {cycle / 7} weeks.</div>
        ) : (
          <ul className="divide-y divide-[#f0f0f0]">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 px-4 py-2.5">
                <div className="min-w-[160px] flex-1">
                  <span className="text-[14px] font-semibold">{r.vehicleLabel}</span> <span className="text-xs text-off">· {r.rego}</span>
                </div>
                <span className="text-xs font-medium text-ok">{fmtDate(r.date)} · {fmtAgo(r.date)}</span>
                <button onClick={() => setRemoving(r)} title="Remove (logged by mistake)" className="rounded px-1.5 py-1 text-off hover:bg-due-bg hover:text-due">✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 text-[13px]">
        {takeHome.length > 0 && (
          <details className="text-off">
            <summary className="cursor-pointer font-medium text-primary">
              {takeHome.length} van{takeHome.length === 1 ? ' goes' : 's go'} home with the driver and {takeHome.length === 1 ? "isn't" : "aren't"} washed here
            </summary>
            <div className="mt-1.5">{takeHome.map((w) => w.vehicleLabel).join(', ')}. Change this in the van's Details → Edit.</div>
          </details>
        )}
        <button onClick={() => openForm('wash')} className="font-medium text-primary hover:underline">Log a past wash</button>
      </div>

      {removing && (
        <ConfirmDialog
          title="Remove this wash?"
          message={`Remove the ${fmtDate(removing.date)} wash for ${removing.vehicleLabel}? Only do this if it was logged by mistake.`}
          confirmLabel="Remove"
          confirming={remove.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove.mutate(removing)}
        />
      )}
    </div>
  )
}
