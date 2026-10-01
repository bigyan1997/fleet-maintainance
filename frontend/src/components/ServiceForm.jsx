import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createMechanic, fetchMechanics } from '../api/extra'
import { fetchVehicles } from '../api/vehicles'
import { createService, updateService } from '../api/services'
import { Documents } from './Documents'
import { Field, FormRow, NumberInput, SelectInput, DateInput, TextInput } from './FormFields'
import { SERVICE_STATUSES } from '../lib/serviceStatus'

const SERVICE_TYPES = [
  'Refrigeration unit', 'Scheduled service', 'Tyre rotation', 'Tyre replacement',
  'Brake service', 'Repair / parts', 'Registration', 'Insurance', 'Fuel log', 'Van wash',
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

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
      return isEdit ? updateService(service.id, payload) : createService(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mechanics'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onSaved(isEdit ? 'Record updated.' : 'Record saved.')
      onDone(isEdit)
    },
    onError: (err) => onError(err?.response?.data?.detail ?? 'Could not save record.'),
  })

  return (
    <div className="p-6">
      <h2 className="mb-4 text-[15px] font-semibold text-ink">{isEdit ? 'Edit service record' : 'Log a service'}</h2>
      <FormRow>
        <Field label="Vehicle">
          <select
            value={form.vehicle}
            onChange={(e) => setWithNextDue('vehicle')(e.target.value ? Number(e.target.value) : '')}
            className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm"
          >
            <option value="">Select vehicle…</option>
            {vehicleOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} ({v.rego})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Service type">
          <SelectInput value={form.service_type} onChange={setWithNextDue('service_type')} options={SERVICE_TYPES} />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Date">
          <DateInput value={form.date} onChange={set('date')} />
        </Field>
        <Field label="Status">
          <SelectInput value={form.status} onChange={set('status')} options={SERVICE_STATUSES} />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Mechanic / workshop">
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
        {newMechanic !== null ? (
          <Field label="New mechanic's name">
            <TextInput value={newMechanic} onChange={setNewMechanic} placeholder="e.g. Canterbury Toyota" autoFocus />
          </Field>
        ) : (
          <div className="self-end pb-2 text-xs text-off">Who did (or will do) the work. Manage the list on Services → Mechanics.</div>
        )}
      </FormRow>
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
      </div>
      <FormRow>
        <Field label="Odometer (km)">
          <NumberInput value={form.odometer} onChange={setWithNextDue('odometer')} placeholder="e.g. 85000" />
        </Field>
        <Field label="Cost ($)">
          <NumberInput value={form.cost} onChange={set('cost')} placeholder="e.g. 250" />
        </Field>
      </FormRow>
      <FormRow>
        <Field label={nextDueIsAuto ? `Next due — auto: odometer + ${(vehicleOptions.find((v) => v.id === form.vehicle)?.service_interval_km || 10000).toLocaleString()} km` : 'Next due (km or date)'}>
          <TextInput value={form.next_due} onChange={setNextDue} placeholder="e.g. 95000 or 01-06-2026" />
        </Field>
        <Field label="Work done / parts replaced">
          <TextInput value={form.notes} onChange={set('notes')} />
        </Field>
      </FormRow>
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
