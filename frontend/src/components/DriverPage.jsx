import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { deleteDriver, deleteDriverFile, fetchDriverFiles, fetchDrivers, uploadDriverFile } from '../api/extra'
import { fetchLinks } from '../api/links'
import { useActions } from '../lib/actions'
import { daysFromToday, fmtDate } from '../lib/formatDate'
import { href, navigate } from '../lib/router'
import { ConfirmDialog } from './ConfirmDialog'
import { LICENCE_CLASSES } from './DriverForm'
import { Button, Card, Empty, Pill } from './ui'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// "expired 12 days ago" / "in 35 days" / "OK", from the server's licence status.
export function LicencePill({ driver }) {
  const days = driver.licenceDaysLeft
  if (driver.licenceStatus === 'expired') return <Pill tone="due">expired {plural(-days, 'day')} ago</Pill>
  if (driver.licenceStatus === 'due_soon') return <Pill tone="warn">{days === 0 ? 'expires today' : `in ${plural(days, 'day')}`}</Pill>
  if (driver.licenceStatus === 'ok') return <Pill tone="ok">OK</Pill>
  return <Pill tone="off">not entered</Pill>
}

// "4 years 7 months" between a date and today (Sydney), or an age in years.
function span(iso, yearsOnly = false) {
  const days = -daysFromToday(iso)
  if (days < 0) return ''
  const months = Math.floor(days / 30.4375)
  const years = Math.floor(months / 12)
  if (yearsOnly) return `${years} years old`
  if (years === 0) return months === 0 ? 'this month' : plural(months, 'month')
  return months % 12 ? `${plural(years, 'year')} ${plural(months % 12, 'month')}` : plural(years, 'year')
}

function Fact({ label, value, sub, tone }) {
  const tones = { due: 'border-[#f3c4c4] bg-due-bg text-due', warn: 'border-[#ecd98a] bg-warn-bg text-warn' }
  return (
    <div className={'rounded-xl border px-4 py-3 ' + (tones[tone] ?? 'border-line bg-white')}>
      <div className={'text-xs ' + (tone ? '' : 'text-off')}>{label}</div>
      <div className={'mt-1 text-[17px] font-semibold tabular-nums ' + (tone ? '' : 'text-ink')}>{value}</div>
      <div className={'text-[11.5px] ' + (tone ? '' : 'text-off')}>{sub}</div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex gap-3 border-b border-[#eef1f5] py-2.5 text-[13px] last:border-0">
      <span className="w-[150px] shrink-0 text-off">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

// Photos or scans of the licence card, kept in Google Drive under Drivers/<name>.
function LicencePhotos({ driver }) {
  const queryClient = useQueryClient()
  const { toast } = useActions()
  const [removing, setRemoving] = useState(null)
  const [broken, setBroken] = useState({})
  const links = useQuery({ queryKey: ['links'], queryFn: fetchLinks, staleTime: Infinity })
  const files = useQuery({ queryKey: ['driver-files', driver.id], queryFn: () => fetchDriverFiles(driver.id) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['driver-files', driver.id] })
  const upload = useMutation({
    mutationFn: (list) => Promise.all(list.map((file) => uploadDriverFile(driver.id, file))),
    onSuccess: () => { refresh(); toast('Licence photo added.') },
    onError: (err) => { refresh(); toast(err?.response?.data?.detail ?? 'Could not add the photo.', true) },
  })
  const remove = useMutation({
    mutationFn: (f) => deleteDriverFile(f.id),
    onSuccess: () => { refresh(); setRemoving(null) },
    onError: (err) => { setRemoving(null); toast(err?.response?.data?.detail ?? 'Could not remove the photo.', true) },
  })
  const saved = files.data ?? []
  const tile = 'group relative h-[110px] w-[170px] overflow-hidden rounded-lg border border-line bg-[#f4f6f9]'
  return (
    <div className="p-4">
      <div className="flex flex-wrap gap-3">
        {saved.map((f) => (
          <div key={f.id} className={tile}>
            <a href={f.url} target="_blank" rel="noopener noreferrer" title={f.original_name} className="block h-full w-full">
              {f.content_type === 'application/pdf' || broken[f.id] ? (
                <span className="flex h-full w-full flex-col items-center justify-center p-2 text-center">
                  <span className="text-[13px] font-bold text-primary">{f.content_type === 'application/pdf' ? 'PDF' : 'Photo'}</span>
                  <span className="line-clamp-2 text-[10px] break-all text-off">{f.original_name}</span>
                </span>
              ) : (
                <img src={f.thumb} alt="" loading="lazy" onError={() => setBroken((b) => ({ ...b, [f.id]: true }))} className="h-full w-full object-cover" />
              )}
            </a>
            <button type="button" title="Remove" onClick={() => setRemoving(f)} className="absolute top-1 right-1 rounded bg-[rgba(0,0,0,.55)] px-1.5 text-[11px] text-white sm:opacity-0 sm:group-hover:opacity-100">✕</button>
          </div>
        ))}
        <label className="flex h-[110px] w-[170px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#c9d3df] bg-white text-center text-xs font-medium text-primary hover:bg-[#f5f8fc]">
          {upload.isPending ? 'Uploading…' : <><span className="text-xl leading-none">+</span>Add photo or scan</>}
          <input
            type="file"
            accept="image/*,.heic,application/pdf"
            multiple
            className="hidden"
            disabled={upload.isPending}
            onChange={(e) => { const list = [...e.target.files]; e.target.value = ''; if (list.length) upload.mutate(list) }}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-off">Front and back of the licence card. A photo from a phone or a PDF scan, up to 20 MB each. Click one to see it full size.</p>
      {links.data?.drive === false && (
        <div className="mt-2 rounded bg-warn-bg px-2 py-1 text-[11px] text-warn">
          Google Drive isn't connected on this server yet, so photos are saved on the server for now. They move to Drive by themselves once it's connected.
        </div>
      )}
      {removing && (
        <ConfirmDialog
          title="Remove this licence photo?"
          message={`Remove ${removing.original_name}? It goes to the Bin in Google Drive.`}
          confirmLabel="Remove"
          confirming={remove.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove.mutate(removing)}
        />
      )}
    </div>
  )
}

export function DriverPage({ id }) {
  const queryClient = useQueryClient()
  const { openForm, toast } = useActions()
  const [removing, setRemoving] = useState(false)
  const drivers = useQuery({ queryKey: ['drivers'], queryFn: fetchDrivers })
  const d = (drivers.data ?? []).find((x) => String(x.id) === String(id))
  const remove = useMutation({
    mutationFn: () => deleteDriver(d.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] })
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      toast('Driver removed.')
      navigate('vans', 'drivers')
    },
    onError: (err) => { setRemoving(false); toast(err?.response?.data?.detail ?? 'Could not remove the driver.', true) },
  })

  const back = <a href={href('vans', 'drivers')} className="mb-3 inline-block text-[13px] font-medium text-primary no-underline hover:underline">‹ All drivers</a>
  if (drivers.isLoading) return <div>{back}<Empty>Loading…</Empty></div>
  if (!d) return <div>{back}<Empty>That driver isn't in the list any more.</Empty></div>

  const tone = { expired: 'due', due_soon: 'warn' }[d.licenceStatus]
  const days = d.licenceDaysLeft
  return (
    <div>
      {back}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-[22px] leading-tight font-semibold text-ink">
            {d.name}
            {d.licenceStatus === 'expired' && <Pill tone="due">Licence expired</Pill>}
            {d.licenceStatus === 'due_soon' && <Pill tone="warn">Licence due soon</Pill>}
            {!d.active && <Pill tone="off">Left</Pill>}
          </h1>
          <div className="mt-0.5 text-[13px] text-off">
            Usual van:{' '}
            {d.vans.length ? d.vans.map((v, i) => <span key={v.id}>{i > 0 && ', '}<a href={href('vans', v.id)} className="text-primary no-underline hover:underline">{v.label}</a></span>) : 'none'}
            {' · '}{d.phone || 'no mobile'}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" icon="trash" onClick={() => setRemoving(true)}>Remove driver</Button>
          <Button variant="primary" icon="edit" onClick={() => openForm('driver', d)}>Edit details</Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Fact
          label="Licence expires"
          tone={tone}
          value={d.licence_expiry ? fmtDate(d.licence_expiry) : 'not entered'}
          sub={!d.licence_expiry ? 'add it in Edit details' : days < 0 ? `expired ${plural(-days, 'day')} ago` : days === 0 ? 'today' : `in ${plural(days, 'day')}`}
        />
        <Fact
          label="Demerit points"
          value={d.demerit_points ?? 'not entered'}
          sub={d.points_checked ? `last checked ${fmtDate(d.points_checked)}` : d.demerit_points === null ? 'typed in by the office' : 'check date not entered'}
        />
        <Fact label="Joined" value={d.date_joined ? fmtDate(d.date_joined) : 'not entered'} sub={d.date_joined ? span(d.date_joined) : ''} />
        <Fact label="Date of birth" value={d.date_of_birth ? fmtDate(d.date_of_birth) : 'not entered'} sub={d.date_of_birth ? span(d.date_of_birth, true) : ''} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title="Licence" description="From the licence card. Change it with Edit details." padded={false}>
          <div className="px-4 py-1">
            <Row label="Licence number">{d.licence_number ? <b className="font-semibold">{d.licence_number}</b> : <span className="text-off">not entered</span>}</Row>
            <Row label="Class">{LICENCE_CLASSES[d.licence_class] ?? <span className="text-off">not entered</span>}</Row>
            <Row label="State">{d.licence_state || <span className="text-off">not entered</span>}</Row>
            <Row label="Expires">{d.licence_expiry ? <>{fmtDate(d.licence_expiry)} <LicencePill driver={d} /></> : <span className="text-off">not entered</span>}</Row>
            <Row label="Notes">{d.notes ? <span className="whitespace-pre-wrap">{d.notes}</span> : <span className="text-off">none</span>}</Row>
          </div>
        </Card>
        <Card title="Licence photos" description={`Kept in Google Drive: Fleet Maintenance Photos › Drivers › ${d.name}`} padded={false}>
          <LicencePhotos driver={d} />
        </Card>
      </div>

      {removing && (
        <ConfirmDialog
          title="Remove driver?"
          message={`Remove ${d.name} and their licence photos? ${d.vans.length ? 'Their van will show no regular driver. ' : ''}If they've just left, you can instead open Edit details and untick "Still driving for us" to keep their record.`}
          confirmLabel="Remove"
          confirming={remove.isPending}
          onCancel={() => setRemoving(false)}
          onConfirm={() => remove.mutate()}
        />
      )}
    </div>
  )
}
