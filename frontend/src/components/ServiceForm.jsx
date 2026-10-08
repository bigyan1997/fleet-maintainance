import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todayIso } from '../lib/formatDate'
import { useState } from 'react'
import { createMechanic, fetchMechanics, uploadAttachment } from '../api/extra'
import { fetchVehicles } from '../api/vehicles'
import { createService, updateService } from '../api/services'
import { Documents } from './Documents'
import { ISSUE_PHOTO, IssuePhotos } from './IssuePhotos'
import { Field, FormRow, NumberInput, SelectInput, DateInput, TextInput } from './FormFields'
import { SERVICE_STATUSES, statusWord } from '../lib/serviceStatus'

const SERVICE_TYPES = [
  'Refrigeration unit', 'Scheduled service', 'Tyre rotation', 'Tyre replacement',
  'Brake service', 'Repair / parts', 'Registration', 'Fuel log',
]

// Sydney's date, not UTC (UTC is still yesterday before ~10-11 am here).
const today = todayIso

function blankForm() {
  return { vehicle: '', service_type: SERVICE_TYPES[0], date: today(), status: 'Booked', issues: '', odometer: '', cost: '', next_due: '', notes: '', mechanic: '' }
}

function fromService(s) {
  return {
    vehicle: s.vehicle, service_type: s.service_type, date: s.date, status: s.status, issues: s.issues || '',
    odometer: s.odometer ?? '', cost: s.cost ?? '', next_due: s.next_due || '', notes: s.notes || '',
    mechanic: s.mechanic ?? '',
  }
}

export function ServiceForm({ service, onDone, onSaved, onError }) {
  const isEdit = Boolean(service && service.id)
  const [form, setForm] = useState(() => (isEdit ? fromService(service) : { ...blankForm(), ...(service ?? {}) }))
  const queryClient = useQueryClient()
  const vehiclesQuery = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))
  const vehicleOptions = vehiclesQuery.data ?? []
  const mechanicsQuery = useQuery({ queryKey: ['mechanics'], queryFn: fetchMechanics })
  const mechanics = (mechanicsQuery.data ?? []).filter((m) => m.active || m.id === form.mechanic)
  const [newMechanic, setNewMechanic] = useState(null) // text while adding a new one, else null
  // Issues, work done and a hand-typed next due live under "+ More"; it opens
  // by itself when the record already has any of them, so nothing is hidden.
  const [showMore, setShowMore] = useState(() => Boolean(service?.issues || service?.notes))
  // Issue photos picked on a new record, uploaded once it's saved.
  const [pendingPhotos, setPendingPhotos] = useState([])

  // "Next due" for a scheduled service = odometer + the van's service
  // interval (usually 10,000 km). It follows the odometer as you type, also
  // when finishing a booked job, unless someone typed their own value: a
  // figure that isn't odometer + interval is never overwritten.
  const [nextDueTyped, setNextDueTyped] = useState(false)
  const autoNextDue = (f) => {
    const interval = vehicleOptions.find((v) => v.id === f.vehicle)?.service_interval_km || 10000
    return f.service_type === 'Scheduled service' && f.odometer ? String(Number(f.odometer) + interval) : ''
  }
  const setWithNextDue = (key) => (value) =>
    setForm((f) => {
      const next = { ...f, [key]: value }
      const wasAuto = !f.next_due || String(f.next_due) === autoNextDue(f)
      return nextDueTyped || !wasAuto ? next : { ...next, next_due: autoNextDue(next) }
    })
  const setNextDue = (value) => {
    setNextDueTyped(value !== '')
    setForm((f) => ({ ...f, next_due: value }))
  }
  const nextDueIsAuto = Boolean(form.next_due) && String(form.next_due) === autoNextDue(form)

  const mutation = useMutation({
    mutationFn: async () => {
      // A newly typed mechanic is created first (or matched, if the name already exists).
      const mechanic = newMechanic?.trim() ? (await createMechanic({ name: newMechanic.trim() })).id : form.mechanic || null
      const payload = { ...form, mechanic, odometer: form.odometer || null, cost: form.cost || null }
      if (isEdit) return updateService(service.id, payload)
      const saved = await createService(payload)
      await Promise.all(pendingPhotos.map((file) => uploadAttachment({ file, kind: ISSUE_PHOTO, vehicle: saved.vehicle, service: saved.id })))
      return saved
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mechanics'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['attachments'] })
      onSaved(isEdit ? 'Record updated.' : 'Record saved.')
      onDone(isEdit)
    },
    onError: (err) => onError(err?.response?.data?.detail ?? 'Could not save record.'),
  })

  return (
    <div className="p-6">
      <h2 className="mb-4 text-[15px] font-semibold text-ink">{isEdit ? 'Edit service record' : 'Log a service'}</h2>
      <FormRow>
        <Field label="Van">
          <select
            value={form.vehicle}
            onChange={(e) => setWithNextDue('vehicle')(e.target.value ? Number(e.target.value) : '')}
            className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm"
          >
            <option value="">Select van…</option>
            {vehicleOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} · {v.subtitle}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What">
          <SelectInput value={form.service_type} onChange={setWithNextDue('service_type')} options={form.service_type === 'Insurance' ? [...SERVICE_TYPES, 'Insurance'] : SERVICE_TYPES} />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Date">
          <DateInput value={form.date} onChange={set('date')} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => set('status')(e.target.value)} className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm">
            {SERVICE_STATUSES.map((st) => <option key={st} value={st}>{statusWord(st)}</option>)}
          </select>
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Mechanic">
          <select
            value={newMechanic !== null ? '__new' : form.mechanic}
            onChange={(e) => {
              if (e.target.value === '__new') {
                setNewMechanic('')
              } else {
                setNewMechanic(null)
                set('mechanic')(e.target.value ? Number(e.target.value) : '')
              }
            }}
            className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm"
          >
            <option value="">Not set</option>
            {mechanics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            <option value="__new">+ Add new mechanic…</option>
          </select>
        </Field>
        <Field label="Odometer (km)">
          <NumberInput value={form.odometer} onChange={setWithNextDue('odometer')} placeholder="e.g. 85000" />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Cost ($)">
          <NumberInput value={form.cost} onChange={set('cost')} placeholder="e.g. 250" />
        </Field>
        {newMechanic !== null ? (
          <Field label="New mechanic's name">
            <TextInput value={newMechanic} onChange={setNewMechanic} placeholder="e.g. Canterbury Toyota" autoFocus />
          </Field>
        ) : (
          <div />
        )}
      </FormRow>

      {form.next_due && (
        <div className="mb-3 rounded-md bg-[#e8f1fb] px-3 py-2 text-[13px] text-primary">
          {nextDueIsAuto ? (
            <>Next service will be due at <b>{Number(form.next_due).toLocaleString()} km</b> ({Number(form.odometer).toLocaleString()} + {(vehicleOptions.find((v) => v.id === form.vehicle)?.service_interval_km || 10000).toLocaleString()} km)</>
          ) : (
            <>Next due: <b>{/^\d+$/.test(form.next_due) ? `${Number(form.next_due).toLocaleString()} km` : form.next_due}</b> (typed by hand)</>
          )}
        </div>
      )}

      {!showMore ? (
        <button onClick={() => setShowMore(true)} className="mb-4 text-[13px] font-medium text-primary hover:underline">
          + More: issues for the mechanic (with photos) · work done · change next due
        </button>
      ) : (
        <div className="mb-4 rounded-md border border-line bg-[#fafafa] p-3">
          <div className="mb-3">
            <Field label="Issues for the mechanic (what's wrong / needs checking)">
              <textarea
                value={form.issues}
                onChange={(e) => set('issues')(e.target.value)}
                rows={3}
                placeholder="e.g. Front left headlight out, brakes squealing, tyre pressure warning on"
                className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm"
              />
            </Field>
            <IssuePhotos
              service={isEdit ? service.id : null}
              vehicle={form.vehicle}
              pending={pendingPhotos}
              onPendingChange={setPendingPhotos}
            />
          </div>
          <FormRow>
            <Field label="Work done / parts replaced">
              <TextInput value={form.notes} onChange={set('notes')} />
            </Field>
            <Field label="Next due (km or date)">
              <TextInput value={form.next_due} onChange={setNextDue} placeholder="filled in for you from the odometer" />
            </Field>
          </FormRow>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !form.vehicle}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Save record'}
        </button>
        <button onClick={() => onDone(isEdit)} className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-[#f5f5f5]">
          Cancel
        </button>
      </div>
      {isEdit && (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="mb-1 text-[14px] font-semibold text-ink">Files</h3>
          <p className="mb-3 text-xs text-off">Invoice, quote or photos for this job.</p>
          <Documents service={service.id} vehicle={service.vehicle} compact />
        </div>
      )}
    </div>
  )
}
