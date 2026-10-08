import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { deleteTollStatement, fetchTolls, setTollDone, uploadTollStatement } from '../api/extra'
import { fetchLinks } from '../api/links'
import { useActions } from '../lib/actions'
import { useSort } from '../lib/useSort'
import { fmtDate } from '../lib/formatDate'
import { href } from '../lib/router'
import { ConfirmDialog } from './ConfirmDialog'

const money = (n) => `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const errorText = (err) => err?.response?.data?.detail || 'Something went wrong reading that file.'
const period = (s) => `${fmtDate(s.periodStart)} to ${fmtDate(s.periodEnd)}`

// Upload the monthly E-Toll statement PDF, check the totals per van, import.
function TollImport({ onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const queryClient = useQueryClient()
  const links = useQuery({ queryKey: ['links'], queryFn: fetchLinks, staleTime: Infinity })
  const previewMutation = useMutation({ mutationFn: (f) => uploadTollStatement(f), onSuccess: setPreview })
  const importMutation = useMutation({
    mutationFn: () => uploadTollStatement(file, true),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tolls'] })
      onImported(data)
    },
  })
  const pickFile = (f) => {
    setFile(f)
    setPreview(null)
    if (f) previewMutation.mutate(f)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,.45)] px-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-[720px] flex-col rounded-xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-line px-6 py-4">
          <h3 className="text-base font-semibold text-ink">Import toll statement</h3>
          <p className="mt-1 text-[13px] text-off">
            Upload the monthly <b>E-Toll Statement / Tax Invoice</b> PDF, exactly as it's emailed.{' '}
            {links.data?.drive ? 'The PDF is kept in Google Drive (Tolls folder).' : links.data?.drive === false ? "Google Drive isn't connected on this server yet, so the PDF is kept on the server for now." : ''}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className="block text-[13px] file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-[#f5f5f5]"
          />
          {previewMutation.isPending && <p className="mt-3 text-[13px] text-off">Reading the statement…</p>}
          {previewMutation.isError && <p className="mt-3 text-[13px] text-due">{errorText(previewMutation.error)}</p>}
          {preview && (
            <>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-[#fafafa] px-4 py-3 text-[13px]">
                <span>Statement <b>{period(preview)}</b></span>
                <span><b>{preview.trips}</b> trips</span>
                <span>Vans total <b>{money(preview.total)}</b></span>
              </div>
              {preview.alreadyImported && (
                <p className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-[13px] text-warn">This statement was imported before. Importing again replaces it (nothing is counted twice).</p>
              )}
              {preview.checks.map((c) => (
                <p key={c} className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-[13px] text-warn">Check: {c}</p>
              ))}
              <table className="mt-3 w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-off">
                    <th className="py-2 pr-3 font-medium">Van</th>
                    <th className="py-2 pr-3 text-right font-medium">Trips</th>
                    <th className="py-2 pr-3 text-right font-medium">Tolls</th>
                    <th className="py-2 pr-3 text-right font-medium">Fees</th>
                    <th className="py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.vehicles.map((v) => (
                    <tr key={v.vehicle} className="border-b border-[#f0f0f0]">
                      <td className="py-1.5 pr-3 font-medium">{v.label}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{v.trips}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{money(v.tolls)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{Number(v.fees) ? money(v.fees) : '—'}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums">{money(Number(v.tolls) + Number(v.fees))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.leftOut.length > 0 && (
                <p className="mt-3 text-xs text-off">
                  Left out, not fleet vans: {preview.leftOut.map((v) => `${v.label} (${money(Number(v.tolls) + Number(v.fees))})`).join(', ')}.
                  Statement total {money(preview.statementTotal)}.
                </p>
              )}
            </>
          )}
          {importMutation.isError && <p className="mt-3 text-[13px] text-due">{errorText(importMutation.error)}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3">
          <button onClick={onClose} className="rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#f5f5f5]">Cancel</button>
          {preview && (
            <button
              disabled={importMutation.isPending}
              onClick={() => importMutation.mutate()}
              className="rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-dark disabled:opacity-40"
            >
              {importMutation.isPending ? 'Importing…' : `Import ${preview.trips} trips`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, sub, tone }) {
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3">
      <div className="text-xs text-off">{label}</div>
      <div className={`mt-0.5 text-[22px] font-semibold ${tone === 'due' ? 'text-due' : 'text-ink'}`}>{value}</div>
      {sub && <div className="text-xs text-off">{sub}</div>}
    </div>
  )
}

const box = 'overflow-x-auto rounded-lg border border-line bg-white'
const th = 'px-3 py-2.5 font-medium'
const td = 'px-3 py-2.5'
const num = 'px-3 py-2.5 text-right tabular-nums whitespace-nowrap'
const head = 'border-b border-line text-left text-xs text-off'
const nothing = 'px-4 py-8 text-center text-[13px] text-off'
const CHIP = 'rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap'
const RED = `${CHIP} bg-due-bg text-due`
const GREY = `${CHIP} bg-[#eef1f5] text-[#4b5563]`

// "23:45" -> "11:45 pm"
const clock = (t) => {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}
const shortDate = (iso) => fmtDate(iso).slice(0, 5)

// A trip's row is coloured when it's flagged: red for a weekend or a possible
// double charge, yellow for after 12 pm or a tag that wasn't read.
function TripList({ rows }) {
  const tone = (r) => (r.weekend || r.double ? 'bg-due-bg' : r.late || (r.byPlate && !r.isFee) ? 'bg-warn-bg' : '')
  const tag = 'ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-white'
  return (
    <div className="text-[12.5px]">
      {rows.map((r, i) => (
        <div key={i} className={`mt-0.5 flex gap-3 rounded px-2.5 py-1 ${tone(r)} ${r.isFee ? 'text-due' : ''}`}>
          <span className="w-[64px] shrink-0 text-off">{clock(r.time)}</span>
          <span className="min-w-0 flex-1">
            {r.road} · {r.detail}
            {r.weekend && <span className={`${tag} bg-due`}>weekend</span>}
            {r.double && <span className={`${tag} bg-due`}>possible double charge</span>}
            {r.late && <span className={`${tag} bg-warn`}>after 12 pm</span>}
            {r.byPlate && !r.isFee && <span className={`${tag} bg-warn`}>tag not read</span>}
          </span>
          <span className="tabular-nums">{money(r.amount)}</span>
        </div>
      ))}
    </div>
  )
}

// The same van charged at the same toll point twice within a few minutes.
function Doubles({ rows, onShow }) {
  if (!rows.length) return <div className={`${box} ${nothing}`}>No double charges found on this statement.</div>
  return (
    <div className={box}>
      <p className="px-4 pt-3 pb-1 text-[13px] text-off">
        The same van charged at the same toll point again within 15 minutes. Check these against the PDF, then dispute them with E-Toll (13 18 65) within 90 days of the statement. Click one to see the van's trips.
      </p>
      <table className="w-full min-w-[620px] border-collapse text-[13px]">
        <thead>
          <tr className={head}>
            <th className={th}>Van</th><th className={th}>Date</th><th className={th}>Toll point</th><th className={th}>Charged at</th>
            <th className={`${th} text-right`}>Each</th><th className={`${th} text-right`}>Could claim back</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => (
            <tr key={i} onClick={() => onShow(d.vehicle, 'double')} className="cursor-pointer border-b border-[#f0f0f0] last:border-0 hover:bg-[#f0f5fb]">
              <td className={`${td} font-medium text-primary`}>{d.label}</td>
              <td className={`${td} whitespace-nowrap`}>{fmtDate(d.date)}</td>
              <td className={td}>{d.road}<div className="text-xs text-off">{d.detail}</div></td>
              <td className={td}>{d.times.map(clock).join(' and ')}</td>
              <td className={num}>{money(d.amount)}</td>
              <td className={`${num} font-semibold text-due`}>{money(d.extra)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Trips at or after 12 pm, or on a Saturday or Sunday, van by van.
function OddTimes({ vans }) {
  const [open, setOpen] = useState(null)
  const rows = vans
    .map((v) => {
      const flagged = v.rows.filter((r) => !r.isFee && (r.weekend || r.late))
      return { ...v, flagged, flaggedCost: flagged.reduce((s, r) => s + Number(r.amount), 0) }
    })
    .filter((v) => v.flagged.length)
    .sort((a, b) => b.weekend - a.weekend || b.flagged.length - a.flagged.length)
  if (!rows.length) return <div className={`${box} ${nothing}`}>No trips after 12 pm or on a weekend.</div>
  return (
    <div className={box}>
      <p className="px-4 pt-3 pb-1 text-[13px] text-off">Trips at or after <b>12 pm</b>, or on a <b>Saturday or Sunday</b>. Click a van to see them.</p>
      <table className="w-full min-w-[520px] border-collapse text-[13px]">
        <thead>
          <tr className={head}>
            <th className={th}>Van</th><th className={`${th} text-right`}>Weekend trips</th><th className={`${th} text-right`}>After 12 pm</th>
            <th className={`${th} text-right`}>Flagged trips</th><th className={`${th} text-right`}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => [
            <tr key={v.vehicle} onClick={() => setOpen(open === v.vehicle ? null : v.vehicle)} className="cursor-pointer border-b border-[#f0f0f0] hover:bg-[#f0f5fb]">
              <td className={`${td} font-medium text-primary`}>{v.label}</td>
              <td className={`${num} ${v.weekend ? 'font-semibold text-due' : 'text-off'}`}>{v.weekend || '—'}</td>
              <td className={`${num} ${v.late ? '' : 'text-off'}`}>{v.late || '—'}</td>
              <td className={num}>{v.flagged.length}</td>
              <td className={`${num} font-medium`}>{money(v.flaggedCost)}</td>
            </tr>,
            open === v.vehicle && (
              <tr key={`${v.vehicle}-rows`} className="border-b border-[#f0f0f0] bg-[#fafafa]">
                <td colSpan={5} className="px-4 py-2">
                  {v.flagged.map((r, i) => (
                    <div key={i} className="text-[12.5px]">
                      <div className={`mt-0.5 flex gap-3 rounded px-2.5 py-1 ${r.weekend ? 'bg-due-bg' : 'bg-warn-bg'}`}>
                        <span className="w-[130px] shrink-0 text-off">{r.day} {fmtDate(r.date)}</span>
                        <span className="w-[64px] shrink-0 text-off">{clock(r.time)}</span>
                        <span className="min-w-0 flex-1">{r.road} · {r.detail}</span>
                        <span className="tabular-nums">{money(r.amount)}</span>
                      </div>
                    </div>
                  ))}
                </td>
              </tr>
            ),
          ])}
        </tbody>
      </table>
    </div>
  )
}

// Each van's usual run: what a usual day costs, the toll points it uses most, its dearest days.
function Runs({ runs }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {runs.map((r) => (
        <div key={r.vehicle} className="rounded-lg border border-line bg-white p-4 text-[13px]">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[14px] font-semibold text-ink">{r.label}</span>
            <span className="text-off">{r.days} days on toll roads · usual day <b className="text-ink">{money(r.usualCost)}</b> · {money(r.total)} in all</span>
          </div>
          <RunCard r={r} />
          <div className="mt-3 mb-1 font-medium">Dearest days</div>
          <div className="text-xs text-off">{r.dearest.map((d) => `${fmtDate(d.date)} ${money(d.total)} (${d.trips} trips)`).join(' · ')}</div>
        </div>
      ))}
    </div>
  )
}

// What needs someone to do something, most important first.
function Todo({ items, onShow, onTick }) {
  const [showDone, setShowDone] = useState(false)
  const open = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)
  const dot = { due: 'bg-due-bg text-due', warn: 'bg-warn-bg text-warn' }
  return (
    <div className="mb-4 rounded-lg border border-line bg-white">
      <div className="px-4 pt-3 pb-1">
        <span className="text-[15px] font-semibold text-ink">To do</span>
        {open.length > 0 && <span className="ml-1.5 rounded-full bg-due-bg px-2 py-0.5 text-xs font-medium text-due">{open.length}</span>}
        <span className="ml-2 text-xs text-off">only things that need you to do something, most important first</span>
      </div>
      {open.length === 0 ? (
        <div className="px-4 py-5 text-center text-[13px] text-ok">Nothing to do on this statement. ✓</div>
      ) : (
        open.map((it, i) => (
          <div key={it.key} className="flex flex-wrap items-center gap-3 border-t border-[#f0f2f5] px-4 py-3">
            <span className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[13px] font-bold ${dot[it.tone]}`}>{i + 1}</span>
            <div className="min-w-[240px] flex-1">
              <div className="text-[14px] font-semibold text-ink">{it.title}</div>
              <div className="text-xs text-off">{it.text}</div>
            </div>
            <button onClick={() => onShow(it.vehicle, it.filter)} className="rounded-md border border-line bg-white px-3 py-1 text-[13px] font-medium hover:bg-[#f5f5f5]">Show trips</button>
            <button onClick={() => onTick(it.key, true)} className="rounded-md border border-line bg-white px-3 py-1 text-[13px] font-medium hover:bg-ok-bg hover:text-ok">✓ Done</button>
          </div>
        ))
      )}
      {done.length > 0 && (
        <div className="border-t border-[#f0f2f5] px-4 py-2 text-xs">
          <button onClick={() => setShowDone(!showDone)} className="font-medium text-primary hover:underline">{showDone ? '▾' : '▸'} Done ({done.length})</button>
          {showDone && done.map((it) => (
            <div key={it.key} className="mt-1 flex items-center gap-3 text-off">
              <span className="flex-1 line-through">{it.title}</span>
              <button onClick={() => onTick(it.key, false)} className="font-medium text-primary hover:underline">Undo</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// One van, as a row: its figures and what's wrong, in words.
// Click a heading to sort by it; click again to flip it.
const VAN_SORT_TYPES = { vanNumber: 'number', total: 'number', trips: 'number', usual: 'number', flagScore: 'number' }

function SortHead({ label, col, sort, right = false }) {
  return (
    <th className={`${th} cursor-pointer select-none hover:text-ink ${right ? 'text-right' : ''}`} onClick={() => sort.onSort(col)}>
      {label}
      {sort.sortKey === col && <span className="ml-1">{sort.sortDir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )
}

function VanTable({ data, onOpen }) {
  // "What's flagged" sorts by how much is flagged: the red flags count most.
  const rows = useMemo(
    () => data.vans.map((v) => ({
      ...v,
      vanNumber: Number((v.label.match(/\d+/) ?? [9999])[0]),
      flagScore:
        (Number(v.fees) > 0 ? 100 : 0) + (Number(v.doubleExtra) > 0 ? 100 : 0) + (v.weekend > 0 ? 100 : 0) + v.heavyDays * 10 + (v.shift ? 1 : 0) + (v.late > 0 ? 1 : 0),
    })),
    [data.vans],
  )
  const sort = useSort(rows, VAN_SORT_TYPES)
  return (
    <div className={box}>
      <div className="px-4 pt-3 pb-1 text-[14px] font-semibold text-ink">Vans <span className="text-xs font-normal text-off">· click a van to see its trips</span></div>
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className={head}>
            <SortHead label="Van" col="vanNumber" sort={sort} />
            <SortHead label="Tolls" col="total" sort={sort} right />
            <SortHead label="Trips" col="trips" sort={sort} right />
            <SortHead label="Usual day" col="usual" sort={sort} right />
            <SortHead label="What's flagged" col="flagScore" sort={sort} />
          </tr>
        </thead>
        <tbody>
          {sort.sorted.map((v) => (
            <tr key={v.vehicle} onClick={() => onOpen(v.vehicle, 'all')} className="cursor-pointer border-b border-[#f0f0f0] hover:bg-[#f0f5fb]">
              <td className={td}>
                <span className="font-medium text-primary">{v.label}</span>
                <div className="text-xs text-off">{v.sub}</div>
              </td>
              <td className={`${num} font-semibold`}>{money(v.total)}</td>
              <td className={num}>{v.trips}</td>
              <td className={num}>{money(v.usual)}</td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {Number(v.fees) > 0 && <span className={RED}>tag not working · {money(v.fees)} fees</span>}
                  {Number(v.doubleExtra) > 0 && <span className={RED}>charged twice? {money(v.doubleExtra)}</span>}
                  {v.weekend > 0 && <span className={RED}>{v.weekend} weekend</span>}
                  {v.heavyDays > 0 && <span className={RED}>{v.heavyDays} heavy day{v.heavyDays === 1 ? '' : 's'}</span>}
                  {v.shift && <span className={GREY}>new run from {shortDate(v.shift.date)}</span>}
                  {v.late > 0 && <span className={GREY}>{v.late} after 12 pm</span>}
                </div>
              </td>
            </tr>
          ))}
          <tr className="bg-[#f5f8fc] font-semibold">
            <td className={td}>All vans</td>
            <td className={num}>{money(data.total)}</td>
            <td className={num}>{data.trips}</td>
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>
      <p className="px-4 py-2 text-xs text-off">
        {data.quiet.length > 0 && <>No toll trips this statement: {data.quiet.join(', ')}. </>}
        {Number(data.otherTotal) > 0 && <>The statement's total is {money(data.statementTotal)}; the other {money(data.otherTotal)} is for vehicles that aren't fleet vans, left out here.</>}
      </p>
    </div>
  )
}

// A van's usual run and the toll points it uses most.
function RunCard({ r }) {
  return (
    <div className="text-[13px]">
      {r.common ? (
        <div className="rounded-md bg-[#f5f8fc] px-3 py-2">
          <div className="mb-1 font-medium">Regular run: the same tolls on {r.common.days} days, {money(r.common.cost)} a day</div>
          <ol className="text-xs text-off">
            {r.common.stops.map((s, i) => <li key={i}>{clock(s.time)} · {s.road}: {s.detail} · {money(s.amount)}</li>)}
          </ol>
        </div>
      ) : (
        <div className="rounded-md bg-[#fafafa] px-3 py-2 text-xs text-off">No two days are quite the same for this van, so there's no single regular run.</div>
      )}
      <div className="mt-3 mb-1 font-medium">Toll points it uses most</div>
      <ul className="text-xs text-off">
        {r.points.map((p, i) => <li key={i}>{p.road}: {p.detail} · {p.days} day{p.days === 1 ? '' : 's'} · {money(p.total)}</li>)}
      </ul>
      {r.oneOffs.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-medium text-primary">{r.oneOffs.length} one-off trip{r.oneOffs.length === 1 ? '' : 's'} (toll points used on one day only)</summary>
          <ul className="mt-1 text-xs text-off">
            {r.oneOffs.map((o, i) => <li key={i}>{fmtDate(o.date)} {clock(o.time)} · {o.road}: {o.detail} · {money(o.amount)}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}

const FILTERS = [
  { key: 'all', label: 'All trips' },
  { key: 'weekend', label: 'Weekend' },
  { key: 'late', label: 'After 12 pm' },
  { key: 'heavy', label: 'Heavy days' },
  { key: 'double', label: 'Double charges' },
  { key: 'tag', label: 'Tag not read' },
]

// One van: its trips grouped by day, with filters for what's flagged.
function VanDetail({ van, cells, run, filter, setFilter, onBack }) {
  const heavyDates = new Set(Object.entries(cells).filter(([, c]) => c.heavy).map(([d]) => d))
  const counts = { all: van.rows.length, weekend: van.weekend, late: van.late, heavy: van.heavyDays, double: van.doubles, tag: van.plateTrips }
  const match = {
    all: () => true, weekend: (r) => r.weekend, late: (r) => r.late, heavy: (r) => heavyDates.has(r.date),
    double: (r) => r.double, tag: (r) => r.byPlate,
  }[filter] ?? (() => true)
  const groups = []
  for (const r of van.rows.filter(match)) {
    const last = groups[groups.length - 1]
    if (last && last.date === r.date) last.rows.push(r)
    else groups.push({ date: r.date, day: r.day, rows: [r] })
  }
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <button onClick={onBack} className="mb-2 text-[13px] font-medium text-primary hover:underline">‹ All vans</button>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[17px] font-semibold text-ink">{van.label}</span>
        <span className="text-xs text-off">{van.sub}</span>
        <a href={href('vans', van.vehicle)} className="text-xs font-medium text-primary no-underline hover:underline">Van page →</a>
        <span className="ml-auto text-xs text-off">
          {money(van.total)} · {van.trips} trips · {Object.keys(cells).length} days on toll roads · usual day {money(van.usual)}
        </span>
      </div>
      {van.shift && (
        <p className="mt-2 rounded-md bg-[#eef1f5] px-3 py-1.5 text-xs text-[#4b5563]">
          This van's usual day went up from {fmtDate(van.shift.date)}: about {money(van.shift.before)} before, about {money(van.shift.after)} since. Its days are judged against each part, not the whole month.
        </p>
      )}
      <div className="mt-3 mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-off">Show:</span>
        {FILTERS.filter((f) => f.key === 'all' || filter === f.key || counts[f.key] > 0).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={'rounded-md px-2.5 py-1 text-[13px] font-medium ' + (filter === f.key ? 'bg-primary text-white' : 'bg-white text-off ring-1 ring-line hover:text-ink')}
          >
            {f.label}{f.key !== 'all' && <span className="ml-1 opacity-80">{counts[f.key]}</span>}
          </button>
        ))}
      </div>

      {groups.length === 0 && <div className={nothing}>No trips match.</div>}
      {groups.map((g) => {
        const cell = cells[g.date]
        const weekend = g.day === 'Sat' || g.day === 'Sun'
        return (
          <div key={g.date} className="mb-1">
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-[#f5f8fc] px-2.5 py-1.5 text-[13px] font-semibold">
              <span>{g.day} {fmtDate(g.date)}</span>
              {weekend && <span className={RED}>weekend</span>}
              {cell?.heavy && <span className={RED}>heavy day · {cell.times}× its usual</span>}
              <span className="ml-auto">{money(g.rows.reduce((s, r) => s + Number(r.amount), 0))} · {g.rows.filter((r) => !r.isFee).length} trip{g.rows.filter((r) => !r.isFee).length === 1 ? '' : 's'}</span>
            </div>
            <TripList rows={g.rows} />
          </div>
        )
      })}

      {run && (
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-[13px] font-medium text-primary">Its usual run and most-used toll points</summary>
          <div className="mt-2"><RunCard r={run} /></div>
        </details>
      )}
    </div>
  )
}

// Heavy days, then every van's tolls for every day. Click a square
// for that van's trips that day, or a date for every van that day.
function Daily({ data }) {
  const { daily: days, earlier, grid, heavy, vans } = data
  const [sel, setSel] = useState(null) // { date, vehicle? }
  const [allHeavy, setAllHeavy] = useState(false)
  const cellMax = Math.max(...grid.flatMap((v) => Object.values(v.cells).map((c) => Number(c.total))), 1)
  const pick = (date, vehicle) => setSel(sel && sel.date === date && sel.vehicle === vehicle ? null : { date, vehicle })
  const tripsOn = (v, date) => (vans.find((x) => x.vehicle === v)?.rows ?? []).filter((r) => r.date === date)
  const dayName = (date) => days.find((d) => d.date === date)
  const weekday = (date) => new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short' })

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-white p-4">
        <div className="mb-1 text-[14px] font-semibold text-ink">Heavy days {heavy.length > 0 && <span className="ml-1 rounded-full bg-due-bg px-2 py-0.5 text-xs text-due">{heavy.length}</span>}</div>
        <p className="mb-2 text-xs text-off">Days where a van's tolls were at least 1.5 times its usual day, and $10 or more above it. Biggest first; click one to see the trips.</p>
        {heavy.length === 0 ? (
          <div className="py-3 text-center text-[13px] text-off">No van had a day well above its usual.</div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className={head}>
                <th className={th}>Van</th><th className={th}>Day</th><th className={`${th} text-right`}>Trips</th>
                <th className={`${th} text-right`}>Tolls that day</th><th className={`${th} text-right`}>Its usual day</th><th className={`${th} text-right`}>How much more</th>
              </tr>
            </thead>
            <tbody>
              {(allHeavy ? heavy : heavy.slice(0, 8)).map((h) => (
                <tr key={`${h.vehicle}-${h.date}`} onClick={() => pick(h.date, h.vehicle)} className="cursor-pointer border-b border-[#f0f0f0] last:border-0 hover:bg-[#f0f5fb]">
                  <td className={`${td} font-medium text-primary`}>{h.label}</td>
                  <td className={`${td} whitespace-nowrap`}>{h.day} {fmtDate(h.date)}</td>
                  <td className={num}>{h.trips}</td>
                  <td className={`${num} font-semibold text-due`}>{money(h.total)}</td>
                  <td className={`${num} text-off`}>{money(h.usual)}</td>
                  <td className={num}>{h.times}× · +{money(Number(h.total) - Number(h.usual))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {heavy.length > 8 && (
          <button onClick={() => setAllHeavy(!allHeavy)} className="mt-2 text-[13px] font-medium text-primary hover:underline">
            {allHeavy ? 'Show the top 8 only' : `Show all ${heavy.length}`}
          </button>
        )}
      </div>

      <div className="rounded-lg border border-line bg-white p-4">
        <div className="mb-1 text-[14px] font-semibold text-ink">Each van, each day</div>
        <p className="mb-2 text-xs text-off">Dollars of tolls per day. Darker blue = more; <span className="rounded bg-due-bg px-1 font-medium text-due">red</span> = a heavy day for that van. Click a square for the trips, or a date for every van that day.</p>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-0.5 text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white pr-2 text-left font-medium text-off">Van</th>
                <th className="px-1 text-right font-medium whitespace-nowrap text-off">Usual day</th>
                {days.map((d) => (
                  <th key={d.date} onClick={() => pick(d.date)} title={fmtDate(d.date)} className={`min-w-[30px] cursor-pointer rounded px-0.5 font-medium hover:bg-[#e8f1fb] ${d.weekend ? 'bg-[#f1f3f6] text-off' : 'text-off'} ${sel?.date === d.date ? 'outline outline-2 outline-primary' : ''}`}>
                    <div>{weekday(d.date)[0]}</div>{d.date.slice(8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((v) => (
                <tr key={v.vehicle}>
                  <td className="sticky left-0 bg-white pr-2 text-[12px] font-medium whitespace-nowrap">{v.label}</td>
                  <td className="px-1 text-right tabular-nums text-off">{money(v.usual)}</td>
                  {days.map((d) => {
                    const c = v.cells[d.date]
                    const chosen = sel?.date === d.date && sel?.vehicle === v.vehicle
                    if (!c) return <td key={d.date} className={`rounded ${d.weekend ? 'bg-[#f1f3f6]' : 'bg-[#fafafa]'}`} />
                    return (
                      <td
                        key={d.date}
                        onClick={() => pick(d.date, v.vehicle)}
                        title={`${v.label}, ${fmtDate(d.date)}: ${money(c.total)}, ${c.trips} trips`}
                        className={`cursor-pointer rounded px-0.5 py-1 text-center tabular-nums ${c.heavy ? 'bg-due-bg font-semibold text-due' : ''} ${chosen ? 'outline outline-2 outline-primary' : ''}`}
                        style={c.heavy ? undefined : { backgroundColor: `rgba(24,95,165,${0.08 + 0.5 * (Number(c.total) / cellMax)})` }}
                      >
                        {Math.round(Number(c.total))}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sel && sel.vehicle && (
          <div className="mt-4 rounded-md bg-[#fafafa] p-3">
            <div className="mb-1 text-[13px] font-semibold">{grid.find((v) => v.vehicle === sel.vehicle)?.label} on {weekday(sel.date)} {fmtDate(sel.date)}</div>
            <TripList rows={tripsOn(sel.vehicle, sel.date)} />
          </div>
        )}
        {earlier.trips > 0 && (
          <p className="mt-3 text-xs text-off">Not in the grid: {earlier.trips} trips from before this period that were billed late ({money(earlier.total)}).</p>
        )}
        {sel && !sel.vehicle && (
          <div className="mt-4 rounded-md bg-[#fafafa] p-3">
            <div className="mb-1 text-[13px] font-semibold">
              {weekday(sel.date)} {fmtDate(sel.date)}: {money(dayName(sel.date)?.total ?? 0)} · {dayName(sel.date)?.trips ?? 0} trips
            </div>
            <table className="w-full text-xs">
              <tbody>
                {grid.filter((v) => v.cells[sel.date]).sort((a, b) => Number(b.cells[sel.date].total) - Number(a.cells[sel.date].total)).map((v) => (
                  <tr key={v.vehicle} onClick={() => pick(sel.date, v.vehicle)} className="cursor-pointer hover:bg-[#f0f5fb]">
                    <td className="py-1 pr-3 font-medium text-primary">{v.label}</td>
                    <td className="py-1 pr-3">{v.cells[sel.date].trips} trips</td>
                    <td className="py-1 pr-3 text-off">usual day {money(v.usual)}</td>
                    <td className="py-1 pr-3">{v.cells[sel.date].heavy && <span className="rounded bg-due px-1.5 py-0.5 text-[11px] font-medium text-white">heavy day</span>}</td>
                    <td className="py-1 text-right font-medium tabular-nums">{money(v.cells[sel.date].total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {grid.every((v) => !v.cells[sel.date]) && <div className="text-xs text-off">No tolls that day.</div>}
          </div>
        )}
      </div>
    </div>
  )
}

// Each van against the statement before.
function Compare({ compare }) {
  if (!compare) return <div className={`${box} ${nothing}`}>This is the first statement. Import next month's and each van's change will show here.</div>
  const change = (r) => (
    <span className={Number(r.change) > 0 ? 'text-due' : Number(r.change) < 0 ? 'text-ok' : 'text-off'}>
      {Number(r.change) > 0 ? '+' : Number(r.change) < 0 ? '−' : ''}{money(Math.abs(Number(r.change)))}{r.percent != null && ` (${Math.abs(r.percent)}%)`}
    </span>
  )
  return (
    <div className={box}>
      <p className="px-4 pt-3 pb-1 text-[13px] text-off">Compared with the statement before ({fmtDate(compare.periodStart)} to {fmtDate(compare.periodEnd)}).</p>
      <table className="w-full min-w-[480px] border-collapse text-[13px]">
        <thead>
          <tr className={head}>
            <th className={th}>Van</th><th className={`${th} text-right`}>Before</th><th className={`${th} text-right`}>This statement</th><th className={`${th} text-right`}>Change</th>
          </tr>
        </thead>
        <tbody>
          {compare.rows.map((r) => (
            <tr key={r.vehicle} className={`border-b border-[#f0f0f0] ${r.jumped ? 'bg-warn-bg' : ''}`}>
              <td className={`${td} font-medium`}>{r.label}{r.jumped && <span className="ml-2 text-xs font-medium text-warn">▲ up a lot</span>}</td>
              <td className={num}>{money(r.before)}</td>
              <td className={num}>{money(r.now)}</td>
              <td className={`${num} font-medium`}>{change(r)}</td>
            </tr>
          ))}
          <tr className="bg-[#f5f8fc] font-semibold">
            <td className={td}>All vans</td>
            <td className={num}>{money(compare.before)}</td>
            <td className={num}>{money(compare.now)}</td>
            <td className={num}>{change({ change: Number(compare.now) - Number(compare.before), percent: Number(compare.before) ? Math.round(((compare.now - compare.before) / compare.before) * 100) : null })}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

const VIEWS = [
  { key: 'vans', label: 'Vans' },
  { key: 'doubles', label: 'Double charges' },
  { key: 'odd', label: 'Odd times' },
  { key: 'runs', label: 'Regular runs' },
  { key: 'days', label: 'Days' },
  { key: 'compare', label: 'Compare months' },
]

export function TollsView() {
  const [view, setView] = useState('vans')
  const [chosen, setChosen] = useState('')
  const [importing, setImporting] = useState(false)
  const [open, setOpen] = useState(null) // { id, filter } of the van being looked at
  const [removing, setRemoving] = useState(false)
  const queryClient = useQueryClient()
  const { toast } = useActions()
  const tolls = useQuery({ queryKey: ['tolls', chosen], queryFn: () => fetchTolls(chosen), placeholderData: (prev) => prev })
  const remove = useMutation({
    mutationFn: (id) => deleteTollStatement(id),
    onSuccess: () => {
      setRemoving(false)
      setChosen('')
      queryClient.invalidateQueries({ queryKey: ['tolls'] })
      toast('Toll statement removed.')
    },
  })
  const tick = useMutation({
    mutationFn: ({ key, done }) => setTollDone(tolls.data.current.statement.id, key, done),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tolls'] }),
  })

  const statements = tolls.data?.statements ?? []
  const data = tolls.data?.current
  const importButton = (
    <button onClick={() => setImporting(true)} className="rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-primary-dark">
      Import statement
    </button>
  )
  const importPopup = importing && (
    <TollImport
      onClose={() => setImporting(false)}
      onImported={(r) => {
        setImporting(false)
        setChosen(String(r.id))
        toast(`Toll statement imported: ${r.trips} trips, ${money(r.total)}.`)
      }}
    />
  )

  if (tolls.isLoading) return <div className="py-10 text-center text-[13px] text-off">Loading…</div>
  if (!data) {
    return (
      <div className="rounded-lg border border-dashed border-[#c9d3df] bg-white px-6 py-12 text-center">
        <div className="text-[15px] font-semibold text-ink">No toll statements yet</div>
        <p className="mx-auto mt-1 mb-4 max-w-[420px] text-[13px] text-off">Upload the monthly E-Toll statement PDF to see what each van spent on tolls and what's worth checking.</p>
        {importButton}
        {importPopup}
      </div>
    )
  }

  const getBack = Number(data.claim) + Number(data.fees)
  const oddCount = data.vans.reduce((n, v) => n + v.rows.filter((r) => !r.isFee && (r.weekend || r.late)).length, 0)
  const change = data.compare ? Number(data.compare.now) - Number(data.compare.before) : null
  const openVan = open && data.vans.find((v) => v.vehicle === open.id)
  const showTrips = (id, filter) => {
    setView('vans')
    setOpen({ id, filter: filter ?? 'all' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-off">Statement</span>
        <select value={data.statement.id} onChange={(e) => { setChosen(e.target.value); setOpen(null) }} className="h-9 rounded-md border border-line bg-white px-2.5 text-[13px]">
          {statements.map((s) => <option key={s.id} value={s.id}>{period(s)} · {money(s.total)}</option>)}
        </select>
        {data.statement.fileUrl && (
          <a href={data.statement.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-primary hover:underline">Open the PDF ↗</a>
        )}
        <button onClick={() => setRemoving(true)} className="text-[13px] text-off hover:text-due">Remove</button>
        <div className="ml-auto">{importButton}</div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Tolls this statement" value={money(data.total)} sub={`${data.trips} trips · about ${money(data.perDay)} a day`} />
        {change === null ? (
          <Tile label="Compared with last statement" value="first one" sub="shows ▲ or ▼ from next month" />
        ) : (
          <Tile
            label="Compared with last statement"
            value={`${change > 0 ? '▲' : change < 0 ? '▼' : ''} ${money(Math.abs(change))}`}
            sub={`${change > 0 ? 'more' : 'less'} than ${money(data.compare.before)}${Number(data.compare.before) ? ` (${Math.round((Math.abs(change) / Number(data.compare.before)) * 100)}%)` : ''}`}
            tone={change > 0 ? 'due' : undefined}
          />
        )}
        <Tile
          label="Money you can get back or stop losing"
          value={money(getBack)}
          sub={`${money(data.claim)} to claim · ${money(data.fees)} in tag fees`}
          tone={getBack > 0 ? 'due' : undefined}
        />
      </div>
      {data.checks.map((c) => <p key={c} className="mb-3 rounded-md bg-warn-bg px-3 py-2 text-[13px] text-warn">Check: {c}</p>)}

      <Todo items={data.todo} onShow={showTrips} onTick={(key, done) => tick.mutate({ key, done })} />

      <div className="mb-3 flex flex-wrap gap-1">
        {VIEWS.map((v) => {
          const count = v.key === 'doubles' ? data.doubles.length : v.key === 'odd' ? oddCount : 0
          return (
            <button
              key={v.key}
              onClick={() => { setView(v.key); setOpen(null) }}
              className={'rounded-md px-3 py-1.5 text-[13px] font-medium ' + (view === v.key ? 'bg-primary text-white' : 'bg-white text-off ring-1 ring-line hover:text-ink')}
            >
              {v.label}{count > 0 && <span className={'ml-1.5 rounded-full px-1.5 text-[11px] ' + (view === v.key ? 'bg-white/25' : 'bg-due-bg text-due')}>{count}</span>}
            </button>
          )
        })}
      </div>

      {view === 'doubles' && <Doubles rows={data.doubles} onShow={showTrips} />}
      {view === 'odd' && <OddTimes vans={data.vans} />}
      {view === 'runs' && <Runs runs={data.runs} />}
      {view === 'days' && <Daily data={data} />}
      {view === 'compare' && <Compare compare={data.compare} />}
      {view === 'vans' && (openVan ? (
        <VanDetail
          van={openVan}
          cells={data.grid.find((g) => g.vehicle === openVan.vehicle)?.cells ?? {}}
          run={data.runs.find((r) => r.vehicle === openVan.vehicle)}
          filter={open.filter}
          setFilter={(f) => setOpen({ id: open.id, filter: f })}
          onBack={() => setOpen(null)}
        />
      ) : (
        <div className="space-y-4">
          <VanTable data={data} onOpen={showTrips} />
          <div className={box}>
            <div className="px-4 pt-3 pb-1 text-[14px] font-semibold text-ink">By toll road</div>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className={head}>
                  <th className={th}>Toll road</th>
                  <th className={`${th} text-right`}>Trips</th>
                  <th className={`${th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.roads.map((r) => (
                  <tr key={r.road} className="border-b border-[#f0f0f0] last:border-0">
                    <td className={td}>{r.road}</td>
                    <td className={num}>{r.trips}</td>
                    <td className={`${num} font-medium`}>{money(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {importPopup}
      {removing && (
        <ConfirmDialog
          title="Remove this toll statement?"
          message={`Remove the statement for ${period(data.statement)} and its trips? You can import the PDF again later.`}
          confirmLabel="Remove"
          confirming={remove.isPending}
          onCancel={() => setRemoving(false)}
          onConfirm={() => remove.mutate(data.statement.id)}
        />
      )}
    </div>
  )
}
