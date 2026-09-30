import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createVehicle, updateVehicle } from '../api/vehicles'
import { Field, FormRow, NumberInput, SectionLabel, SelectInput, DateInput, TextInput } from './FormFields'

const FUEL_TYPES = [
  'Unleaded 91', 'Unleaded 95', 'Unleaded 98', 'Diesel', 'Premium diesel', 'LPG', 'Electric', 'Hybrid',
]

function blankForm() {
  return {
    make: '', model: '', year: '', rego: '', vin: '', vehicle_number: '',
    fuel_card_number: '', fuel_type: '', odometer: '', rego_expiry: '', insurance_expiry: '',
    service_interval_km: '', tyre_interval_km: '', wash_needed: true,
  }
}

function fromVehicle(v) {
  return {
    make: v.make || '', model: v.model || '', year: v.year ?? '', rego: v.rego || '',
    vin: v.vin || '', vehicle_number: v.vehicle_number || '', fuel_card_number: v.fuel_card_number || '',
    fuel_type: v.fuel_type || '', odometer: v.odometer ?? '', rego_expiry: v.rego_expiry || '',
    insurance_expiry: v.insurance_expiry || '', service_interval_km: v.service_interval_km ?? '',
    tyre_interval_km: v.tyre_interval_km ?? '', wash_needed: v.wash_needed ?? true,
  }
}

export function VehicleForm({ vehicle, onDone, onSaved, onError }) {
  const isEdit = Boolean(vehicle && vehicle.id)
  const [form, setForm] = useState(() => (isEdit ? fromVehicle(vehicle) : blankForm()))
  const queryClient = useQueryClient()
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        year: form.year || null,
        odometer: form.odometer || 0,
        service_interval_km: form.service_interval_km || 10000,
        tyre_interval_km: form.tyre_interval_km || null,
        rego_expiry: form.rego_expiry || null,
        insurance_expiry: form.insurance_expiry || null,
      }
      return isEdit ? updateVehicle(vehicle.id, payload) : createVehicle(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      onSaved(isEdit ? 'Vehicle updated.' : 'Vehicle added.')
      onDone()
    },
    onError: (err) => {
      onError(err?.response?.data?.detail ?? 'Could not save vehicle.')
    },
  })

  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <h2 className="mb-4 text-[15px] font-semibold text-ink">{isEdit ? 'Edit vehicle' : 'Add a vehicle'}</h2>

      <SectionLabel>Vehicle details</SectionLabel>
      <FormRow>
        <Field label="Make">
          <TextInput value={form.make} onChange={set('make')} placeholder="e.g. Toyota" />
        </Field>
        <Field label="Model">
          <TextInput value={form.model} onChange={set('model')} placeholder="e.g. HiLux" />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Year">
          <NumberInput value={form.year} onChange={set('year')} placeholder="e.g. 2020" />
        </Field>
        <Field label="Rego / plate">
          <TextInput value={form.rego} onChange={set('rego')} placeholder="e.g. ABC123" />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="VIN">
          <TextInput value={form.vin} onChange={(v) => set('vin')(v.toUpperCase())} maxLength={17} className="font-mono" placeholder="17-character VIN" />
        </Field>
        <Field label="Vehicle number">
          <TextInput value={form.vehicle_number} onChange={set('vehicle_number')} placeholder="e.g. FLEET-007" />
        </Field>
      </FormRow>

      <SectionLabel>Fuel</SectionLabel>
      <FormRow>
        <Field label="Fuel card number">
          <TextInput value={form.fuel_card_number} onChange={set('fuel_card_number')} placeholder="e.g. 7002 1234 5678" />
        </Field>
        <Field label="Fuel type">
          <SelectInput value={form.fuel_type} onChange={set('fuel_type')} options={FUEL_TYPES} placeholder="Select…" />
        </Field>
      </FormRow>

      <SectionLabel>Registration &amp; service</SectionLabel>
      <FormRow>
        <Field label="Odometer (km)">
          <NumberInput value={form.odometer} onChange={set('odometer')} placeholder="e.g. 75000" />
        </Field>
        <Field label="Rego expiry">
          <DateInput value={form.rego_expiry} onChange={set('rego_expiry')} />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Insurance expiry">
          <DateInput value={form.insurance_expiry} onChange={set('insurance_expiry')} />
        </Field>
        <Field label="Service interval (km)">
          <NumberInput value={form.service_interval_km} onChange={set('service_interval_km')} placeholder="e.g. 10000" />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Tyre replacement interval (km)">
          <NumberInput value={form.tyre_interval_km} onChange={set('tyre_interval_km')} placeholder="e.g. 40000" />
        </Field>
        <Field label="Washing">
          <select
            value={form.wash_needed ? 'yes' : 'no'}
            onChange={(e) => set('wash_needed')(e.target.value === 'yes')}
            className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm"
          >
            <option value="yes">Needed — track washes</option>
            <option value="no">No need — driver takes it home</option>
          </select>
        </Field>
      </FormRow>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !form.make || !form.model}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add vehicle'}
        </button>
        <button onClick={onDone} className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-[#f5f5f5]">
          Cancel
        </button>
      </div>
    </div>
  )
}
