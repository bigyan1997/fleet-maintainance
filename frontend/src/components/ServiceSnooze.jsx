import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { patchVehicle } from '../api/vehicles'
import { useActions } from '../lib/actions'
import { fmtDate, todayIso } from '../lib/formatDate'

const CHOICES = [
  ['1 week', 7],
  ['2 weeks', 14],
  ['1 month', 30],
]

function isoPlusDays(days) {
  const [y, m, d] = todayIso().split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// Saves (or clears) the "not urgent" date for a van's service warning, then
// refreshes everything that shows it.
function useSnooze(vehicleId, label, kind = 'service') {
  const field = kind === 'tyre' ? 'tyre_snoozed_until' : 'service_snoozed_until'
  const what = kind === 'tyre' ? 'tyre warning' : 'service warning'
  const queryClient = useQueryClient()
  const { toast } = useActions()
  return useMutation({
    mutationFn: (until) => patchVehicle(vehicleId, { [field]: until }),
    onSuccess: (_data, until) => {
      for (const key of ['vehicles', 'vehicle', 'alerts', 'dashboard']) queryClient.invalidateQueries({ queryKey: [key] })
      toast?.(until ? `${label}: ${what} hidden until ${fmtDate(until)}.` : `${label}: ${what} is back on.`)
    },
    onError: () => toast?.('Could not save that. Try again.'),
  })
}

// "Not urgent" on a service-due line: pick how long to hide the warning for.
export function SnoozeButton({ vehicleId, label, kind }) {
  const [open, setOpen] = useState(false)
  const snooze = useSnooze(vehicleId, label, kind)
  const pick = (days) => {
    setOpen(false)
    snooze.mutate(isoPlusDays(days))
  }
  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={snooze.isPending}
        className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold hover:bg-[#f5f5f5]"
        title="Hide this warning for a while. It comes back by itself."
      >
        Not urgent ▾
      </button>
      {open && (
        <span className="absolute right-0 z-10 mt-1 grid min-w-[150px] rounded-md border border-line bg-white py-1 text-left shadow-lg">
          <span className="px-3 py-1 text-[11px] text-off">Hide the warning for</span>
          {CHOICES.map(([name, days]) => (
            <button key={days} onClick={() => pick(days)} className="px-3 py-1.5 text-left text-xs font-medium hover:bg-[#f5f5f5]">
              {name}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

// On the van's page: says the warning is hidden and lets you turn it back on.
export function SnoozedNote({ vehicleId, label, until, kind }) {
  const unsnooze = useSnooze(vehicleId, label, kind)
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-[#f5f6f8] px-3.5 py-2 text-[13px] text-off">
      <span>
        {kind === 'tyre' ? 'Tyre' : 'Service'} warning hidden as "not urgent" until <b className="text-ink">{fmtDate(until)}</b>. It comes back by itself that day.
      </span>
      <button
        onClick={() => unsnooze.mutate(null)}
        disabled={unsnooze.isPending}
        className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-[#f5f5f5]"
      >
        Show warning again
      </button>
    </div>
  )
}
