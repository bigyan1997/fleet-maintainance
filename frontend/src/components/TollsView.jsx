import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { deleteTollStatement, fetchTolls, uploadTollStatement } from '../api/extra'
import { useActions } from '../lib/actions'
import { fmtDate } from '../lib/formatDate'
import { href } from '../lib/router'
import { ConfirmDialog } from './ConfirmDialog'

const money = (n) => `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const errorText = (err) => err?.response?.data?.detail || 'Something went wrong reading that file.'
const period = (s) => `${fmtDate(s.periodStart)} to ${fmtDate(s.periodEnd)}`
const TONES = { due: 'bg-due-bg text-due', warn: 'bg-warn-bg text-warn', info: 'bg-[#e8f1fb] text-primary' }

// Upload the monthly E-Toll statement PDF, check the totals per van, import.
function TollImport({ onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const queryClient = useQueryClient()
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
          <p className="mt-1 text-[13px] text-off">Upload the monthly <b>E-Toll Statement / Tax Invoice</b> PDF, exactly as it's emailed.</p>
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

// One van's trips, newest first; fee lines sit under the trip they belong to.
function Trips({ rows }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-off">
          <th className="py-1 pr-3 font-medium">Date</th>
          <th className="py-1 pr-3 font-medium">Time</th>
          <th className="py-1 pr-3 font-medium">Toll road</th>
          <th className="py-1 pr-3 font-medium">Where</th>
          <th className="py-1 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={r.isFee ? 'text-due' : ''}>
            <td className="py-1 pr-3 whitespace-nowrap">{fmtDate(r.date)}</td>
            <td className="py-1 pr-3">{r.time}</td>
            <td className="py-1 pr-3">{r.road}</td>
            <td className="py-1 pr-3">
              {r.detail}
              {r.byPlate && !r.isFee && <span className="ml-1.5 rounded bg-warn-bg px-1.5 py-0.5 text-[11px] font-medium text-warn">tag not read</span>}
            </td>
            <td className="py-1 text-right tabular-nums">{money(r.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function TollsView() {
  const [chosen, setChosen] = useState('')
  const [importing, setImporting] = useState(false)
  const [open, setOpen] = useState(null)
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

  const top = data.vans[0]
  const max = Math.max(...data.vans.map((v) => Number(v.total)), 1)
  const th = 'px-3 py-2.5 font-medium'
  const num = 'px-3 py-2.5 text-right tabular-nums whitespace-nowrap'
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

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Tolls for the vans" value={money(data.total)} sub={`${money(data.perDay)} a day`} />
        <Tile label="Trips" value={data.trips.toLocaleString()} sub={`${money(Number(data.total) / Math.max(data.trips, 1))} a trip on average`} />
        <Tile label="Fees for tags not read" value={money(data.fees)} sub={Number(data.fees) ? 'avoidable: see below' : 'none'} tone={Number(data.fees) ? 'due' : undefined} />
        {top && <Tile label="Biggest van" value={top.label} sub={`${money(top.total)} · ${top.trips} trips`} />}
      </div>

      <div className="mb-4 rounded-lg border border-line bg-white p-4">
        <div className="mb-2 text-[14px] font-semibold text-ink">Worth checking</div>
        <ul className="space-y-1.5">
          {data.insights.map((n, i) => (
            <li key={i} className={`rounded-md px-3 py-2 text-[13px] ${TONES[n.tone] ?? TONES.info}`}>{n.text}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <div className="px-4 pt-3 pb-1 text-[14px] font-semibold text-ink">By van <span className="text-xs font-normal text-off">· click a van to see its trips</span></div>
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-off">
                <th className={th}>Van</th>
                <th className={`${th} text-right`}>Trips</th>
                <th className={`${th} text-right`}>Tolls</th>
                <th className={`${th} text-right`}>Fees</th>
                <th className={`${th} text-right`}>Total</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {data.vans.map((v) => [
                <tr key={v.vehicle} onClick={() => setOpen(open === v.vehicle ? null : v.vehicle)} className="cursor-pointer border-b border-[#f0f0f0] hover:bg-[#f0f5fb]">
                  <td className="px-3 py-2.5">
                    <a href={href('vans', v.vehicle)} onClick={(e) => e.stopPropagation()} className="font-medium text-primary no-underline hover:underline">{v.label}</a>
                    <div className="text-xs text-off">{v.sub}</div>
                  </td>
                  <td className={num}>
                    {v.trips}
                    {v.plateTrips > 0 && <div className="text-xs text-warn">{v.plateTrips} tag not read</div>}
                  </td>
                  <td className={num}>{money(v.tolls)}</td>
                  <td className={`${num} ${Number(v.fees) ? 'font-medium text-due' : 'text-off'}`}>{Number(v.fees) ? money(v.fees) : '—'}</td>
                  <td className={`${num} font-semibold`}>{money(v.total)}</td>
                  <td className="w-[110px] px-3 py-2.5">
                    <div className="h-2 rounded bg-[#eef1f5]"><div className="h-2 rounded bg-primary" style={{ width: `${(Number(v.total) / max) * 100}%` }} /></div>
                  </td>
                </tr>,
                open === v.vehicle && (
                  <tr key={`${v.vehicle}-trips`} className="border-b border-[#f0f0f0] bg-[#fafafa]">
                    <td colSpan={6} className="px-4 py-2"><Trips rows={v.rows} /></td>
                  </tr>
                ),
              ])}
              <tr className="bg-[#f5f8fc] font-semibold">
                <td className="px-3 py-2.5">All vans</td>
                <td className={num}>{data.trips}</td>
                <td className={num}>{money(Number(data.total) - Number(data.fees))}</td>
                <td className={num}>{Number(data.fees) ? money(data.fees) : '—'}</td>
                <td className={num}>{money(data.total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
          {Number(data.otherTotal) > 0 && (
            <p className="px-4 py-2 text-xs text-off">
              The statement's total is {money(data.statementTotal)}: the other {money(data.otherTotal)} is for vehicles that aren't fleet vans, left out here.
            </p>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <div className="px-4 pt-3 pb-1 text-[14px] font-semibold text-ink">By toll road</div>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-off">
                <th className={th}>Toll road</th>
                <th className={`${th} text-right`}>Trips</th>
                <th className={`${th} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.roads.map((r) => (
                <tr key={r.road} className="border-b border-[#f0f0f0] last:border-0">
                  <td className="px-3 py-2.5">{r.road}</td>
                  <td className={num}>{r.trips}</td>
                  <td className={`${num} font-medium`}>{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
