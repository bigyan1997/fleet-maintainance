function stamp(iso) {
  return new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Read-only list of an incident's dated follow-up entries, oldest first.
export function IncidentLog({ updates }) {
  if (!updates?.length) return <div className="text-[13px] text-off">No updates yet.</div>
  return (
    <ol className="space-y-2">
      {updates.map((u) => (
        <li key={u.id} className="rounded-md border border-line bg-[#fafafa] px-3 py-2 text-[13px]">
          <div className="mb-0.5 text-[11px] text-off">
            {stamp(u.created_at)}
            {u.author && ` · ${u.author}`}
          </div>
          <div className="whitespace-pre-wrap text-ink">{u.text}</div>
        </li>
      ))}
    </ol>
  )
}
