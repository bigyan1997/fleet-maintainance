import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchVehicles } from '../api/vehicles'
import { createService, updateService } from '../api/services'
import { Field, FormRow, NumberInput, SelectInput, DateInput, TextInput } from './FormFields'
import { SERVICE_STATUSES } from '../lib/serviceStatus'

const SERVICE_TYPES = [
  'Refrigeration unit', 'Scheduled service', 'Tyre rotation', 'Tyre replacement',
  'Brake service', 'Repair / parts', 'Registration', 'Insurance', 'Fuel log',
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function blankForm() {
  return { vehicle: '', service_type: SERVICE_TYPES[0], date: today(), status: 'Booked', odometer: '', cost: '', next_due: '', notes: '' }
}

function fromService(s) {
  return {
    vehicle: s.vehicle, service_type: s.service_type, date: s.date, status: s.status,
    odometer: s.odometer ?? '', cost: s.cost ?? '', next_due: s.next_due || '', notes: s.notes || '',
  }
}

export function ServiceForm({ service, onDone, onSaved, onError }) {
  const isEdit = Boolean(service && service.id)
  const [form, setForm] = useState(() => (isEdit ? fromService(service) : blankForm()))
  const queryClient = useQueryClient()
  const vehiclesQuery = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, odometer: form.odometer || null, cost: form.cost || null }
      return isEdit ? updateService(service.id, payload) : createService(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onSaved(isEdit ? 'Record updated.' : 'Record saved.')
      onDone(isEdit)
    },
    onError: (err) => onError(err?.response?.data?.detail ?? 'Could not save record.'),
  })

  const vehicleOptions = vehiclesQuery.data ?? []

  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <h2 className="mb-4 text-[15px] font-semibold text-ink">{isEdit ? 'Edit service record' : 'Log a service'}</h2>
      <FormRow>
        <Field label="Vehicle">
          <select
            value={form.vehicle}
            onChange={(e) => set('vehicle')(e.target.value ? Number(e.target.value) : '')}
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
          <SelectInput value={form.service_type} onChange={set('service_type')} options={SERVICE_TYPES} />
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
        <Field label="Odometer (km)">
          <NumberInput value={form.odometer} onChange={set('odometer')} placeholder="e.g. 85000" />
        </Field>
        <Field label="Cost ($)">
          <NumberInput value={form.cost} onChange={set('cost')} placeholder="e.g. 250" />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Next due (km or date)">
          <TextInput value={form.next_due} onChange={set('next_due')} placeholder="e.g. 95000 or 2026-06-01" />
        </Field>
        <Field label="Notes / parts replaced">
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
    </div>
  )
}
