export function Toast({ message, isError }) {
  if (!message) return null
  return (
    <div
      className={
        'fixed bottom-5.5 right-5.5 z-100 rounded-lg px-4.5 py-3 text-[13px] text-white shadow-[0_4px_12px_rgba(0,0,0,.2)]' +
        (isError ? ' bg-due' : ' bg-ink')
      }
    >
      {message}
    </div>
  )
}
