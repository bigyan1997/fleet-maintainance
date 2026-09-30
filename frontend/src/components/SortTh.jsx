// Clickable column header, same look as NPD Tracker's: ▲/▼ on the active column.
export function SortTh({ label, col, sort }) {
  return (
    <th className="cursor-pointer px-2 py-2 text-left font-medium select-none hover:text-ink" onClick={() => sort.onSort(col)}>
      {label}
      {sort.sortKey === col && <span className="ml-1">{sort.sortDir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )
}
