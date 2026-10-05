import { href } from '../lib/router'

// subtitle: the van's make, model and plate; vehicleId adds a link to its page.
export function DetailModal({ title, subtitle, vehicleId, rows, extra, onClose, onEdit }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,.45)] px-5" onClick={onClose}>
      <div className="w-full max-w-[560px] rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3">
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
          {(subtitle || vehicleId) && (
            <div className="text-[13px] text-off">
              {subtitle}
              {vehicleId && (
                <>
                  {subtitle ? ' · ' : ''}
                  <a href={href('vans', vehicleId)} onClick={onClose} className="font-medium text-primary no-underline hover:underline">Open van page →</a>
                </>
              )}
            </div>
          )}
        </div>
        <div className="mb-4 text-[13px] text-[#333]">
          {rows.map(([label, value], i) => (
            <div key={i} className="flex items-start justify-between gap-3 border-b border-[#f0f0f0] py-1.5 last:border-0">
              <span className="text-off">{label}</span>
              <span className="text-right font-medium">{value ?? '—'}</span>
            </div>
          ))}
        </div>
        {extra}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#f5f5f5]">
            Close
          </button>
          {onEdit && (
            <button onClick={onEdit} className="rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-dark">
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
