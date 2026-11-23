import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { addHomeNote, deleteHomeNote, useHomeNotes } from '../api/homeNotes'
import { useActions } from '../lib/actions'

// Sydney date, dd-mm-yyyy.
const noteDate = (iso) => new Date(iso).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: '2-digit', month: '2-digit', year: 'numeric' }).replaceAll('/', '-')

// A shared "what's happening" box: anyone using the login can add a short
// note and tick it off when it is done.
export function HomeNotes() {
  const notes = useHomeNotes()
  const queryClient = useQueryClient()
  const { toast } = useActions()
  const [text, setText] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['home-notes'] })
  const add = useMutation({
    mutationFn: addHomeNote,
    onSuccess: () => { setText(''); refresh() },
    onError: () => toast?.('Could not save the note. Try again.', true),
  })
  const remove = useMutation({
    mutationFn: deleteHomeNote,
    onSuccess: refresh,
    onError: () => toast?.('Could not remove the note. Try again.', true),
  })
  const rows = notes.data ?? []
  const submit = (e) => {
    e.preventDefault()
    if (text.trim() && !add.isPending) add.mutate(text.trim())
  }
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <h2 className="text-[15px] font-semibold text-ink">Notes</h2>
        <span className="text-xs text-off">everyone sees these</span>
      </div>
      {rows.length > 0 && (
        <ul className="divide-y divide-[#f0f0f0] border-b border-[#f0f0f0]">
          {rows.map((n) => (
            <li key={n.id} className="flex items-start gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] break-words whitespace-pre-wrap text-ink">{n.text}</div>
                <div className="text-[11px] text-off">{noteDate(n.created_at)}</div>
              </div>
              <button
                onClick={() => remove.mutate(n.id)}
                disabled={remove.isPending}
                className="rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-[#f5f5f5]"
                title="Remove this note"
              >
                Done
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex gap-2 px-4 py-3">
        <input
          type="text"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note, e.g. Van 4 at the tyre shop Monday"
          aria-label="Add a note"
          className="min-w-0 flex-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-[13px]"
        />
        <button type="submit" disabled={!text.trim() || add.isPending} className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold hover:bg-[#f5f5f5] disabled:opacity-50">
          Add
        </button>
      </form>
    </div>
  )
}
