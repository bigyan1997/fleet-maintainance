import { useQuery } from '@tanstack/react-query'
import { fetchActivity } from '../api/extra'
import { fmtAgo, fmtDate, fmtDateTime } from '../lib/formatDate'
import { Empty, Pill } from './ui'

const KIND_TONE = { Service: 'ok', Fuel: 'info', Wash: 'off', Incident: 'due', Van: 'info', Document: 'info', Driver: 'off', Mechanic: 'off', Budget: 'warn' }

// Every add, change and delete for one van, newest first, with who did it.
export function ChangeHistory({ vehicle }) {
  const { data } = useQuery({ queryKey: ['activity', { vehicle }], queryFn: () => fetchActivity({ vehicle, limit: 300 }) })
  const rows = data ?? []
  if (rows.length === 0) return <Empty>Nothing recorded yet. Every change from now on appears here with who made it.</Empty>
  return (
    <ul>
      {rows.map((r, i) => {
        const day = r.created_at.slice(0, 10)
        const header = i === 0 || day !== rows[i - 1].created_at.slice(0, 10)
        return (
          <li key={r.id}>
            {header && <div className="bg-[#f8fafc] px-4 py-1.5 text-[11.5px] font-semibold tracking-wide text-off uppercase">{fmtDate(day)} · {fmtAgo(day)}</div>}
            <div className="grid grid-cols-[52px_78px_1fr] items-baseline gap-3 border-b border-[#eef1f5] px-4 py-2.5 text-[13px]">
              <span className="text-xs text-off tabular-nums">{fmtDateTime(r.created_at).slice(11)}</span>
              <span><Pill tone={KIND_TONE[r.kind] ?? 'off'}>{r.kind}</Pill></span>
              <span className="min-w-0">
                <span className="font-semibold">{r.who_label || 'Someone'}</span> <span className="text-off">{r.action.toLowerCase()}</span> {r.summary}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
