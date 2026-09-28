import { useState } from 'react'

function niceStep(max) {
  const raw = (max || 1) / 4
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag || 1
}

export function LineChart({ rows }) {
  const [hoverIndex, setHoverIndex] = useState(null)

  if (!rows.some((r) => r.value > 0)) {
    return <div className="py-6 text-center text-sm text-off">No spend recorded in this period.</div>
  }

  const w = 800
  const h = 220
  const padL = 48
  const padR = 12
  const padT = 16
  const padB = 28
  const plotW = w - padL - padR
  const plotH = h - padT - padB
  const maxVal = Math.max(...rows.map((r) => r.value), 1)
  const step = niceStep(maxVal)
  const yMax = step * 4
  const baseY = padT + plotH
  const xAt = (i) => padL + (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * plotW)
  const yAt = (v) => padT + plotH - (v / yMax) * plotH

  const points = rows.map((r, i) => ({ x: xAt(i), y: yAt(r.value), label: r.label, value: r.value, litres: r.litres }))
  const linePath = 'M' + points.map((p) => `${p.x},${p.y}`).join(' L ')
  const areaPath = linePath + ` L ${points[points.length - 1].x},${baseY} L ${points[0].x},${baseY} Z`
  const lastPoint = points[points.length - 1]
  const hovered = hoverIndex !== null ? points[hoverIndex] : null

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${w} ${h}`} className="block w-full" style={{ height: 'auto' }}>
          {[0, 1, 2, 3, 4].map((k) => {
            const val = k * step
            const y = yAt(val)
            return (
              <g key={k}>
                <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#eee" strokeWidth="1" />
                <text x={padL - 8} y={y + 4} fontSize="10" fill="#999" textAnchor="end">
                  {val >= 1000 ? `${val / 1000}k` : val}
                </text>
              </g>
            )
          })}
          <path d={areaPath} fill="var(--color-primary)" fillOpacity="0.08" stroke="none" />
          <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <text key={i} x={p.x} y={h - 8} fontSize="10" fill="#999" textAnchor="middle">{p.label}</text>
          ))}
          <circle cx={lastPoint.x} cy={lastPoint.y} r="4" fill="var(--color-primary)" stroke="#fff" strokeWidth="2" />
          <text x={lastPoint.x} y={lastPoint.y - 12} fontSize="11" fontWeight="600" fill="#1a1a1a" textAnchor={lastPoint.x > w - 70 ? 'end' : 'middle'}>
            ${lastPoint.value.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
          </text>
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="14"
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
            />
          ))}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute z-10 rounded-md bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white"
            style={{ left: `${(hovered.x / w) * 100}%`, top: `${(hovered.y / h) * 100}%`, transform: 'translate(-50%,-115%)' }}
          >
            <div className="font-semibold">
              ${hovered.value.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
              {hovered.litres !== undefined && ` · ${hovered.litres.toLocaleString('en-AU', { maximumFractionDigits: 1 })} L`}
            </div>
            <div>{hovered.label}</div>
          </div>
        )}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-off">Show values</summary>
        <table className="mt-1.5 w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="border-b border-line py-1 text-left text-xs text-off">Month</th>
              <th className="border-b border-line py-1 text-left text-xs text-off">Spend</th>
              {rows[0]?.litres !== undefined && <th className="border-b border-line py-1 text-left text-xs text-off">Litres</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1">{r.label}</td>
                <td className="py-1">${r.value.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</td>
                {r.litres !== undefined && <td className="py-1">{r.litres.toLocaleString('en-AU', { maximumFractionDigits: 1 })} L</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
