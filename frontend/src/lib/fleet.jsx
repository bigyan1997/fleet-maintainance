import { fmtAgo, fmtDate } from './formatDate'

// Shared by the Vans list, van pages and fuel views.

export const byNewest = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)

export function kmColour(kmLeft) {
  if (kmLeft < 0) return 'text-due'
  if (kmLeft < 2000) return 'text-warn'
  return ''
}

export function serviceText(svc) {
  if (!svc) return 'No service logged'
  return svc.km_left < 0 ? `${Math.abs(svc.km_left).toLocaleString()} km overdue` : `${svc.km_left.toLocaleString()} km left`
}

export function washText(v) {
  if (!v.wash_needed) return 'No need'
  return v.lastWashed ? fmtAgo(v.lastWashed) : 'Never logged'
}

export function expiryCell(date) {
  if (!date) return <span className="text-off">—</span>
  const days = Math.round((new Date(date) - new Date(new Date().toDateString())) / 86400000)
  const colour = days < 0 ? 'text-due font-medium' : days < 60 ? 'text-warn font-medium' : ''
  return <span className={colour}>{fmtDate(date)}</span>
}
