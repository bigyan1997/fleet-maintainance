// Shared building blocks for the app shell and pages.

const ICONS = {
  today: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  vans: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  jobs: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  washes: 'M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z',
  fuel: 'M4 21V5a2 2 0 012-2h7a2 2 0 012 2v16M4 21h11M7 8h5M15 9h2a2 2 0 012 2v6a1.5 1.5 0 003 0V9l-3-3',
  reports: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  sheet: 'M5 3h10l4 4v14H5zM9 12h6M9 16h6M15 3v4h4',
  logout: 'M15 17l5-5-5-5M20 12H9M11 21H5V3h6',
  back: 'M15 18l-6-6 6-6',
  incident: 'M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  team: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M16 3.5a4 4 0 010 7M22 21v-1a6 6 0 00-4-5.6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
}

export function Icon({ name, className = 'h-[18px] w-[18px]' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}

export function PageHeader({ title, description, actions, back }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <a href={back.href} className="mb-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
            <Icon name="back" className="h-3.5 w-3.5" /> {back.label}
          </a>
        )}
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-[70ch] text-[13.5px] text-off">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Button({ variant = 'secondary', icon, children, className = '', ...rest }) {
  const styles = {
    primary: 'bg-primary text-white hover:bg-primary-dark border-primary',
    secondary: 'bg-white text-ink hover:bg-[#f3f5f8] border-line',
    danger: 'bg-white text-due hover:bg-due-bg border-[#f1c0c0]',
    ghost: 'bg-transparent text-off hover:bg-[#eef1f5] hover:text-ink border-transparent',
  }
  return (
    <button
      className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3.5 text-[13px] font-medium whitespace-nowrap shadow-[0_1px_0_rgba(16,24,40,.04)] disabled:opacity-50 ${styles[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} className="h-4 w-4" />}
      {children}
    </button>
  )
}

// Segmented control: [{ key, label, count? }]
export function Tabs({ items, value, onChange }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]">
      {items.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={
            'flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap ' +
            (value === t.key ? 'border-primary text-primary' : 'border-transparent text-off hover:text-ink')
          }
        >
          {t.label}
          {t.count !== undefined && (
            <span className={'rounded-full px-1.5 py-px text-[11px] ' + (value === t.key ? 'bg-[#e6eef8] text-primary' : 'bg-[#eef1f5] text-off')}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

export function Card({ title, description, actions, children, className = '', padded = true }) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,.05)] ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-[14.5px] font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-off">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  )
}

// Big-number tile: label, value, optional small explanation underneath.
export function Stat({ label, value, sub, tone }) {
  const tones = { due: 'text-due', warn: 'text-warn', ok: 'text-ok' }
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,.05)]">
      <div className="text-xs font-medium text-off">{label}</div>
      <div className={'mt-1 text-[24px] leading-tight font-semibold tabular-nums ' + (tones[tone] ?? 'text-ink')}>{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] leading-snug text-off">{sub}</div>}
    </div>
  )
}

export function Pill({ tone = 'info', children }) {
  const tones = {
    due: 'bg-due-bg text-due',
    warn: 'bg-warn-bg text-warn',
    ok: 'bg-ok-bg text-ok',
    info: 'bg-[#e6eef8] text-primary',
    off: 'bg-[#eef1f5] text-off',
  }
  return <span className={'inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ' + tones[tone]}>{children}</span>
}

// Centred pop-up. Clicking the dimmed background or pressing Esc closes it.
export function Modal({ onClose, children, width = 'max-w-[760px]' }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(15,23,42,.5)] px-4 py-[6vh]"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className={`w-full ${width} rounded-xl bg-white shadow-[0_24px_64px_rgba(15,23,42,.3)]`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export function Empty({ children }) {
  return <div className="px-4 py-10 text-center text-[13px] text-off">{children}</div>
}
