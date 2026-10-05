import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { createDriver, deleteDriver, fetchDrivers, patchVehicle, updateDriver } from '../api/extra'
import { fetchServices } from '../api/services'
import { fetchVehicles } from '../api/vehicles'
import { useActions } from '../lib/actions'
import { daysFromToday, fmtAgo, fmtDate } from '../lib/formatDate'
import { href } from '../lib/router'
import { ConfirmDialog } from './ConfirmDialog'
import { Button, Card, Empty, Pill } from './ui'

const km = (n) => `${Number(n).toLocaleString()} km`
const inputCls = 'h-9 rounded-md border border-line bg-white px-2.5 text-[13px] focus:border-primary focus:outline-none'

function useVans() {
  return useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
}

function sortVans(vans) {
  return [...vans].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
}

// ── Drivers ────────────────────────────────────────────────────────────────

export function DriversView() {
  const queryClient = useQueryClient()
  const { toast } = useActions()
  const drivers = useQuery({ queryKey: ['drivers'], queryFn: fetchDrivers })
  const vans = useVans()
  const [form, setForm] = useState({ name: '', phone: '' })
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['drivers'] })
    queryClient.invalidateQueries({ queryKey: ['vehicles'] })
  }
  const add = useMutation({
    mutationFn: () => createDriver(form),
    onSuccess: () => { refresh(); setForm({ name: '', phone: '' }); toast('Driver added.') },
    onError: () => toast('Could not add the driver.', true),
  })
  const save = useMutation({
    mutationFn: (d) => updateDriver(d.id, { name: d.name, phone: d.phone, active: d.active }),
    onSuccess: () => { refresh(); setEditing(null); toast('Driver saved.') },
    onError: () => toast('Could not save the driver.', true),
  })
  const remove = useMutation({
    mutationFn: (d) => deleteDriver(d.id),
    onSuccess: () => { refresh(); setRemoving(null); toast('Driver removed.') },
  })
  const assign = useMutation({
    mutationFn: ({ van, driver }) => patchVehicle(van.id, { driver }),
    onSuccess: (v) => { refresh(); toast(v.driverName ? `${v.label}: ${v.driverName} is now the usual driver.` : `${v.label}: no regular driver.`) },
    onError: () => toast('Could not change the driver.', true),
  })
  const list = drivers.data ?? []
  const active = list.filter((d) => d.active)

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card title="Drivers" description="The people who drive the vans. Their name then shows on the van, its incidents and fuel checks." padded={false}>
        <form
          className="flex flex-wrap gap-2 border-b border-line p-4"
          onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) add.mutate() }}
        >
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Driver's name" aria-label="Driver's name" className={inputCls + ' min-w-[160px] flex-1'} />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Mobile (optional)" aria-label="Mobile" className={inputCls + ' w-[160px]'} />
          <Button type="submit" variant="primary" icon="plus" disabled={!form.name.trim() || add.isPending}>Add driver</Button>
        </form>
        {list.length === 0 ? (
          <Empty>No drivers yet. Add the first one above.</Empty>
        ) : (
          <ul className="divide-y divide-[#eef1f5]">
            {list.map((d) =>
              editing?.id === d.id ? (
                <li key={d.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Name" className={inputCls + ' min-w-[140px] flex-1'} />
                  <input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} aria-label="Mobile" className={inputCls + ' w-[150px]'} />
                  <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Still driving for us</label>
                  <Button variant="primary" className="h-8 text-xs" onClick={() => save.mutate(editing)}>Save</Button>
                  <Button variant="ghost" className="h-8 text-xs" onClick={() => setEditing(null)}>Cancel</Button>
                </li>
              ) : (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold">{d.name}</span> {!d.active && <Pill tone="off">Left</Pill>}
                    <div className="text-xs text-off">
                      {d.phone || 'no mobile'} · {d.vans.length ? d.vans.map((v) => v.label).join(', ') : 'no van assigned'}
                    </div>
                  </div>
                  <Button variant="ghost" icon="edit" className="h-8 text-xs" onClick={() => setEditing({ ...d })}>Edit</Button>
                  <Button variant="ghost" icon="trash" className="h-8 text-xs" onClick={() => setRemoving(d)}>Remove</Button>
                </li>
              ),
            )}
          </ul>
        )}
      </Card>

      <Card title="Who drives which van" description="Pick each van's usual driver. It saves straight away." padded={false}>
        <ul className="divide-y divide-[#eef1f5]">
          {sortVans(vans.data ?? []).map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
              <a href={href('vans', v.id)} className="font-medium hover:text-primary">{v.label} <span className="font-normal text-off">{v.rego}</span></a>
              <select
                value={v.driver ?? ''}
                disabled={assign.isPending}
                onChange={(e) => assign.mutate({ van: v, driver: e.target.value ? Number(e.target.value) : null })}
                aria-label={`Driver for ${v.label}`}
                className={inputCls + ' w-[200px]'}
              >
                <option value="">No regular driver</option>
                {active.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                {v.driver && !active.some((d) => d.id === v.driver) && <option value={v.driver}>{v.driverName}</option>}
              </select>
            </li>
          ))}
        </ul>
      </Card>

      {removing && (
        <ConfirmDialog
          title="Remove driver?"
          message={`Remove ${removing.name}? ${removing.vans.length ? 'Their van will show no regular driver. ' : ''}If they've just left, you can instead edit them and untick "Still driving for us" to keep the history.`}
          confirmLabel="Remove"
          confirming={remove.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove.mutate(removing)}
        />
      )}
    </div>
  )
}

// ── Tyres ──────────────────────────────────────────────────────────────────

function IntervalInput({ van }) {
  const queryClient = useQueryClient()
  const { toast } = useActions()
  const [value, setValue] = useState(van.tyre_interval_km ?? '')
  const save = useMutation({
    mutationFn: () => patchVehicle(van.id, { tyre_interval_km: value === '' ? null : Number(value) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['vehicles'] }); toast(`${van.label}: tyre interval saved.`) },
    onError: () => toast('Could not save the interval.', true),
  })
  const changed = String(value) !== String(van.tyre_interval_km ?? '')
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min="0"
        step="1000"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && changed && save.mutate()}
        placeholder="not set"
        aria-label={`Tyre interval for ${van.label}`}
        className={inputCls + ' w-[110px] text-right tabular-nums'}
      />
      <span className="text-xs text-off">km</span>
      {changed && <Button variant="primary" className="h-8 px-2.5 text-xs" disabled={save.isPending} onClick={() => save.mutate()}>Save</Button>}
    </div>
  )
}

export function TyresView() {
  const vans = useVans()
  const { openForm } = useActions()
  const changes = useQuery({
    queryKey: ['services', { service_type: 'Tyre replacement', page_size: 1000 }],
    queryFn: () => fetchServices({ service_type: 'Tyre replacement', page_size: 1000 }),
  })
  const lastChange = {}
  for (const s of changes.data?.results ?? []) {
    if (!lastChange[s.vehicle] || s.date > lastChange[s.vehicle].date) lastChange[s.vehicle] = s
  }
  const rows = sortVans(vans.data ?? []).sort((a, b) => (a.nextTyreDue?.km_left ?? 1e9) - (b.nextTyreDue?.km_left ?? 1e9))

  return (
    <Card
      title="Tyres"
      description="When each van last had new tyres and when the next set is due. Set each van's tyre interval (how many km a set lasts) to get warnings on Home."
      padded={false}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line bg-[#f8fafc] text-left text-xs text-off">
              <th className="px-4 py-2 font-medium">Van</th>
              <th className="px-2 py-2 text-right font-medium">Odometer</th>
              <th className="px-2 py-2 font-medium">Last new tyres</th>
              <th className="px-2 py-2 font-medium">Tyres last for</th>
              <th className="px-2 py-2 text-right font-medium">Next set due at</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const last = lastChange[v.id]
              const due = v.nextTyreDue
              const tone = !due ? 'off' : due.km_left < 0 ? 'due' : due.km_left < 2000 ? 'warn' : 'ok'
              const text = !due ? (v.tyre_interval_km ? 'No tyre change logged' : 'Interval not set') : due.km_left < 0 ? `${km(-due.km_left)} overdue` : `${km(due.km_left)} to go`
              return (
                <tr key={v.id} className="border-b border-[#eef1f5] last:border-0">
                  <td className="px-4 py-2.5"><a href={href('vans', v.id)} className="font-medium hover:text-primary">{v.label}</a></td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{v.odometer ? km(v.odometer) : '—'}</td>
                  <td className="px-2 py-2.5">{last ? <>{fmtDate(last.date)} <span className="text-off">· {last.odometer ? km(last.odometer) : 'no km'} · {fmtAgo(last.date)}</span></> : <span className="text-off">never logged</span>}</td>
                  <td className="px-2 py-2.5"><IntervalInput key={v.tyre_interval_km ?? 'none'} van={v} /></td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{due ? km(due.due_at) : '—'}</td>
                  <td className="px-2 py-2.5"><Pill tone={tone}>{text}</Pill></td>
                  <td className="px-4 py-2.5 text-right">
                    <Button className="h-8 text-xs" onClick={() => openForm('service', { vehicle: v.id, service_type: 'Tyre replacement', status: 'Invoiced', odometer: v.odometer || '' })}>
                      Log new tyres
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-2.5 text-xs text-off">
        "Next set due at" = odometer at the last tyre change + the van's interval. Logging new tyres is a service of type "Tyre replacement", so it also shows in the van's history.
      </p>
    </Card>
  )
}

// ── QR stickers ────────────────────────────────────────────────────────────

function QrImage({ text }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let live = true
    QRCode.toDataURL(text, { margin: 1, width: 360, errorCorrectionLevel: 'M' }).then((url) => live && setSrc(url))
    return () => { live = false }
  }, [text])
  return src ? <img src={src} alt="" className="h-[150px] w-[150px]" /> : <div className="h-[150px] w-[150px] bg-[#f1f4f8]" />
}

export function QrStickers() {
  const vans = useVans()
  // This PC's own names (localhost, 127.0.0.1, the dev server) mean nothing
  // to a phone, so fall back to the office address.
  const [base, setBase] = useState(() =>
    /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) ? 'http://DESKTOP-OB7PD9F:8001' : window.location.origin,
  )
  const list = sortVans(vans.data ?? [])
  return (
    <div className="grid gap-4">
      <Card title="QR stickers for the vans" description="Print this page, cut out each sticker and put it inside the matching van (e.g. on the dash or sun visor). A driver scans it with their phone camera to report a problem or say they washed the van. No login needed, and they only see that one van.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium text-off">
            Address the phones will open
            <input value={base} onChange={(e) => setBase(e.target.value.replace(/\/+$/, ''))} className={inputCls + ' w-[320px] font-mono text-xs'} />
          </label>
          <Button variant="primary" icon="sheet" onClick={() => window.print()}>Print stickers</Button>
        </div>
        <p className="mt-3 max-w-[80ch] text-xs text-off">
          Phones can only open it while on the office Wi-Fi, or with Tailscale on the phone. Reports go straight into Services → Incidents and show on Home, marked "Reported by … using the van's QR sticker".
        </p>
      </Card>
      <div className="print-area grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.length === 0 && <Empty>No vans yet.</Empty>}
        {list.map((v) => {
          const url = `${base}/report/${v.report_token}/`
          return (
            <div key={v.id} className="flex break-inside-avoid items-center gap-4 rounded-xl border-2 border-dashed border-[#c9d3df] bg-white p-4">
              <QrImage text={url} />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold tracking-wide text-off uppercase">Achieve Cafe Provisions</div>
                <div className="text-[17px] leading-tight font-bold">{v.label}</div>
                <div className="font-mono text-sm">{v.rego}</div>
                <div className="mt-2 text-[12.5px] leading-snug">Scan to <b>report a problem</b>{v.wash_needed ? <> or <b>log a wash</b></> : ''}.</div>
                <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-[11px] text-primary hover:underline print:hidden">Open the page</a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Rego & insurance dates ─────────────────────────────────────────────────

function ExpiryInput({ van, field, label }) {
  const queryClient = useQueryClient()
  const { toast } = useActions()
  const save = useMutation({
    mutationFn: (value) => patchVehicle(van.id, { [field]: value || null }),
    onSuccess: (v) => {
      for (const key of ['vehicles', 'alerts', 'dashboard']) queryClient.invalidateQueries({ queryKey: [key] })
      toast(v[field] ? `${v.label}: ${label} ${fmtDate(v[field])} saved.` : `${v.label}: ${label} cleared.`)
    },
    onError: () => toast(`Could not save the ${label}.`, true),
  })
  const value = van[field] || ''
  // Typed text is kept locally and only saved when you leave the box (or
  // press Enter). Saving on every keystroke cut people off mid-year, because
  // the browser reads a half-typed year like "2" as 0002.
  const [draft, setDraft] = useState(value) // the box restarts (key) when the saved value changes
  const looksReal = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number(d.slice(0, 4)) >= 2000 && Number(d.slice(0, 4)) <= 2099
  const commit = () => {
    if (draft === value) return
    if (!draft) return save.mutate('')
    if (looksReal(draft)) return save.mutate(draft)
    toast(`${van.label}: that ${label} doesn't look right. Check the year.`, true)
    setDraft(value)
  }
  const days = value ? daysFromToday(value) : null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={draft}
        min="2000-01-01"
        max="2099-12-31"
        disabled={save.isPending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label={`${label} for ${van.label}`}
        className={inputCls + ' w-[150px]'}
      />
      {days === null ? (
        <span className="text-xs text-off">not entered</span>
      ) : days < 0 ? (
        <Pill tone="due">expired {-days} day{days === -1 ? '' : 's'} ago</Pill>
      ) : days < 60 ? (
        <Pill tone="warn">in {days} day{days === 1 ? '' : 's'}</Pill>
      ) : (
        <Pill tone="ok">OK</Pill>
      )}
      {value && <button onClick={() => save.mutate('')} title="Clear" className="text-xs text-off hover:text-due">✕</button>}
    </div>
  )
}

export function RegoDates() {
  const vans = useVans()
  const list = sortVans(vans.data ?? [])
  const missing = list.filter((v) => !v.rego_expiry || !v.insurance_expiry).length
  return (
    <Card
      title="Rego & insurance dates"
      description="Type or pick each date once from the papers or renewal notice. It saves when you click out of the box (or press Enter). Home then warns you 60 days before anything expires."
      padded={false}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line bg-[#f8fafc] text-left text-xs text-off">
              <th className="px-4 py-2 font-medium">Van</th>
              <th className="px-2 py-2 font-medium">Rego expires</th>
              <th className="px-2 py-2 font-medium">Insurance expires</th>
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id} className="border-b border-[#eef1f5] last:border-0">
                <td className="px-4 py-2.5">
                  <a href={href('vans', v.id)} className="font-semibold text-ink no-underline hover:text-primary">{v.label}</a>
                  <div className="text-xs text-off">{v.subtitle}</div>
                </td>
                <td className="px-2 py-2.5"><ExpiryInput key={`r${v.rego_expiry}`} van={v} field="rego_expiry" label="rego expiry" /></td>
                <td className="px-2 py-2.5"><ExpiryInput key={`i${v.insurance_expiry}`} van={v} field="insurance_expiry" label="insurance expiry" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-2.5 text-xs text-off">
        {missing ? `${missing} van${missing === 1 ? '' : 's'} still missing a date.` : 'All dates entered. Home will warn you 60 days before each one.'}
      </p>
    </Card>
  )
}
