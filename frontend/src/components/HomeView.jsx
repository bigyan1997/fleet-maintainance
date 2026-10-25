import { useQuery } from '@tanstack/react-query'
import { fetchAlerts } from '../api/alerts'
import { fetchDashboard } from '../api/dashboard'
import { fetchDrivers } from '../api/extra'
import { useStock } from '../api/stock'
import { fetchIncidents } from '../api/incidents'
import { fetchVehicles } from '../api/vehicles'
import { fetchWashes } from '../api/washes'
import { useActions } from '../lib/actions'
import { daysFromToday, fmtAgo, fmtDate, fmtDayDate, sydneyMonthName, todayIso } from '../lib/formatDate'
import { kmAgeDays, kmColour, kmIsOld } from '../lib/fleet'
import { href } from '../lib/router'
import { StatusBadge } from './FleetView'
import { StatusSelect } from './StatusSelect'

const money = (n) => `$${Number(n || 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`
const PILL = {
  red: 'bg-due-bg text-due',
  amber: 'bg-warn-bg text-warn',
  blue: 'bg-[#e8f1fb] text-primary',
}

function Tile({ label, value, note, tone, children }) {
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,.04)]">
      <div className="text-xs font-medium text-off">{label}</div>
      <div className={'text-[26px] leading-tight font-semibold tabular-nums ' + (tone ?? 'text-ink')}>{value}</div>
      {children}
      <div className="text-[11.5px] text-off">{note}</div>
    </div>
  )
}

// Needs doing is split into three groups by how soon it matters.
const GROUPS = [
  ['red', 'Do first', 'bg-[#fdf3f3] text-due', 'border-l-[#d23b3b]'],
  ['amber', 'Coming up', 'bg-[#fffbea] text-warn', 'border-l-[#d9a400]'],
  ['blue', "When there's time", 'bg-[#f3f8fd] text-primary', 'border-l-[#7fb0de]'],
]

const VAN_EDGE = {
  ok: 'border-l-[#22a35a]',
  due_soon: 'border-l-[#d9a400]',
  attention: 'border-l-[#d23b3b]',
  off_road: 'border-l-[#b6bec8]',
}
// A van with a service already booked or at the mechanic gets its own colour
// (blue / purple) in place of the green "OK", unless something else needs attention.
const JOB_LOOK = {
  booked: { label: 'Booked', edge: 'border-l-[#2f7fd0]', pill: 'bg-[#dbeafe] text-[#1e4fa3]', text: 'text-[#1e4fa3]' },
  kmmissing: { label: 'Km missing', edge: 'border-l-[#d9a400]', pill: 'bg-warn-bg text-warn', text: 'text-warn' },
  mechanic: { label: 'At mechanic', edge: 'border-l-[#7c3aed]', pill: 'bg-[#ede9fe] text-[#5b21b6]', text: 'text-[#5b21b6]' },
}
const vanNo = (v) => Number((v.label.match(/\d+/) ?? [9999])[0])

// Every van at a glance: its status and how far it is from the next service.
function VanStrip({ vans }) {
  if (!vans.length) return null
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-[15px] font-semibold text-ink">
          Your vans <span className="text-xs font-normal text-off">· km to each van's next service · click a van to open it</span>
        </h2>
        <a href={href('vans')} className="text-xs font-medium text-primary no-underline hover:underline">All vans →</a>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]">
        {[...vans].sort((a, b) => vanNo(a) - vanNo(b)).map((v) => {
          const svc = v.nextServiceDue
          const n = svc ? Math.abs(svc.km_left).toLocaleString() : ''
          const job = !v.off_road && v.statusBadge === 'ok'
            ? svc?.booked ? JOB_LOOK[svc.booked.status === 'Booked' ? 'booked' : 'mechanic'] : svc?.km_missing ? JOB_LOOK.kmmissing : null
            : null
          return (
            <a
              key={v.id}
              href={href('vans', v.id)}
              className={'rounded-lg border border-l-4 border-line bg-white px-3 py-2 no-underline shadow-[0_1px_2px_rgba(16,24,40,.04)] hover:bg-[#f7fafd] ' + (job ? job.edge : VAN_EDGE[v.statusBadge] ?? VAN_EDGE.ok)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold text-ink">{v.label}</span>
                {job ? <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ' + job.pill}>{job.label}</span> : <StatusBadge status={v.statusBadge} />}
              </div>
              <div className={'mt-0.5 text-xs tabular-nums ' + ((!v.off_road && svc && !svc.booked && kmColour(svc.km_left)) || (job ? job.text : svc?.booked ? 'text-primary' : 'text-off'))}>
                {v.off_road ? 'not being driven' : svc?.km_missing && !svc.booked ? 'service done, km not entered' : svc?.booked ? `service ${svc.booked.status === 'Booked' ? `booked ${fmtDate(svc.booked.date).slice(0, 5)}` : 'at the mechanic'}` : !svc ? 'no service logged yet' : svc.km_left < 0 ? `service ${n} km overdue` : `service in ${n} km`}
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}

// Rego alerts count days; service/tyre alerts count km.
function alertText(a) {
  const n = Math.abs(a.days_or_km_left).toLocaleString()
  const days = a.title.includes('expires')
  const unit = days ? (Math.abs(a.days_or_km_left) === 1 ? 'day' : 'days') : 'km'
  const what = a.title.replace(' due', '').replace(' expires', '')
  if (days) return a.overdue ? `${what} expired ${n} ${unit} ago` : `${what} expires in ${n} ${unit}`
  return a.overdue ? `${what} overdue by ${n} ${unit}` : `${what} due in ${n} ${unit}`
}

// Each service's invoice arrives about a month after the work. Up to 6 weeks
// is normal; after that it's late and goes on the Needs doing list.
const INVOICE_LATE_DAYS = 45

function addMonth(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m, 1))
  dt.setUTCDate(Math.min(d, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()))
  return dt.toISOString().slice(0, 10)
}

function daysSince(iso) {
  return -daysFromToday(iso)
}

export function HomeView() {
  const { openForm, toast } = useActions()
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: fetchAlerts })
  const washes = useQuery({ queryKey: ['washes'], queryFn: fetchWashes })
  const incidents = useQuery({ queryKey: ['incidents', { open: true }], queryFn: () => fetchIncidents({ page_size: 200 }) })
  const vehicles = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const drivers = useQuery({ queryKey: ['drivers'], queryFn: fetchDrivers })
  const stock = useStock()
  const sub = Object.fromEntries((vehicles.data ?? []).map((v) => [v.id, v.subtitle]))



  const d = dashboard.data
  const allJobs = d?.inProgressServices ?? []
  // Unfinished work (booked / at the mechanic) vs finished work waiting for its invoice.
  const jobs = allJobs.filter((s) => s.status !== 'Completed, awaiting invoice')
  const waiting = allJobs
    .filter((s) => s.status === 'Completed, awaiting invoice')
    .map((s) => ({ ...s, expected: addMonth(s.date), late: daysSince(s.date) > INVOICE_LATE_DAYS }))
  const cycle = washes.data?.cycleDays ?? 14
  const dueWashes = (washes.data?.vans ?? []).filter((w) => w.washNeeded && (w.daysSince === null || w.daysSince >= cycle))

  const today = todayIso()
  const allAlerts = alerts.data ?? []
  // Why a booked job matters, e.g. "service overdue by 1,629 km" (shown on it).
  const reasonFor = Object.fromEntries(allAlerts.filter((a) => a.booked).map((a) => [a.booked.id, alertText(a)]))
  const missedBooking = (a) => a.booked && a.booked.status === 'Booked' && a.booked.date < today

  // Everything that needs someone to do something, most urgent first.
  const items = [
    ...allAlerts
      .filter((a) => !a.booked || missedBooking(a))
      .sort((a, b) => b.overdue - a.overdue || a.days_or_km_left - b.days_or_km_left)
      .map((a) => missedBooking(a) ? ({
        key: `m-${a.booked.id}`,
        van: a.vehicle, vanId: a.vehicleId,
        text: `Booked for ${fmtDayDate(a.booked.date)} but not done yet`,
        detail: alertText(a),
        pill: ['amber', 'Check booking'],
        action: (
          <button onClick={() => { const job = allJobs.find((j) => j.id === a.booked.id); if (job) openForm('service', job) }} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold hover:bg-[#f5f5f5]">
            Open
          </button>
        ),
      }) : ({
        key: `a-${a.vehicleId}-${a.title}`,
        van: a.vehicle, vanId: a.vehicleId,
        text: alertText(a),
        detail: a.sub.includes('·') ? a.sub.slice(a.sub.indexOf('·') + 1).trim() : '',
        pill: a.overdue ? ['red', 'Overdue'] : ['amber', 'Due soon'],
        // Rego dates are changed on the Rego dates page, not on the van's history.
        action: a.title.includes('Registration')
          ? <a href={href('vans', 'dates')} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold no-underline hover:bg-[#f5f5f5]">Update rego date</a>
          : <a href={href('vans', a.vehicleId)} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold no-underline hover:bg-[#f5f5f5]">Open</a>,
      })),
    // Drivers' licences: expired ones first, then those within 30 days (the
    // server decides the status). People who have left aren't chased.
    ...(drivers.data ?? [])
      .filter((dr) => dr.active && (dr.licenceStatus === 'expired' || dr.licenceStatus === 'due_soon'))
      .sort((a, b) => a.licenceDaysLeft - b.licenceDaysLeft)
      .map((dr) => {
        const n = Math.abs(dr.licenceDaysLeft)
        const unit = n === 1 ? 'day' : 'days'
        return {
          key: `d-${dr.id}`,
          van: dr.name,
          link: href('vans', 'drivers', dr.id),
          sub: `driver${dr.vans.length ? ` · usually ${dr.vans.map((v) => v.label).join(', ')}` : ''}`,
          text: dr.licenceStatus === 'expired' ? `Driver's licence expired ${n} ${unit} ago` : n === 0 ? "Driver's licence expires today" : `Driver's licence expires in ${n} ${unit}`,
          detail: `Licence expiry ${fmtDate(dr.licence_expiry)}. Update it on their page once it's renewed.`,
          pill: dr.licenceStatus === 'expired' ? ['red', 'Overdue'] : ['amber', 'Due soon'],
          action: <a href={href('vans', 'drivers', dr.id)} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold no-underline hover:bg-[#f5f5f5]">Open</a>,
        }
      }),
    ...(incidents.data?.results ?? [])
      .filter((i) => i.status !== 'Resolved')
      .map((i) => ({
        key: `i-${i.id}`,
        van: i.vehicleLabel, vanId: i.vehicle,
        text: `${i.incident_type} (${i.severity.toLowerCase()}) on ${fmtDayDate(i.date)}, still ${i.status.toLowerCase()}`,
        pill: ['red', 'Incident'],
        action: <button onClick={() => openForm('incident', i)} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold hover:bg-[#f5f5f5]">Open</button>,
      })),
    ...waiting
      .filter((s) => s.late)
      .map((s) => ({
        key: `s-${s.id}`,
        van: s.vehicleLabel, vanId: s.vehicle,
        text: `Invoice late: ${s.service_type.toLowerCase()} done ${fmtDayDate(s.date)}, invoice was expected around ${fmtDayDate(s.expected)}`,
        detail: s.mechanicName ? `Check with ${s.mechanicName}` : 'Check with the mechanic',
        pill: ['amber', 'Invoice late'],
        action: (
          <button onClick={() => openForm('finish', { ...s, targetStatus: 'Invoiced' })} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-dark">
            Invoice arrived
          </button>
        ),
      })),
    ...((() => {
      const missing = (vehicles.data ?? []).filter((v) => !v.rego_expiry)
      return missing.length
        ? [{
            key: 'dates',
            van: missing.length === (vehicles.data ?? []).length ? 'All vans' : `Vans ${missing.map((v) => v.label.replace(/^Van\s*/i, '')).join(', ')}`,
            text: `Rego date missing for ${missing.length} van${missing.length === 1 ? '' : 's'}, so the rego expiry warning can't show yet`,
            pill: ['blue', 'Set up'],
            action: <a href={href('vans', 'dates')} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white no-underline hover:bg-primary-dark">Open</a>,
          }]
        : []
    })()),
    // Spare parts that dropped below their order level (or ran out).
    ...(stock.data ?? [])
      .filter((i) => i.status !== 'ok')
      .map((i) => ({
        key: `stock-${i.id}`,
        van: i.name,
        text: i.status === 'out' ? 'Out of stock. Order now' : `Order now: only ${i.quantity} left (order when below ${i.order_below})`,
        pill: [i.status === 'out' ? 'red' : 'amber', 'Order now'],
        action: <a href={href('services', 'stock')} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold no-underline hover:bg-[#f5f5f5]">Open</a>,
      })),
    // A scheduled service finished without its km: the next service can't be worked out until it is typed in.
    ...(vehicles.data ?? [])
      .filter((v) => !v.off_road && v.nextServiceDue?.km_missing && !v.nextServiceDue.booked)
      .map((v) => ({
        key: `kmmiss-${v.id}`,
        van: v.label, vanId: v.id,
        text: `Scheduled service done ${fmtDayDate(v.nextServiceDue.km_missing.date)}, but no km was entered, so the next service can't be worked out`,
        pill: ['amber', 'Km missing'],
        action: (
          <button onClick={() => openForm('service', { id: v.nextServiceDue.km_missing.id })} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-dark">
            Enter km
          </button>
        ),
      })),
    ...((() => {
      const old = (vehicles.data ?? []).filter(kmIsOld)
      if (!old.length) return []
      const oldest = Math.max(...old.map((v) => kmAgeDays(v) ?? 0))
      return [{
        key: 'km-old',
        van: old.length === 1 ? old[0].label : `Vans ${old.map((v) => v.label.replace(/^Van\s*/i, '')).join(', ')}`,
        vanId: old.length === 1 ? old[0].id : null,
        text: oldest > 0
          ? `km not updated for ${oldest} days, so the next service countdown may be wrong`
          : "km wasn't taken from a fill-up or service, so the next service countdown may be wrong",
        pill: ['amber', 'Km old'],
        action: <a href={old.length === 1 ? href('vans', old[0].id) : href('vans')} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold no-underline hover:bg-[#f5f5f5]">Open</a>,
      }]
    })()),
    ...(dueWashes.length
      ? [{
          key: 'washes',
          van: dueWashes.length === 1 ? dueWashes[0].vehicleLabel : `Vans ${dueWashes.map((w) => w.vehicleLabel.replace(/^Van\s*/i, '')).join(', ')}`,
          text: `Due a wash (every ${cycle / 7} weeks)`,
          pill: ['blue', 'Wash'],
          action: <a href={href('washes')} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold no-underline hover:bg-[#f5f5f5]">Open</a>,
        }]
      : []),
  ]

  const monthName = sydneyMonthName()
  const spent = Number(d?.monthServices ?? 0) + Number(d?.monthFuel ?? 0) + Number(d?.monthTolls ?? 0)
  // e.g. "Van 9 booked for 07-10" (one or two jobs) or "2 booked · 1 at the mechanic".
  const booked = jobs.filter((j) => j.status === 'Booked')
  const atMechanic = jobs.filter((j) => j.status !== 'Booked')
  const jobsNote = [
    jobs.length === 0
      ? 'nothing booked or at the mechanic'
      : jobs.length <= 2
        ? jobs.map((j) => `${j.vehicleLabel} ${j.status === 'Booked' ? `booked for ${fmtDate(j.date).slice(0, 5)}` : 'at the mechanic'}`).join(' · ')
        : [booked.length && `${booked.length} booked`, atMechanic.length && `${atMechanic.length} at the mechanic`].filter(Boolean).join(' · '),
    waiting.length && `${waiting.length} waiting for an invoice`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Needs doing" value={items.length} note="see the list below" tone={items.length ? 'text-due' : 'text-ok'} />
        <Tile label="Booked & at the mechanic" value={jobs.length} note={jobsNote} />
        <Tile
          label={`Spent in ${monthName} so far`}
          value={money(spent)}
          note={`services ${money(d?.monthServices)} + fuel card ${money(d?.monthFuel)} + tolls ${money(d?.monthTolls ?? 0)}`}
        >
          {spent > 0 && (
            <div className="my-1.5 flex h-1.5 overflow-hidden rounded-full bg-[#eef1f5]" aria-hidden="true">
              <div className="bg-primary" style={{ width: `${(Number(d?.monthServices ?? 0) / spent) * 100}%` }} />
              <div className="bg-[#5aa0dd]" style={{ width: `${(Number(d?.monthFuel ?? 0) / spent) * 100}%` }} />
              <div className="bg-[#b9d6f0]" style={{ width: `${(Number(d?.monthTolls ?? 0) / spent) * 100}%` }} />
            </div>
          )}
        </Tile>
      </div>

      <VanStrip vans={vehicles.data ?? []} />

      {/* Needs doing on the left; work at the mechanic and invoices on the right (stacked on a phone). */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-semibold text-ink">Needs doing</h2>
            <span className="text-xs text-off">{items.length ? `${items.length} thing${items.length === 1 ? '' : 's'}, most urgent first` : ''}</span>
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-off">All clear: nothing needs doing right now.</div>
          ) : (
            GROUPS.map(([tone, title, head, edge]) => {
              const rows = items.filter((it) => it.pill[0] === tone)
              if (!rows.length) return null
              return (
                <div key={tone}>
                  <div className={'border-b border-[#f0f0f0] px-4 py-1.5 text-xs font-semibold ' + head}>
                    {title} <span className="font-normal">· {rows.length}</span>
                  </div>
                  <ul className="divide-y divide-[#f0f0f0] border-b border-[#f0f0f0]">
                    {rows.map((it) => (
                      <li key={it.key} className={'flex flex-wrap items-center gap-x-3 gap-y-1.5 border-l-4 py-3 pr-4 pl-3 ' + edge}>
                        <div className="min-w-[220px] flex-1">
                          <div>
                            <a href={it.link ? it.link : it.vanId ? href('vans', it.vanId) : it.key === 'dates' ? href('vans', 'dates') : it.key === 'km-old' ? href('vans') : href('washes')} className="text-[14px] font-semibold text-ink no-underline hover:text-primary">{it.van}</a>
                            {it.vanId && sub[it.vanId] && <span className="text-xs text-off"> · {sub[it.vanId]}</span>}
                            {it.sub && <span className="text-xs text-off"> · {it.sub}</span>}
                          </div>
                          <div className="text-[13px] text-ink">{it.text}</div>
                          {it.detail && <div className="text-xs text-off">{it.detail}</div>}
                        </div>
                        <span className={'rounded-full px-2.5 py-0.5 text-[11px] font-semibold ' + PILL[it.pill[0]]}>{it.pill[1]}</span>
                        {it.action}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })
          )}
        </div>

        <div className="grid min-w-0 gap-4">
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
              <h2 className="text-[15px] font-semibold text-ink">Booked &amp; at the mechanic</h2>
              <a href={href('services')} className="text-xs font-medium text-primary no-underline hover:underline">All services →</a>
            </div>
            {jobs.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] text-off">Nothing booked or at the mechanic.</div>
            ) : (
              <ul className="divide-y divide-[#f0f0f0]">
                {jobs.map((s) => (
                  <li key={s.id} className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-[#fafafa]" onClick={() => openForm('service', s)}>
                    <div className="min-w-[200px] flex-1">
                      <div className="text-[14px] font-semibold">{s.vehicleLabel} <span className="text-xs font-normal text-off">· {s.service_type}</span></div>
                      <div className="text-xs text-off">
                        {fmtDayDate(s.date)} ({fmtAgo(s.date)}){s.mechanicName ? ` · ${s.mechanicName}` : ''}
                      </div>
                      {reasonFor[s.id] && <div className="text-xs font-medium text-due">{reasonFor[s.id]}</div>}
                      {s.issues && <div className="text-xs whitespace-pre-wrap text-warn">⚠ {s.issues}</div>}
                    </div>
                    <StatusSelect service={s} onError={(m) => toast(m, true)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-line bg-white">
            <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
              <h2 className="text-[15px] font-semibold text-ink">Waiting for invoices</h2>
              <span className="text-xs text-off">usually a month after the work</span>
            </div>
            {waiting.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] text-off">No invoices outstanding.</div>
            ) : (
              <ul className="divide-y divide-[#f0f0f0]">
                {waiting.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                    <div className="min-w-[200px] flex-1">
                      <div className="text-[14px] font-semibold">{s.vehicleLabel} <span className="text-xs font-normal text-off">· {s.service_type}</span></div>
                      <div className={'text-xs ' + (s.late ? 'font-medium text-warn' : 'text-off')}>
                        done {fmtDayDate(s.date)} · invoice {s.late ? 'was expected' : 'expected'} around {fmtDayDate(s.expected)}
                        {s.mechanicName ? ` · ${s.mechanicName}` : ''}
                      </div>
                    </div>
                    <button onClick={() => openForm('finish', { ...s, targetStatus: 'Invoiced' })} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold hover:bg-[#f5f5f5]">
                      Invoice arrived
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
