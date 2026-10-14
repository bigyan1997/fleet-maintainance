const linkClass =
  'rounded-md border border-[#3d78b3] bg-transparent px-3 py-1.5 text-[13px] font-semibold text-white no-underline hover:bg-primary-dark'

export function TopBar({ username, links, onLogout }) {
  return (
    <div className="bg-primary text-white">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-2.5 lg:px-8">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h1 className="m-0 text-[18px] font-bold tracking-wide whitespace-nowrap">Fleet Maintenance</h1>
          <div className="text-[11px] tracking-widest whitespace-nowrap text-[#cfe0f2] uppercase">Achieve Cafe Provisions</div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          {links?.sheet && (
            <a href={links.sheet} target="_blank" rel="noopener noreferrer" className={linkClass + ' hidden sm:inline-block'}>
              Google Sheet ↗
            </a>
          )}
          {links?.driveFolder && (
            <a href={links.driveFolder} target="_blank" rel="noopener noreferrer" className={linkClass + ' hidden sm:inline-block'}>
              Google Drive ↗
            </a>
          )}
          <span title={username} className="hidden max-w-[220px] items-center gap-1.5 rounded-full bg-[#e6f1fb] px-2.5 py-1 text-[11px] text-primary sm:inline-flex">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
            <span className="truncate">{username}</span>
          </span>
          <button onClick={onLogout} className={linkClass}>
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
