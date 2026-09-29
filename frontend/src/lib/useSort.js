import { useMemo, useState } from 'react'
import { SERVICE_STATUSES } from './serviceStatus'

// Click-a-header sorting, same behaviour as NPD Tracker's product table:
// first click sorts ascending, clicking the same column again flips it.
// `types` maps a column key to 'number' or 'status'; anything else compares
// as text (ISO dates sort correctly as plain strings).
export function useSort(rows, types = {}) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const dir = sortDir === 'asc' ? 1 : -1
    const type = types[sortKey]
    return [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (type === 'number') return ((parseFloat(av) || 0) - (parseFloat(bv) || 0)) * dir
      if (type === 'status') return (SERVICE_STATUSES.indexOf(av) - SERVICE_STATUSES.indexOf(bv)) * dir
      return String(av || '').localeCompare(String(bv || '')) * dir
    })
  }, [rows, types, sortKey, sortDir])

  const onSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return { sorted, sortKey, sortDir, onSort }
}
