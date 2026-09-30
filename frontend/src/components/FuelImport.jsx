import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchVehicles } from '../api/vehicles'
import { uploadFuelStatement } from '../api/fuelLogs'
import { fmtDate } from '../lib/formatDate'

const money = (n) => `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const errorText = (err) => err?.response?.data?.detail || 'Something went wrong reading that file.'

// Upload the monthly Metro fuel card statement (the MPDATA….TXT file), check
// which van each card belongs to, then add every fill-up to the Fuel log.
export function FuelImport({ onClose }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [assignments, setAssignments] = useState({})
  const [open, setOpen] = useState(null)
  const [result, setResult] = useState(null)
  const queryClient = useQueryClient()
  const vehiclesQuery = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const vehicles = vehiclesQuery.data ?? []

  const previewMutation = useMutation({
    mutationFn: (f) => uploadFuelStatement(f),
    onSuccess: (data) => {
      setPreview(data)
      setAssignments(Object.fromEntries(data.cards.map((c) => [c.card, c.vehicle])))
    },
  })
  const importMutation = useMutation({
    mutationFn: () => uploadFuelStatement(file, assignments),
    onSuccess: (data) => {
      setResult(data)
      queryClient.invalidateQueries({ queryKey: ['fuel-logs'] })
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    },
  })

  const pickFile = (f) => {
    setFile(f)
    setPreview(null)
    if (f) previewMutation.mutate(f)
  }

  const cards = preview?.cards ?? []
  const newRows = (c) => (assignments[c.card] ? [...c.rows, ...c.charges].filter((r) => !r.duplicate) : [])
  const toImport = cards.flatMap(newRows)
  const allRows = cards.flatMap((c) => c.rows)
  const fuelTotal = allRows.reduce((s, r) => s + Number(r.cost), 0)
  const unmatched = cards.filter((c) => !assignments[c.card]).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,.45)] px-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-[900px] flex-col rounded-xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-line px-6 py-4">
          <h3 className="text-base font-semibold text-ink">Import fuel statement</h3>
          <p className="mt-1 text-[13px] text-off">
            Upload the <b>MPDATA….TXT</b> file that comes with the monthly Metro fuel card statement (not the PDF).
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {result ? (
            <div className="rounded-lg bg-ok-bg px-4 py-3 text-[13.5px] text-ok">
              Added <b>{result.created}</b> fill-up{result.created === 1 ? '' : 's'} and <b>{result.charges}</b> fee{result.charges === 1 ? '' : 's'} / charge{result.charges === 1 ? '' : 's'} to the Fuel log
              {result.duplicates > 0 && <> ({result.duplicates} already logged, skipped)</>}. Van odometers were updated too.
            </div>
          ) : (
            <>
              <input
                type="file"
                accept=".txt,.TXT"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                className="block text-[13px] file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-[#f5f5f5]"
              />
              {previewMutation.isPending && <p className="mt-3 text-[13px] text-off">Reading the statement…</p>}
              {previewMutation.isError && <p className="mt-3 text-[13px] text-due">{errorText(previewMutation.error)}</p>}

              {preview && (
                <>
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-[#fafafa] px-4 py-3 text-[13px]">
                    <span>Statement to <b>{fmtDate(preview.statementDate)}</b></span>
                    <span><b>{allRows.length}</b> fill-ups · <b>{money(fuelTotal)}</b></span>
                    <span>+ {preview.charges.count} card fees / other charges · <b>{money(preview.charges.total)}</b></span>
                    <span>Total <b>{money(fuelTotal + Number(preview.charges.total))}</b> <span className="text-off">(should match the statement)</span></span>
                  </div>
                  {unmatched > 0 && (
                    <p className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-[13px] text-warn">
                      {unmatched} card{unmatched === 1 ? '' : 's'} couldn't be matched to a van — pick the van below, or it won't be imported.
                    </p>
                  )}

                  <table className="mt-3 w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-line text-left text-xs text-off">
                        <th className="py-2 pr-3 font-medium">Card on statement</th>
                        <th className="py-2 pr-3 font-medium">Van</th>
                        <th className="py-2 pr-3 font-medium">Fill-ups</th>
                        <th className="py-2 pr-3 font-medium">Total (fuel + fees)</th>
                        <th className="py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {cards.map((c) => {
                        const dupes = c.rows.filter((r) => r.duplicate).length
                        const badOdo = c.rows.filter((r) => r.odometerBad).length
                        const isOpen = open === c.card
                        return [
                          <tr key={c.card} className="border-b border-[#f0f0f0] align-top">
                            <td className="py-2 pr-3">
                              <div className="font-medium">{c.label}</div>
                              <div className="text-xs text-off">Card {c.card}</div>
                            </td>
                            <td className="py-2 pr-3">
                              <select
                                value={assignments[c.card] ?? ''}
                                onChange={(e) => setAssignments((a) => ({ ...a, [c.card]: e.target.value ? Number(e.target.value) : null }))}
                                className={`h-[32px] max-w-[240px] rounded-md border px-2 text-[13px] ${assignments[c.card] ? 'border-line' : 'border-warn bg-warn-bg'}`}
                              >
                                <option value="">— Don't import —</option>
                                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label} ({v.rego})</option>)}
                              </select>
                            </td>
                            <td className="py-2 pr-3">
                              {c.rows.length}
                              {dupes > 0 && <div className="text-xs text-off">{dupes} already logged</div>}
                              {badOdo > 0 && <div className="text-xs text-warn">{badOdo} odd odometer{badOdo === 1 ? '' : 's'}</div>}
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap">{money([...c.rows, ...c.charges].reduce((s, r) => s + Number(r.cost), 0))}</td>
                            <td className="py-2 text-right">
                              <button onClick={() => setOpen(isOpen ? null : c.card)} className="rounded px-2 py-1 text-xs text-primary hover:bg-[#f0f5fb]">
                                {isOpen ? 'Hide' : 'Details'}
                              </button>
                            </td>
                          </tr>,
                          isOpen && (
                            <tr key={`${c.card}-rows`} className="border-b border-[#f0f0f0] bg-[#fafafa]">
                              <td colSpan={5} className="px-3 py-2">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-left text-off">
                                      <th className="py-1 pr-2 font-medium">Date</th>
                                      <th className="py-1 pr-2 font-medium">Station</th>
                                      <th className="py-1 pr-2 font-medium">Litres</th>
                                      <th className="py-1 pr-2 font-medium">Cost</th>
                                      <th className="py-1 pr-2 font-medium">Odometer</th>
                                      <th className="py-1 font-medium" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {c.rows.map((r, i) => (
                                      <tr key={i} className={r.duplicate ? 'text-off' : ''}>
                                        <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                                        <td className="py-1 pr-2">{r.station}{r.product !== 'Diesel' && <span className="text-off"> · {r.product}</span>}</td>
                                        <td className="py-1 pr-2">{r.litres} L</td>
                                        <td className="py-1 pr-2">{money(r.cost)}</td>
                                        <td className="py-1 pr-2 whitespace-nowrap">
                                          {r.odometer == null ? '—' : r.odometerBad ? (
                                            <span className="text-warn" title="Doesn't fit the van's other readings — won't be used">
                                              <s>{r.odometer.toLocaleString()} km</s> looks wrong
                                            </span>
                                          ) : `${r.odometer.toLocaleString()} km`}
                                        </td>
                                        <td className="py-1">{r.duplicate && 'Already logged'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          ),
                        ]
                      })}
                    </tbody>
                  </table>
                </>
              )}
              {importMutation.isError && <p className="mt-3 text-[13px] text-due">{errorText(importMutation.error)}</p>}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3">
          <button onClick={onClose} className="rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#f5f5f5]">
            {result ? 'Done' : 'Cancel'}
          </button>
          {preview && !result && (
            <button
              disabled={toImport.length === 0 || importMutation.isPending}
              onClick={() => importMutation.mutate()}
              className="rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-dark disabled:opacity-40"
            >
              {importMutation.isPending ? 'Importing…' : toImport.length ? `Import ${toImport.length} line${toImport.length === 1 ? '' : 's'}` : 'Nothing new to import'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
