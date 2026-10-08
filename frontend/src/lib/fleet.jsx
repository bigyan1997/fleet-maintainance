import { daysFromToday, fmtAgo, fmtDate } from './formatDate'

// Shared by the Vans list, van pages and fuel views.

export const byNewest = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)

// A van's km is flagged when its newest reading is older than this (a fuel
// statement comes monthly, so a van that was filled up in the last cycle is never this old).
export const KM_STALE_DAYS = 35

export function kmAgeDays(van) {
  return van.odometerAsOf ? -daysFromToday(van.odometerAsOf) : null
}

export function kmIsOld(van) {
  const days = kmAgeDays(van)
  return van.odometer > 0 ? days === null || days > KM_STALE_DAYS : false
}

// Where a van's km comes from, and a warning when it is old or was just typed in.
export function KmAsOf({ van }) {
  if (!van.odometer) return null
  const days = kmAgeDays(van)
  if (days === null) return <div className="text-[11px] font-medium text-warn">not from a fill-up or service</div>
  const old = days > KM_STALE_DAYS
  return (
    <div className={'text-[11px] ' + (old ? 'font-medium text-warn' : 'text-off')}>
      {old ? `km is ${days} days old (${fmtDate(van.odometerAsOf)})` : `as of ${fmtDate(van.odometerAsOf)}`}
    </div>
  )
}

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
  const days = daysFromToday(date)
  const colour = days < 0 ? 'text-due font-medium' : days < 60 ? 'text-warn font-medium' : ''
  return <span className={colour}>{fmtDate(date)}</span>
}
