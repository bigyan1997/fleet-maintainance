export function BarList({ rows }) {
  if (!rows || rows.length === 0) {
    return <div className="py-6 text-center text-sm text-off">No cost data yet.</div>
  }
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[150px_1fr_auto] items-center gap-3 rounded-md px-1 py-1.5 hover:bg-[#fafafa]">
          <div className="truncate text-xs text-[#444]" title={r.label}>{r.label}</div>
          <div className="h-3.5 overflow-hidden rounded-md bg-[#f0f0f0]">
            <div className="h-3.5 rounded-r bg-primary" style={{ width: `${Math.max((r.value / max) * 100, 2)}%` }} />
          </div>
          <div className="min-w-[70px] text-right text-xs font-semibold text-ink">
            ${r.value.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
          </div>
        </div>
      ))}
    </div>
  )
}
