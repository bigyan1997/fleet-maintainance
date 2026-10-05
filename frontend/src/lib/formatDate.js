// Every date the app shows is dd-mm-yyyy, and every "today" / clock time is
// Sydney time (AEST/AEDT, daylight saving included), whatever time zone the
// viewing computer or phone is set to. The API sends ISO (yyyy-mm-dd), which
// stays the value used for sorting and saving: format only for display.

const TZ = 'Australia/Sydney'

// "2026-10-01" in Sydney, right now.
export function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

// Sydney's current year and month name, e.g. 2026 and "October".
export function sydneyYear() {
  return Number(todayIso().slice(0, 4))
}
export function sydneyMonthName() {
  return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, month: 'long' }).format(new Date())
}

// Whole days from Sydney's today to `iso` (negative = in the past).
export function daysFromToday(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const [ty, tm, td] = todayIso().split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000)
}

export function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return d && m && y ? `${d}-${m}-${y}` : String(iso)
}

// dd-mm-yyyy hh:mm in Sydney time, for timestamps like incident updates.
export function fmtDateTime(iso) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  )
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}`
}

// "today", "3 days ago", "2 weeks ago", "4 months ago" — shown next to a
// dd-mm-yyyy date for quick reading.
export function fmtAgo(iso) {
  if (!iso) return ''
  const days = -daysFromToday(iso)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days === -1) return 'tomorrow'
  const n = Math.abs(days)
  const [count, unit] =
    n < 14 ? [n, 'day'] : n < 60 ? [Math.floor(n / 7), 'week'] : n < 365 ? [Math.floor(n / 30), 'month'] : [Math.floor(n / 365), 'year']
  const label = `${count} ${unit}${count === 1 ? '' : 's'}`
  return days > 0 ? `${label} ago` : `in ${label}`
}
