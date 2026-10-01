import { useQuery } from '@tanstack/react-query'
import { fetchAlerts } from '../api/alerts'
import { fetchDashboard } from '../api/dashboard'
import { fetchIncidents } from '../api/incidents'
import { fetchVehicles } from '../api/vehicles'
import { fetchWashes } from '../api/washes'
import { useActions } from '../lib/actions'
import { fmtAgo, fmtDate } from '../lib/formatDate'
import { href } from '../lib/router'
import { StatusSelect } from './StatusSelect'

const money = (n) => `$${Number(n || 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`
const PILL = {
  red: 'bg-due-bg text-due',
  amber: 'bg-warn-bg text-warn',
  blue: 'bg-[#e8f1fb] text-primary',
}

function Tile({ label, value, note, tone }) {
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3">
      <div className="text-xs text-off">{label}</div>
      <div className={'text-2xl font-semibold tabular-nums ' + (tone ?? 'text-ink')}>{value}</div>
      <div className="text-[11.5px] text-off">{note}</div>
    </div>
  )
}

// Rego/insurance alerts count days; service/tyre alerts count km.
function alertText(a) {
  const n = Math.abs(a.days_or_km_left).toLocaleString()
  const days = a.title.includes('expires')
  const unit = days ? (Math.abs(a.days_or_km_left) === 1 ? 'day' : 'days') : 'km'
  const what = a.title.replace(' due', '').replace(' expires', '')
  if (days) return a.overdue ? `${what} expired ${n} ${unit} ago` : `${what} expires in ${n} ${unit}`
  return a.overdue ? `${what} overdue by ${n} ${unit}` : `${what} due in ${n} ${unit}`
}

export function HomeView() {
  const { openForm, toast } = useActions()
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: fetchAlerts })
  const washes = useQuery({ queryKey: ['washes'], queryFn: fetchWashes })
  const incidents = useQuery({ queryKey: ['incidents', { open: true }], queryFn: () => fetchIncidents({ page_size: 200 }) })
  const vehicles = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const sub = Object.fromEntries((vehicles.data ?? []).map((v) => [v.id, v.subtitle]))



  const d = dashboard.data
  const jobs = d?.inProgressServices ?? []
  const cycle = washes.data?.cycleDays ?? 14
  const dueWashes = (washes.data?.vans ?? []).filter((w) => w.washNeeded && (w.daysSince === null || w.daysSince >= cycle))

  // Everything that needs someone to do something, most urgent first.
  const items = [
    ...(alerts.data ?? [])
      .sort((a, b) => b.overdue - a.overdue || a.days_or_km_left - b.days_or_km_left)
      .map((a) => ({
        key: `a-${a.vehicleId}-${a.title}`,
        van: a.vehicle, vanId: a.vehicleId,
        text: alertText(a),
        detail: a.sub.includes('·') ? a.sub.slice(a.sub.indexOf('·') + 1).trim() : '',
        pill: a.overdue ? ['red', 'Overdue'] : ['amber', 'Due soon'],
        action: <a href={href('vans', a.vehicleId)} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold no-underline hover:bg-[#f5f5f5]">Open</a>,
      })),
    ...(incidents.data?.results ?? [])
      .filter((i) => i.status !== 'Resolved')
      .map((i) => ({
        key: `i-${i.id}`,
        van: i.vehicleLabel, vanId: i.vehicle,
        text: `${i.incident_type} (${i.severity.toLowerCase()}) on ${fmtDate(i.date)}, still ${i.status.toLowerCase()}`,
        pill: ['red', 'Incident'],
        action: <button onClick={() => openForm('incident', i)} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold hover:bg-[#f5f5f5]">Open</button>,
      })),
    ...jobs
      .filter((s) => s.status === 'Completed, awaiting invoice')
      .map((s) => ({
        key: `s-${s.id}`,
        van: s.vehicleLabel, vanId: s.vehicle,
        text: `${s.service_type} done ${fmtDate(s.date)}, waiting for the invoice`,
        pill: ['amber', 'Invoice'],
        action: (
          <button onClick={() => openForm('finish', { ...s, targetStatus: 'Invoiced' })} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-dark">
            Mark done
          </button>
        ),
      })),
    ...((() => {
      const missing = (vehicles.data ?? []).filter((v) => !v.rego_expiry || !v.insurance_expiry)
      return missing.length
        ? [{
            key: 'dates',
            van: missing.length === (vehicles.data ?? []).length ? 'All vans' : `Vans ${missing.map((v) => v.label.replace(/^Van\s*/i, '')).join(', ')}`,
            text: `Rego / insurance expiry dates not entered (${missing.length} van${missing.length === 1 ? '' : 's'}), so expiry warnings can't show yet`,
            pill: ['blue', 'Set up'],
            action: <a href={href('vans', 'dates')} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white no-underline hover:bg-primary-dark">Enter dates</a>,
          }]
        : []
    })()),
    ...(dueWashes.length
      ? [{
          key: 'washes',
          van: dueWashes.length === 1 ? dueWashes[0].vehicleLabel : `Vans ${dueWashes.map((w) => w.vehicleLabel.replace(/^Van\s*/i, '')).join(', ')}`,
          text: `Due a wash (every ${cycle / 7} weeks)`,
          pill: ['blue', 'Wash'],
          action: <a href={href('washes')} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold no-underline hover:bg-[#f5f5f5]">Go to Washes</a>,
        }]
      : []),
  ]

  const monthName = new Date().toLocaleString('en-AU', { month: 'long' })

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Needs doing" value={items.length} note="see the list below" tone={items.length ? 'text-due' : 'text-ok'} />
        <Tile label="Jobs in progress" value={jobs.length} note="booked, at mechanic or waiting for invoice" />
        <Tile
          label={`Spent in ${monthName} so far`}
          value={money(Number(d?.monthServices ?? 0) + Number(d?.monthFuel ?? 0))}
          note={`services ${money(d?.monthServices)} + fuel card ${money(d?.monthFuel)}`}
        />
      </div>

      {/* Needs doing and Jobs in progress side by side on a computer, stacked on a phone. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-semibold text-ink">Needs doing</h2>
            <span className="text-xs text-off">most urgent first</span>
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-off">All clear: nothing needs doing right now.</div>
          ) : (
            <ul className="divide-y divide-[#f0f0f0]">
              {items.map((it) => (
                <li key={it.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                  <div className="min-w-[220px] flex-1">
                    <div>
                      <a href={it.vanId ? href('vans', it.vanId) : it.key === 'dates' ? href('vans', 'dates') : href('washes')} className="text-[14px] font-semibold text-ink no-underline hover:text-primary">{it.van}</a>
                      {it.vanId && sub[it.vanId] && <span className="text-xs text-off"> · {sub[it.vanId]}</span>}
                    </div>
                    <div className="text-[13px] text-ink">{it.text}</div>
                    {it.detail && <div className="text-xs text-off">{it.detail}</div>}
                  </div>
                  <span className={'rounded-full px-2.5 py-0.5 text-[11px] font-semibold ' + PILL[it.pill[0]]}>{it.pill[1]}</span>
                  {it.action}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-semibold text-ink">Jobs in progress</h2>
            <a href={href('services')} className="text-xs font-medium text-primary no-underline hover:underline">All services →</a>
          </div>
          {jobs.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-off">Nothing in progress: every job is done.</div>
          ) : (
            <ul className="divide-y divide-[#f0f0f0]">
              {jobs.map((s) => (
                <li key={s.id} className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-[#fafafa]" onClick={() => openForm('service', s)}>
                  <div className="min-w-[220px] flex-1">
                    <div className="text-[14px] font-semibold">{s.vehicleLabel} <span className="text-xs font-normal text-off">· {s.service_type}</span></div>
                    <div className="text-xs text-off">
                      {fmtDate(s.date)} ({fmtAgo(s.date)}){s.mechanicName ? ` · ${s.mechanicName}` : ''}
                    </div>
                    {s.issues && <div className="text-xs whitespace-pre-wrap text-warn">⚠ {s.issues}</div>}
                  </div>
                  <StatusSelect service={s} onError={(m) => toast(m, true)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
