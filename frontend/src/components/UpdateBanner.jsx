import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchAppVersion } from '../api/version'

// Offers a reload once a newer build of the app has been deployed. Never
// reloads by itself — that could throw away a half-filled form.
export function UpdateBanner() {
  const versionQuery = useQuery({
    queryKey: ['appVersion'],
    queryFn: fetchAppVersion,
    refetchInterval: 5 * 60 * 1000,
  })
  const [loadedVersion, setLoadedVersion] = useState(null)
  const current = versionQuery.data
  if (current && loadedVersion === null) setLoadedVersion(current)

  if (!current || !loadedVersion || current === loadedVersion) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-warn-bg px-4 py-2 text-[13px] text-warn">
      A new version of Fleet Maintenance is available.
      <button
        onClick={() => window.location.reload()}
        className="rounded-md bg-primary px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-primary-dark"
      >
        Reload
      </button>
    </div>
  )
}
