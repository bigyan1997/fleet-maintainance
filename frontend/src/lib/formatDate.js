// Every date the app shows is dd-mm-yyyy. The API sends ISO (yyyy-mm-dd),
// which stays the value used for sorting and saving: format only for display.
export function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return d && m && y ? `${d}-${m}-${y}` : String(iso)
}

// dd-mm-yyyy hh:mm in local time, for timestamps like incident updates.
export function fmtDateTime(iso) {
  const t = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(t.getDate())}-${pad(t.getMonth() + 1)}-${t.getFullYear()} ${pad(t.getHours())}:${pad(t.getMinutes())}`
}

// "today", "3 days ago", "2 weeks ago", "4 months ago" — shown next to a
// dd-mm-yyyy date for quick reading.
export function fmtAgo(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const now = new Date()
  const days = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days === -1) return 'tomorrow'
  const n = Math.abs(days)
  const [count, unit] =
    n < 14 ? [n, 'day'] : n < 60 ? [Math.floor(n / 7), 'week'] : n < 365 ? [Math.floor(n / 30), 'month'] : [Math.floor(n / 365), 'year']
  const label = `${count} ${unit}${count === 1 ? '' : 's'}`
  return days > 0 ? `${label} ago` : `in ${label}`
}
