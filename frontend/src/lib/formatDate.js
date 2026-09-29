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
