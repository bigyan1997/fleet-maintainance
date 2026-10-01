import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchBudget, fetchFuelTrends, saveBudget } from '../api/extra'
import { useActions } from '../lib/actions'
import { href } from '../lib/router'
import { Button, Card, Empty, Pill, Stat } from './ui'

const money = (n) => `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const money0 = (n) => `$${Number(n).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`

// ── Fuel trends ────────────────────────────────────────────────────────────

export function FuelTrends() {
  const { data } = useQuery({ queryKey: ['fuel-trends'], queryFn: fetchFuelTrends })
  if (!data) return null
  const used = data.months.filter((m) => data.vans.some((v) => v.months.find((c) => c.month === m.key)?.fills))
  const shown = used.slice(-6)
  const priceRows = data.pricePerLitre.filter((p) => p.value)
  const cheapest = data.stations[0]?.avgPrice

  if (shown.length === 0) return <Card><Empty>No fuel logged yet. Import a fuel statement on the Fuel page.</Empty></Card>

  return (
    <div className="grid gap-5">
      {shown.length < 3 && (
        <div className="rounded-lg border border-[#bcd5ee] bg-[#eef5fc] px-4 py-3 text-[13px] text-primary">
          Only {shown.length} month{shown.length === 1 ? '' : 's'} of fuel so far. Trends become useful after 3 or more monthly statements; each import adds a month here.
        </div>
      )}
      <Card
        title="Fuel use per van, month by month"
        description="L/100km (diesel only) and the fuel card total (fuel + card fees) for each calendar month. A van whose L/100km climbs month after month is worth a check."
        padded={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-[#f8fafc] text-xs text-off">
                <th className="px-4 py-2 text-left font-medium">Van</th>
                {shown.map((m) => <th key={m.key} className="px-3 py-2 text-right font-medium">{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.vans.map((v) => {
                let prev = null
                return (
                  <tr key={v.id} className="border-b border-[#eef1f5] last:border-0">
                    <td className="px-4 py-2.5"><a href={href('vans', v.id)} className="font-medium hover:text-primary">{v.label}</a></td>
                    {shown.map((m) => {
                      const c = v.months.find((x) => x.month === m.key)
                      const up = prev && c?.per100 && c.per100 > prev * 1.1
                      if (c?.per100) prev = c.per100
                      return (
                        <td key={m.key} className="px-3 py-2.5 text-right tabular-nums">
                          {c?.fills ? (
                            <>
                              <div className={'font-semibold ' + (up ? 'text-warn' : '')}>{c.per100 ? `${c.per100} L/100km${up ? ' ▲' : ''}` : '—'}</div>
                              <div className="text-xs text-off">{money0(c.cost)} · {Math.round(c.litres)} L</div>
                            </>
                          ) : <span className="text-off">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2.5 text-xs text-off">▲ = more than 10% worse than the month before. "—" = no fill-ups, or not enough odometer readings typed at the pump.</p>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Price per litre" description="Average paid for diesel across the fleet each month (incl. GST, before card fees)." padded={false}>
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {priceRows.map((p, i) => {
                const before = priceRows[i - 1]?.value
                const diff = before ? (p.value - before) * 100 : null
                return (
                  <tr key={p.month} className="border-b border-[#eef1f5] last:border-0">
                    <td className="px-4 py-2.5">{data.months.find((m) => m.key === p.month)?.label}</td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums">${p.value.toFixed(3)}/L</td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                      {diff === null ? <span className="text-off">first month</span> : (
                        <span className={diff > 0 ? 'text-due' : 'text-ok'}>{diff > 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}c/L</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>

        <Card title="Stations" description="What each station charged on average, cheapest first. Only fill-ups imported from a statement (they carry the station name)." padded={false}>
          {data.stations.length === 0 ? <Empty>No imported fill-ups yet.</Empty> : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line bg-[#f8fafc] text-xs text-off">
                  <th className="px-4 py-2 text-left font-medium">Station</th>
                  <th className="px-2 py-2 text-right font-medium">Fill-ups</th>
                  <th className="px-2 py-2 text-right font-medium">Avg $/L</th>
                  <th className="px-4 py-2 text-right font-medium">vs cheapest</th>
                </tr>
              </thead>
              <tbody>
                {data.stations.map((s) => (
                  <tr key={s.station} className="border-b border-[#eef1f5] last:border-0">
                    <td className="px-4 py-2.5">{s.station}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{s.fills}</td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums">${s.avgPrice.toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                      {s.avgPrice === cheapest ? <Pill tone="ok">cheapest</Pill> : <span className="text-due">+{((s.avgPrice - cheapest) * 100).toFixed(1)}c/L</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  )
}

// ── Budget vs actual ───────────────────────────────────────────────────────

function BudgetBar({ actual, budget }) {
  if (!budget) return <span className="text-xs text-off">no budget set</span>
  const pct = actual / budget
  const tone = pct > 1 ? 'bg-due' : pct > 0.9 ? 'bg-[#d4a017]' : 'bg-ok'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-[120px] overflow-hidden rounded-full bg-[#e7ecf2]">
        <div className={'h-full rounded-full ' + tone} style={{ width: `${Math.min(pct, 1) * 100}%` }} />
      </div>
      <span className={'text-xs tabular-nums ' + (pct > 1 ? 'font-semibold text-due' : 'text-off')}>{Math.round(pct * 100)}%</span>
    </div>
  )
}

export function BudgetView() {
  const queryClient = useQueryClient()
  const { toast } = useActions()
  const { data } = useQuery({ queryKey: ['budget'], queryFn: fetchBudget })
  const [draft, setDraft] = useState(null)
  const save = useMutation({
    mutationFn: () => saveBudget({ fuel: draft.fuel, maintenance: draft.maintenance }),
    onSuccess: (d) => { queryClient.setQueryData(['budget'], d); setDraft(null); toast('Budgets saved.') },
    onError: (err) => toast(err?.response?.data?.detail ?? 'Could not save the budgets.', true),
  })
  if (!data) return null
  const b = data.budgets
  const form = draft ?? { fuel: b.fuel ?? '', maintenance: b.maintenance ?? '' }
  const months = [...data.months].reverse()
  const thisYear = data.months.filter((m) => m.month.startsWith(String(new Date().getFullYear())))
  const ytd = (k) => thisYear.reduce((s, m) => s + m[k], 0)

  return (
    <div className="grid gap-5">
      <Card title="Monthly budgets" description="What you plan to spend each month. Leave a box empty for no budget.">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          {[['fuel', 'Fuel card (fuel + card fees)'], ['maintenance', 'Maintenance (services, repairs, incidents)']].map(([k, label]) => (
            <label key={k} className="grid gap-1 text-xs font-medium text-off">
              {label}
              <span className="flex items-center gap-1 text-sm text-ink">$
                <input
                  type="number" min="0" step="100" value={form[k]}
                  onChange={(e) => setDraft({ ...form, [k]: e.target.value })}
                  placeholder="e.g. 10000"
                  className="h-9 w-[150px] rounded-md border border-line px-2.5 text-right text-[13px] tabular-nums"
                />
                <span className="text-xs text-off">per month</span>
              </span>
            </label>
          ))}
          <Button type="submit" variant="primary" disabled={!draft || save.isPending}>Save budgets</Button>
        </form>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label={`Fuel card spend, ${new Date().getFullYear()} so far`} value={money0(ytd('fuel'))} sub={b.fuel ? `budget ${money0(b.fuel * thisYear.length)} for ${thisYear.length} months` : 'no budget set'} tone={b.fuel && ytd('fuel') > b.fuel * thisYear.length ? 'due' : undefined} />
        <Stat label={`Maintenance, ${new Date().getFullYear()} so far`} value={money0(ytd('maintenance'))} sub={b.maintenance ? `budget ${money0(b.maintenance * thisYear.length)} for ${thisYear.length} months` : 'no budget set'} tone={b.maintenance && ytd('maintenance') > b.maintenance * thisYear.length ? 'due' : undefined} />
        <Stat label="Fuel budget" value={b.fuel ? money0(b.fuel) : '—'} sub="per month" />
        <Stat label="Maintenance budget" value={b.maintenance ? money0(b.maintenance) : '—'} sub="per month" />
      </div>

      <Card title="Month by month, last 12 months" description="Actual spend against the monthly budget. Red means over budget." padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-[#f8fafc] text-xs text-off">
                <th className="px-4 py-2 text-left font-medium">Month</th>
                <th className="px-2 py-2 text-right font-medium">Fuel card</th>
                <th className="px-2 py-2 text-left font-medium">vs budget</th>
                <th className="px-2 py-2 text-right font-medium">Maintenance</th>
                <th className="px-4 py-2 text-left font-medium">vs budget</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-b border-[#eef1f5] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{m.label}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{m.fuel ? money(m.fuel) : <span className="text-off">—</span>}</td>
                  <td className="px-2 py-2.5">{m.fuel ? <BudgetBar actual={m.fuel} budget={b.fuel} /> : null}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{m.maintenance ? money(m.maintenance) : <span className="text-off">—</span>}</td>
                  <td className="px-4 py-2.5">{m.maintenance ? <BudgetBar actual={m.maintenance} budget={b.maintenance} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2.5 text-xs text-off">Fuel card = every line on the fuel statements (fuel + card fees), by the date on each line. Maintenance = service and repair costs plus incident costs. Van washes are free and not counted.</p>
      </Card>
    </div>
  )
}
