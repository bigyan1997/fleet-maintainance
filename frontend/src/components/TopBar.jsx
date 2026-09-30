const linkClass =
  'rounded-md border border-[#3d78b3] bg-transparent px-3.5 py-2 text-[13px] font-semibold text-white no-underline hover:bg-primary-dark'

export function TopBar({ username, links, onLogout }) {
  return (
    <div className="flex items-center justify-between bg-primary px-7 py-4 text-white">
      <div>
        <h1 className="m-0 text-xl font-bold tracking-wide">Fleet Maintenance</h1>
        <div className="mt-0.5 text-[11.5px] tracking-widest text-[#cfe0f2] uppercase">
          Achieve Cafe Provisions
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {links?.sheet && (
          <a href={links.sheet} target="_blank" rel="noopener noreferrer" className={linkClass}>
            Google Sheet ↗
          </a>
        )}
        <a href="#/team" className={linkClass}>
          Team
        </a>
        <span title={username} className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full bg-[#e6f1fb] px-2.5 py-1.5 text-[11px] text-primary">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
          <span className="truncate">{username}</span>
        </span>
        <button
          onClick={onLogout}
          className="rounded-md border border-[#3d78b3] bg-transparent px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-primary-dark"
        >
          Log out
        </button>
      </div>
    </div>
  )
}
