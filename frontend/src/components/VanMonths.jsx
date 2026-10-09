// Every van, month by month: fuel (dollars and litres) or tolls (dollars and
// trips). Darker blue = more. Only the months in the chosen date range.
const money = (n) => `$${Number(n).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`
const num = (n) => Number(n).toLocaleString('en-AU', { maximumFractionDigits: 0 })

export function VanMonths({ kind, data, rangeLabel }) {
  const allMonths = data?.months ?? []
  const rows = data?.[kind] ?? []
  // Months before the first one with anything in them are left out.
  const firstUsed = allMonths.findIndex((m) => rows.some((r) => (r.months[m.key]?.cost ?? 0) > 0))
  const months = firstUsed > 0 ? allMonths.slice(firstUsed) : allMonths
  const second = kind === 'fuel' ? { key: 'litres', text: (v) => `${num(v)} L` } : { key: 'trips', text: (v) => `${num(v)} trip${Number(v) === 1 ? '' : 's'}` }
  const title = kind === 'fuel' ? 'Fuel by van, month by month' : 'Tolls by van, month by month'
  const note = kind === 'fuel'
    ? 'Dollars on the fuel card (fuel + card fees) and litres of diesel, by the date of each fill-up.'
    : 'Dollars of tolls and the number of trips, by the date of each trip.'
  const max = Math.max(1, ...rows.flatMap((r) => Object.values(r.months).map((c) => c.cost)))
  const colTotal = (k, field) => rows.reduce((s, r) => s + (r.months[k]?.[field] ?? 0), 0)
  const grand = (field) => rows.reduce((s, r) => s + r.total[field], 0)
  const cell = 'px-2.5 py-2 text-right tabular-nums whitespace-nowrap'
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-line bg-white">
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold text-ink">{title} <span className="font-normal text-off">· {rangeLabel}</span></h2>
        <p className="mt-0.5 text-xs text-off">{note}</p>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 pb-6 text-center text-sm text-off">Nothing in this range.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-y border-line bg-[#fafafa] text-xs text-off">
                <th className="sticky left-0 bg-[#fafafa] px-4 py-2 text-left font-medium">Van</th>
                {months.map((m) => <th key={m.key} className="px-2.5 py-2 text-right font-medium whitespace-nowrap">{m.label}</th>)}
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[#f0f0f0]">
                  <td className="sticky left-0 bg-white px-4 py-2 font-medium whitespace-nowrap">{r.label}</td>
                  {months.map((m) => {
                    const c = r.months[m.key]
                    return c && c.cost > 0 ? (
                      <td key={m.key} className={cell} style={{ backgroundColor: `rgba(24,95,165,${0.06 + 0.4 * (c.cost / max)})` }}>
                        <div className="font-medium">{money(c.cost)}</div>
                        <div className="text-[11px] text-off">{second.text(c[second.key])}</div>
                      </td>
                    ) : (
                      <td key={m.key} className={cell + ' text-off'}>—</td>
                    )
                  })}
                  <td className={cell + ' font-semibold'}>
                    <div>{money(r.total.cost)}</div>
                    <div className="text-[11px] font-normal text-off">{second.text(r.total[second.key])}</div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-[#fafafa] font-semibold">
                <td className="sticky left-0 bg-[#fafafa] px-4 py-2">All vans</td>
                {months.map((m) => (
                  <td key={m.key} className={cell}>
                    {colTotal(m.key, 'cost') > 0 ? (
                      <>
                        <div>{money(colTotal(m.key, 'cost'))}</div>
                        <div className="text-[11px] font-normal text-off">{second.text(colTotal(m.key, second.key))}</div>
                      </>
                    ) : '—'}
                  </td>
                ))}
                <td className={cell}>
                  <div>{money(grand('cost'))}</div>
                  <div className="text-[11px] font-normal text-off">{second.text(grand(second.key))}</div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
