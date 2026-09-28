import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchVehicles } from '../api/vehicles'
import { createFuelLog, updateFuelLog } from '../api/fuelLogs'
import { Field, FormRow, NumberInput, DateInput, TextInput } from './FormFields'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function blankForm() {
  return { vehicle: '', date: today(), litres: '', cost: '', odometer: '', invoice_number: '', notes: '' }
}

function fromFuel(f) {
  return {
    vehicle: f.vehicle, date: f.date, litres: f.litres ?? '', cost: f.cost ?? '',
    odometer: f.odometer ?? '', invoice_number: f.invoice_number || '', notes: f.notes || '',
  }
}

export function FuelForm({ fuel, onDone, onSaved, onError }) {
  const isEdit = Boolean(fuel && fuel.id)
  const [form, setForm] = useState(() => (isEdit ? fromFuel(fuel) : blankForm()))
  const queryClient = useQueryClient()
  const vehiclesQuery = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, litres: form.litres || 0, cost: form.cost || 0, odometer: form.odometer || null }
      return isEdit ? updateFuelLog(fuel.id, payload) : createFuelLog(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel-logs'] })
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      onSaved(isEdit ? 'Fuel record updated.' : 'Fuel record saved.')
      onDone()
    },
    onError: (err) => onError(err?.response?.data?.detail ?? 'Could not save fuel record.'),
  })

  const litresNum = parseFloat(form.litres) || 0
  const costNum = parseFloat(form.cost) || 0
  const pricePerLitre = litresNum > 0 && costNum > 0 ? (costNum / litresNum).toFixed(3) : null
  const vehicleOptions = vehiclesQuery.data ?? []

  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <h2 className="mb-4 text-[15px] font-semibold text-ink">{isEdit ? 'Edit fuel record' : 'Log a fuel fill-up'}</h2>
      <FormRow>
        <Field label="Vehicle">
          <select value={form.vehicle} onChange={(e) => set('vehicle')(e.target.value ? Number(e.target.value) : '')} className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm">
            <option value="">Select vehicle…</option>
            {vehicleOptions.map((v) => <option key={v.id} value={v.id}>{v.label} ({v.rego})</option>)}
          </select>
        </Field>
        <Field label="Date">
          <DateInput value={form.date} onChange={set('date')} />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Litres">
          <NumberInput value={form.litres} onChange={set('litres')} step="0.01" placeholder="e.g. 65.4" />
        </Field>
        <Field label="Cost ($)">
          <NumberInput value={form.cost} onChange={set('cost')} step="0.01" placeholder="e.g. 110.50" />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Odometer (km)">
          <NumberInput value={form.odometer} onChange={set('odometer')} placeholder="e.g. 87500" />
        </Field>
        <Field label="Invoice / receipt #">
          <TextInput value={form.invoice_number} onChange={set('invoice_number')} placeholder="e.g. INV-10293" />
        </Field>
      </FormRow>
      <div className="mb-3">
        <Field label="Price per litre">
          <div className="py-2 text-[13px] text-off">{pricePerLitre ? `$${pricePerLitre}` : '—'}</div>
        </Field>
      </div>
      <div className="mb-4">
        <Field label="Notes">
          <TextInput value={form.notes} onChange={set('notes')} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !form.vehicle}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Save fuel record'}
        </button>
        <button onClick={onDone} className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-[#f5f5f5]">
          Cancel
        </button>
      </div>
    </div>
  )
}
