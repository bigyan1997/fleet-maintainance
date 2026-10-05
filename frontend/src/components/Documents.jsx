import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { deleteAttachment, fetchAttachments, uploadAttachment } from '../api/extra'
import { useActions } from '../lib/actions'
import { fmtDate } from '../lib/formatDate'
import { ConfirmDialog } from './ConfirmDialog'
import { Button, Icon } from './ui'

const KINDS = ['Invoice', 'Quote', 'Registration', 'Insurance', 'Photo', 'Other']

function size(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// Files kept with a van, a service or an incident. Pass exactly the one it
// belongs to; a van shows every file for that van, including ones added
// against its services and incidents.
export function Documents({ vehicle, service, incident, compact = false }) {
  const filters = service ? { service } : incident ? { incident } : { vehicle }
  const queryClient = useQueryClient()
  const { toast } = useActions()
  const input = useRef(null)
  const [kind, setKind] = useState(service ? 'Invoice' : incident ? 'Photo' : 'Registration')
  const [removing, setRemoving] = useState(null)
  const docs = useQuery({ queryKey: ['attachments', filters], queryFn: () => fetchAttachments(filters) })

  const upload = useMutation({
    mutationFn: (files) => Promise.all([...files].map((file) => uploadAttachment({ file, kind, vehicle, service, incident }))),
    onSuccess: (added) => {
      queryClient.invalidateQueries({ queryKey: ['attachments'] })
      toast(`${added.length} file${added.length === 1 ? '' : 's'} attached.`)
    },
    onError: (err) => toast(err?.response?.data?.detail ?? 'Could not attach the file.', true),
  })
  const remove = useMutation({
    mutationFn: (d) => deleteAttachment(d.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments'] })
      setRemoving(null)
      toast('File removed.')
    },
  })

  // A job's issue/damage photos already show in its photo strip.
  const rows = (docs.data ?? []).filter((d) => !((service || incident) && d.kind === 'Issue photo'))
  return (
    <div className={compact ? '' : 'p-4'}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type of document" className="h-9 rounded-md border border-line bg-white px-2.5 text-[13px]">
          {KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) upload.mutate(e.target.files)
            e.target.value = ''
          }}
        />
        <Button icon="upload" disabled={upload.isPending} onClick={() => input.current?.click()}>
          {upload.isPending ? 'Uploading…' : 'Attach file'}
        </Button>
        <span className="text-xs text-off">PDF, photo, Word or Excel, up to 20 MB. On a phone you can take a photo.</span>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#c9d3df] px-4 py-6 text-center text-[13px] text-off">
          {docs.isLoading ? 'Loading…' : 'No files attached yet.'}
        </div>
      ) : (
        <ul className="divide-y divide-[#eef1f5] rounded-lg border border-line">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13px]">
              <span className="rounded-md bg-[#eef5fc] p-1.5 text-primary"><Icon name="sheet" className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-medium break-all text-primary hover:underline">{d.original_name}</a>
                <div className="text-xs text-off">
                  {d.kind} · {size(d.size)} · added {fmtDate(d.created_at)}{d.uploadedBy ? ` by ${d.uploadedBy}` : ''}
                  {!service && !incident && d.linkedTo ? ` · with ${d.linkedTo}` : ''}
                </div>
              </div>
              <a href={`${d.url}?download=1`} className="text-xs font-medium text-primary hover:underline">Download</a>
              <button onClick={() => setRemoving(d)} className="rounded px-1.5 py-1 text-off hover:bg-due-bg hover:text-due" title="Remove file">
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {removing && (
        <ConfirmDialog
          title="Remove this file?"
          message={`Remove ${removing.original_name}? This can't be undone.`}
          confirmLabel="Remove"
          confirming={remove.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove.mutate(removing)}
        />
      )}
    </div>
  )
}
