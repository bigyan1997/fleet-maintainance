import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { deleteAttachment, fetchAttachments, uploadAttachment } from '../api/extra'
import { useActions } from '../lib/actions'
import { ConfirmDialog } from './ConfirmDialog'

export const ISSUE_PHOTO = 'Issue photo'

// A thumbnail that falls back to a plain tile when the browser can't show
// the picture (e.g. an iPhone HEIC opened on Windows).
function Thumb({ src, name }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-[#eef5fc] p-1 text-center">
        <span className="text-[12px] font-bold text-primary">Photo</span>
        <span className="line-clamp-2 break-all text-[9px] text-off">{name}</span>
      </div>
    )
  }
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
}

// Photos of what's wrong: a service's issues or an incident's damage, kept
// in that job's Google Drive folder. On a saved job they upload straight
// away; on a new one they wait in `pending` and the form uploads them once
// the record exists.
export function IssuePhotos({ service, incident, vehicle, label = 'Photos of the problem', pending = [], onPendingChange }) {
  const job = service || incident
  const filters = service ? { service } : { incident }
  const queryClient = useQueryClient()
  const { toast } = useActions()
  const [removing, setRemoving] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const photos = useQuery({
    queryKey: ['attachments', filters],
    queryFn: () => fetchAttachments(filters),
    enabled: Boolean(job),
  })
  const saved = (photos.data ?? []).filter((d) => d.kind === ISSUE_PHOTO)
  const folderUrl = saved.find((d) => d.driveFolderUrl)?.driveFolderUrl

  // Previews for photos picked before the record is saved.
  const [previews, setPreviews] = useState([])
  useEffect(() => {
    const urls = pending.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [pending])

  const upload = useMutation({
    mutationFn: (files) => Promise.all(files.map((file) => uploadAttachment({ file, kind: ISSUE_PHOTO, vehicle, service, incident }))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attachments'] }),
    onError: (err) => toast(err?.response?.data?.detail ?? 'Could not add the photo.', true),
  })
  const remove = useMutation({
    mutationFn: (d) => deleteAttachment(d.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments'] })
      setRemoving(null)
    },
  })

  const add = (fileList) => {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/') || /\.heic$/i.test(f.name))
    if (!files.length) return
    if (job) upload.mutate(files)
    else onPendingChange?.([...pending, ...files])
  }

  const tile = 'group relative h-20 w-20 overflow-hidden rounded-md border border-line bg-white'
  const xButton = 'absolute top-0.5 right-0.5 rounded bg-[rgba(0,0,0,.55)] px-1 text-[11px] text-white sm:opacity-0 sm:group-hover:opacity-100'
  return (
    <div className="mt-2">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-off">
        <span>{label}{job ? ` (${saved.length})` : ''} · tap a photo to see it full size</span>
        {folderUrl && (
          <a href={folderUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">Open in Google Drive ↗</a>
        )}
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); add(e.dataTransfer.files) }}
        className={'flex flex-wrap gap-2 rounded-md p-1 -m-1' + (dragOver ? ' bg-[#e8f1fb] outline-2 outline-dashed outline-primary' : '')}
      >
        {saved.map((d) => (
          <div key={d.id} className={tile}>
            <a href={d.url} target="_blank" rel="noopener noreferrer" title={d.original_name}>
              <Thumb src={d.thumb || d.url} name={d.original_name} />
            </a>
            <button type="button" title="Remove photo" onClick={() => setRemoving(d)} className={xButton}>✕</button>
          </div>
        ))}
        {pending.map((f, i) => (
          <div key={i} className={tile}>
            {previews[i] && <Thumb src={previews[i]} name={f.name} />}
            <button type="button" title="Remove photo" onClick={() => onPendingChange(pending.filter((_, j) => j !== i))} className={xButton}>✕</button>
          </div>
        ))}
        <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[#c9d3df] bg-white text-center text-[11px] text-off hover:bg-[#f5f8fc]">
          {upload.isPending ? 'Uploading…' : <><span className="text-lg leading-none">+</span>Add photo</>}
          <input
            type="file"
            accept="image/*,.heic"
            multiple
            className="hidden"
            disabled={upload.isPending}
            onChange={(e) => { add(e.target.files); e.target.value = '' }}
          />
        </label>
      </div>
      {!job && pending.length > 0 && <div className="mt-1 text-[11px] text-off">Photos are uploaded when you save.</div>}
      {removing && (
        <ConfirmDialog
          title="Remove this photo?"
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

// Read-only thumbnails for a service's or incident's details popup.
export function IssuePhotoStrip({ service, incident, label = 'Photos of the problem' }) {
  const filters = service ? { service } : { incident }
  const photos = useQuery({ queryKey: ['attachments', filters], queryFn: () => fetchAttachments(filters) })
  const folderUrl = (photos.data ?? []).find((d) => d.driveFolderUrl)?.driveFolderUrl
  const saved = (photos.data ?? []).filter((d) => d.kind === ISSUE_PHOTO)
  if (!saved.length) return null
  return (
    <div className="mb-4">
      <div className="mb-1 flex items-baseline justify-between text-[13px] text-off">
        <span>{label}</span>
        {folderUrl && <a href={folderUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline">Open in Google Drive ↗</a>}
      </div>
      <div className="flex flex-wrap gap-2">
        {saved.map((d) => (
          <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" title={d.original_name} className="h-16 w-16 overflow-hidden rounded-md border border-line">
            <Thumb src={d.thumb || d.url} name={d.original_name} />
          </a>
        ))}
      </div>
    </div>
  )
}
