import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createService, deleteService } from '../api/services'
import { fetchWashes } from '../api/washes'
import { fmtAgo, fmtDate } from '../lib/formatDate'
import { useSort } from '../lib/useSort'
import { SortTh } from './SortTh'

const SORT_TYPES = { daysSince: 'number' }
const SOON_DAYS = 4 // "Due soon" this many days before the cycle is up

// Washes run on a cycle (2 weeks): green, then "Due soon" in the last few
// days, then "Due" once the cycle is up (or no wash has ever been logged).
function washState(days, cycle) {
  if (days === null || days >= cycle) return { colour: 'text-due', label: 'Due' }
  if (days >= cycle - SOON_DAYS) return { colour: 'text-warn', label: 'Due soon' }
  return { colour: 'text-ok', label: '' }
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function WashesView({ onError }) {
  const { data } = useQuery({ queryKey: ['washes'], queryFn: fetchWashes })
  const cycle = data?.cycleDays ?? 14
  const vans = data?.vans ?? []
  const recent = data?.recent ?? []
  const sort = useSort(vans, SORT_TYPES)
  const queryClient = useQueryClient()
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['washes'] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
    queryClient.invalidateQueries({ queryKey: ['vehicles'] })
  }
  // A wash is done the moment it's logged, so it's saved straight as
  // Invoiced — it never needs to sit in Jobs in progress.
  // Per-van wash date for the picker next to the button; defaults to today.
  const [washDates, setWashDates] = useState({})
  const dateFor = (vehicle) => washDates[vehicle] || today()
  const washed = useMutation({
    mutationFn: ({ vehicle, date }) => createService({ vehicle, service_type: 'Van wash', date, status: 'Invoiced' }),
    onSuccess: (_, { vehicle }) => {
      setWashDates((d) => ({ ...d, [vehicle]: '' }))
      refresh()
    },
    onError: () => onError?.('Could not log the wash.'),
  })
  const removeWash = useMutation({
    mutationFn: deleteService,
    onSuccess: refresh,
    onError: () => onError?.('Could not remove the wash.'),
  })

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Recent washes · last {cycle / 7} weeks</h2>
        {recent.length === 0 ? (
          <div className="py-6 text-center text-off">No washes logged in the last {cycle / 7} weeks.</div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-xs text-off">
                <th className="px-2 py-2 text-left font-medium">Date</th>
                <th className="px-2 py-2 text-left font-medium">Vehicle</th>
                <th className="px-2 py-2 text-left font-medium">Rego</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-[#f0f0f0] last:border-0">
                  <td className="px-2 py-2 whitespace-nowrap">
                    {fmtDate(r.date)} <span className="text-off">· {fmtAgo(r.date)}</span>
                  </td>
                  <td className="px-2 py-2">{r.vehicleLabel}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{r.rego}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={() => window.confirm(`Remove the ${fmtDate(r.date)} wash for ${r.vehicleLabel}?`) && removeWash.mutate(r.id)}
                      disabled={removeWash.isPending}
                      title="Remove (logged by mistake)"
                      className="rounded px-1.5 py-1 text-off hover:bg-due-bg hover:text-due"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border border-line bg-white p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-ink">Van washes</h2>
          <span className="text-xs text-off">
            Every {cycle / 7} weeks · <span className="text-warn">due soon</span> from day {cycle - SOON_DAYS} ·{' '}
            <span className="text-due">due</span> from day {cycle}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-xs text-off">
                <SortTh label="Vehicle" col="vehicleLabel" sort={sort} />
                <SortTh label="Rego" col="rego" sort={sort} />
                <SortTh label="Last washed" col="daysSince" sort={sort} />
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {sort.sorted.map((w) => {
                const state = washState(w.daysSince, cycle)
                return (
                  <tr key={w.vehicle} className={'border-b border-[#f0f0f0] last:border-0 ' + (w.washNeeded ? '' : 'text-off')}>
                    <td className="px-2 py-2">{w.vehicleLabel}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{w.rego}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {!w.washNeeded ? (
                        <span className="text-off">No need · driver takes it home</span>
                      ) : w.lastWashed ? (
                        <>
                          {fmtDate(w.lastWashed)}{' '}
                          <span className={'font-medium ' + state.colour}>
                            · {fmtAgo(w.lastWashed)}
                            {state.label && ` · ${state.label}`}
                          </span>
                        </>
                      ) : (
                        <span className="font-medium text-due">Never logged · Due</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {w.washNeeded && (() => {
                        const date = dateFor(w.vehicle)
                        const isToday = date === today()
                        const alreadyLogged = date === w.lastWashed
                        return (
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              type="date"
                              value={date}
                              max={today()}
                              onChange={(e) => setWashDates((d) => ({ ...d, [w.vehicle]: e.target.value }))}
                              title="Wash date"
                              className="h-[28px] rounded-md border border-line px-1.5 text-xs"
                            />
                            <button
                              onClick={() => washed.mutate({ vehicle: w.vehicle, date })}
                              disabled={washed.isPending || !date || date > today() || alreadyLogged}
                              className="rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap hover:bg-[#f5f5f5] disabled:opacity-40"
                            >
                              {alreadyLogged ? 'Logged ✓' : isToday ? 'Washed today' : `Log wash ${fmtDate(date).slice(0, 5)}`}
                            </button>
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
