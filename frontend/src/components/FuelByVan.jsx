import { useState } from 'react'
import { byNewest } from '../lib/fleet'
import { fmtDate } from '../lib/formatDate'

const money = (n) => `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const sum = (rows, key) => rows.reduce((s, r) => s + Number(r[key]), 0)
// "Metro Petroleum Sydenham · imported from fuel statement …" -> "Metro Petroleum Sydenham"
const station = (f) => (f.notes || '').split(' · ')[0]

// Litres per 100 km across a van's fill-ups: km between the lowest and
// highest odometer reading, and the fuel put in after that first reading
// (the first fill-up's litres were burnt before the period started).
function consumption(fills) {
  const withOdo = fills.filter((f) => f.odometer).sort((a, b) => a.odometer - b.odometer)
  if (withOdo.length < 2) return null
  const first = withOdo[0]
  const last = withOdo[withOdo.length - 1]
  const km = last.odometer - first.odometer
  if (km <= 0) return null
  const between = fills.filter((f) => f !== first && f.date >= first.date && f.date <= last.date)
  const litres = between.reduce((s, f) => s + Number(f.litres), 0)
  return (litres / km) * 100
}

function RowActions({ f, onEdit, onDelete }) {
  return (
    <td className="py-2 pr-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => onEdit(f)} className="mr-1 rounded px-1.5 py-0.5 text-off hover:bg-[#f0f0f0]" title="Edit">✎</button>
      <button onClick={() => onDelete(f)} className="rounded px-1.5 py-0.5 text-off hover:bg-due-bg hover:text-due" title="Delete">✕</button>
    </td>
  )
}

// One van's fill-ups, then its card charges, with a total that matches the
// fuel card statement.
export function VanDetail({ fills, charges, onPick, onEdit, onDelete, centered = false }) {
  const fuelCost = sum(fills, 'cost')
  const chargeCost = sum(charges, 'cost')
  const th = 'py-2 pr-3 font-medium'
  const num = 'py-2 pr-3 text-right tabular-nums whitespace-nowrap'
  return (
    <div className={`max-w-[960px] overflow-hidden rounded-lg border border-line bg-white ${centered ? 'mx-auto shadow-[0_2px_8px_rgba(16,24,40,.06)]' : ''}`}>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line bg-[#fafafa] text-left text-xs text-off">
            <th className={`${th} pl-3`}>Date</th>
            <th className={th}>Station</th>
            <th className={`${th} text-right`}>Litres</th>
            <th className={`${th} text-right`}>$/L</th>
            <th className={`${th} text-right`}>Cost</th>
            <th className={`${th} text-right`}>Odometer</th>
            <th className={`${th} text-right`}>Docket</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {fills.map((f, i) => (
            <tr key={f.id} className={`cursor-pointer border-b border-[#f0f0f0] hover:bg-[#f0f5fb] ${i % 2 ? 'bg-[#fafafa]' : ''}`} onClick={() => onPick(f)}>
              <td className="py-2 pr-3 pl-3 whitespace-nowrap">{fmtDate(f.date)}</td>
              <td className="py-2 pr-3">
                {station(f) || '—'}
                {f.product && f.product !== 'Diesel' && <span className="ml-1.5 rounded bg-warn-bg px-1.5 py-0.5 text-[11px] font-medium text-warn">{f.product}</span>}
              </td>
              <td className={num}>{Number(f.litres).toFixed(2)} L</td>
              <td className={`${num} text-off`}>{f.pricePerLitre ? `$${f.pricePerLitre}` : '—'}</td>
              <td className={`${num} font-medium`}>{money(f.cost)}</td>
              <td className={num}>{f.odometer ? `${f.odometer.toLocaleString()} km` : <span className="text-off">—</span>}</td>
              <td className={`${num} text-off`}>{f.invoice_number || '—'}</td>
              <RowActions f={f} onEdit={onEdit} onDelete={onDelete} />
            </tr>
          ))}
          <tr className="border-b border-line bg-[#f5f8fc] font-semibold">
            <td className="py-2 pr-3 pl-3" colSpan={2}>Fuel — {fills.length} fill-up{fills.length === 1 ? '' : 's'}</td>
            <td className={num}>{sum(fills, 'litres').toFixed(2)} L</td>
            <td />
            <td className={num}>{money(fuelCost)}</td>
            <td colSpan={3} />
          </tr>
          {charges.length > 0 && (
            <>
              <tr>
                <td colSpan={8} className="pt-3 pb-1 pl-3 text-xs font-medium tracking-wide text-off uppercase">Card fees &amp; other charges</td>
              </tr>
              {charges.map((f) => (
                <tr key={f.id} className="cursor-pointer border-b border-[#f0f0f0] text-off hover:bg-[#f0f5fb]" onClick={() => onPick(f)}>
                  <td className="py-2 pr-3 pl-3 whitespace-nowrap">{fmtDate(f.date)}</td>
                  <td className="py-2 pr-3" colSpan={3}>{f.product || 'Charge'}</td>
                  <td className={num}>{money(f.cost)}</td>
                  <td colSpan={2} />
                  <RowActions f={f} onEdit={onEdit} onDelete={onDelete} />
                </tr>
              ))}
              <tr className="border-b border-line bg-[#f5f8fc] font-semibold">
                <td className="py-2 pr-3 pl-3" colSpan={4}>Charges</td>
                <td className={num}>{money(chargeCost)}</td>
                <td colSpan={3} />
              </tr>
            </>
          )}
          <tr className="bg-[#eaf1f9] text-[14px] font-bold">
            <td className="py-2.5 pr-3 pl-3" colSpan={4}>Total{charges.length > 0 && ' (as on the fuel card statement)'}</td>
            <td className={num}>{money(fuelCost + chargeCost)}</td>
            <td colSpan={3} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// One row per van with its totals; click a van to see its fill-ups.
export function FuelByVan({ rows, emptyText, onPick, onEdit, onDelete }) {
  const [open, setOpen] = useState(null)

  const groups = Object.values(
    rows.reduce((acc, f) => {
      ;(acc[f.vehicle] ??= { id: f.vehicle, label: f.vehicleLabel, rows: [] }).rows.push(f)
      return acc
    }, {}),
  ).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))

  if (groups.length === 0) return <p className="px-3 py-10 text-center text-[13px] text-off">{emptyText}</p>

  const allFuel = rows.filter((f) => f.isFuel)

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line bg-[#fafafa] text-xs text-off">
            <th className="px-3 py-2.5 text-left font-medium">Van</th>
            <th className="px-3 py-2.5 text-right font-medium">Fill-ups</th>
            <th className="px-3 py-2.5 text-right font-medium">Litres</th>
            <th className="px-3 py-2.5 text-right font-medium">Avg $/L</th>
            <th className="px-3 py-2.5 text-right font-medium">L/100km</th>
            <th className="px-3 py-2.5 text-right font-medium">Fuel</th>
            <th className="px-3 py-2.5 text-right font-medium">Card fees</th>
            <th className="px-3 py-2.5 text-right font-medium">Total<div className="font-normal">(as on statement)</div></th>
            <th className="px-3 py-2.5 text-right font-medium">Last fill-up</th>
            <th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const fills = g.rows.filter((f) => f.isFuel).sort(byNewest)
            const charges = g.rows.filter((f) => !f.isFuel).sort(byNewest)
            const litres = sum(fills, 'litres')
            const fuelCost = sum(fills, 'cost')
            const per100 = consumption(fills)
            const isOpen = open === g.id
            const num = 'px-3 py-2.5 text-right tabular-nums whitespace-nowrap'
            return [
              <tr key={g.id} className={`cursor-pointer border-b border-[#f0f0f0] hover:bg-[#fafafa] ${isOpen ? 'bg-[#f5f8fc]' : ''}`} onClick={() => setOpen(isOpen ? null : g.id)}>
                <td className="px-3 py-2.5 font-medium">
                  <span className="mr-1.5 inline-block w-3 text-off">{isOpen ? '▾' : '▸'}</span>
                  {g.label}
                </td>
                <td className={num}>{fills.length}</td>
                <td className={num}>{litres.toFixed(2)} L</td>
                <td className={num}>{litres ? `$${(fuelCost / litres).toFixed(3)}` : '—'}</td>
                <td className={num}>{per100 ? per100.toFixed(1) : '—'}</td>
                <td className={num}>{money(fuelCost)}</td>
                <td className={`${num} text-off`}>{money(sum(charges, 'cost'))}</td>
                <td className={`${num} font-semibold`}>{money(sum(g.rows, 'cost'))}</td>
                <td className={num}>{fills[0] ? fmtDate(fills[0].date) : '—'}</td>
                <td className="px-3 py-2.5 text-right text-xs text-primary">{isOpen ? 'Hide' : 'Show fill-ups'}</td>
              </tr>,
              isOpen && (
                <tr key={`${g.id}-fills`} className="border-b border-line bg-[#f5f8fc]">
                  <td colSpan={10} className="px-3 pt-2 pb-5">
                    <VanDetail fills={fills} charges={charges} onPick={onPick} onEdit={onEdit} onDelete={onDelete} centered />
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-line bg-[#fafafa] font-semibold">
            <td className="px-3 py-2.5">All vans</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{allFuel.length}</td>
            <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{sum(allFuel, 'litres').toFixed(2)} L</td>
            <td colSpan={2} />
            <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{money(sum(allFuel, 'cost'))}</td>
            <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{money(sum(rows.filter((f) => !f.isFuel), 'cost'))}</td>
            <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{money(sum(rows, 'cost'))}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      <p className="border-t border-line px-3 py-2.5 text-xs text-off">
        <b>Fuel</b> = diesel fill-ups. <b>Card fees</b> = roadside assist, card &amp; management fees, AdBlue and other non-fuel charges on the fuel card.
        <b> Total</b> = both, the same as each card's total on the fuel card statement. Fill-ups, litres, $/L and L/100km count diesel only.
      </p>
    </div>
  )
}
