export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  errorMessage,
  confirming,
  onConfirm,
  onCancel,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,.45)] px-5"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[380px] rounded-xl bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-semibold text-ink">{title}</h3>
        <p className="mb-2 text-[13.5px] text-off">{message}</p>
        {errorMessage && (
          <p className="mb-3 text-[12.5px] font-semibold text-due">{errorMessage}</p>
        )}
        <div className="mt-3 flex justify-end gap-2.5">
          <button
            onClick={onCancel}
            className="rounded-md border border-line bg-white px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-[#f5f5f5]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={confirming}
            className="rounded-md border border-[#fca5a5] bg-white px-3.5 py-2 text-[13px] font-semibold text-due hover:bg-due-bg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirming ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
