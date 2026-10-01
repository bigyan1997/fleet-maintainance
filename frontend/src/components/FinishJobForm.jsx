import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createMechanic, fetchMechanics } from '../api/extra'
import { api } from '../api/client'
import { fetchVehicles } from '../api/vehicles'
import { statusWord } from '../lib/serviceStatus'
import { Field, FormRow, NumberInput, TextInput } from './FormFields'

// Shown whenever a job moves to "Waiting for invoice" or "Done": one small box
// for the km, cost and mechanic, so next due and spending totals come out
// right. Every box is optional; "Just change the status" skips them.
// job = the service record plus targetStatus.
export function FinishJobForm({ job, onDone, onSaved, onError }) {
  const queryClient = useQueryClient()
  const vehicles = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const mechanicsQuery = useQuery({ queryKey: ['mechanics'], queryFn: fetchMechanics })
  const [odometer, setOdometer] = useState(job.odometer ?? '')
  const [cost, setCost] = useState(job.cost && Number(job.cost) ? job.cost : '')
  const [mechanic, setMechanic] = useState(job.mechanic ?? '')
  const [newMechanic, setNewMechanic] = useState(null)
  const van = (vehicles.data ?? []).find((v) => v.id === job.vehicle)
  const interval = van?.service_interval_km || 10000
  const done = job.targetStatus === 'Invoiced'
  const mechanics = (mechanicsQuery.data ?? []).filter((m) => m.active || m.id === mechanic)

  const save = useMutation({
    mutationFn: async (withDetails) => {
      const payload = { status: job.targetStatus }
      if (withDetails) {
        const mechanicId = newMechanic?.trim() ? (await createMechanic({ name: newMechanic.trim() })).id : mechanic || null
        Object.assign(payload, { odometer: odometer || null, cost: cost || null, mechanic: mechanicId })
      }
      return (await api.patch(`/services/${job.id}/`, payload)).data
    },
    onSuccess: (saved) => {
      for (const key of ['services', 'dashboard', 'vehicles', 'alerts', 'mechanics', 'analytics']) queryClient.invalidateQueries({ queryKey: [key] })
      onSaved(`${saved.vehicleLabel}: ${statusWord(saved.status).toLowerCase()}${saved.next_due ? ` · next service due at ${Number(saved.next_due).toLocaleString()} km` : ''}.`)
      onDone()
    },
    onError: () => onError('Could not save the job.'),
  })

  return (
    <div className="p-6">
      <h2 className="text-[15px] font-semibold text-ink">
        {done ? 'Mark as done' : 'Work finished, waiting for the invoice'}
      </h2>
      <p className="mb-4 text-[13px] text-off">
        <b className="text-ink">{job.vehicleLabel}</b> · {job.service_type} · {van?.subtitle}
      </p>
      <FormRow>
        <Field label="Odometer when serviced (km)">
          <NumberInput value={odometer} onChange={setOdometer} placeholder={van?.odometer ? `now ${van.odometer.toLocaleString()}` : 'e.g. 85000'} autoFocus />
        </Field>
        <Field label={done ? 'Cost from the invoice ($)' : 'Cost, if you know it ($)'}>
          <NumberInput value={cost} onChange={setCost} placeholder="e.g. 285" />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Mechanic">
          <select
            value={newMechanic !== null ? '__new' : mechanic}
            onChange={(e) => {
              if (e.target.value === '__new') setNewMechanic('')
              else { setNewMechanic(null); setMechanic(e.target.value ? Number(e.target.value) : '') }
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
            <TextInput value={newMechanic} onChange={setNewMechanic} placeholder="e.g. Canterbury Toyota" />
          </Field>
        ) : <div />}
      </FormRow>
      {job.service_type === 'Scheduled service' && odometer && (
        <div className="mb-4 rounded-md bg-[#e8f1fb] px-3 py-2 text-[13px] text-primary">
          Next service will be due at <b>{(Number(odometer) + interval).toLocaleString()} km</b> ({Number(odometer).toLocaleString()} + {interval.toLocaleString()} km)
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => save.mutate(true)}
          disabled={save.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : done ? 'Save and mark done' : 'Save'}
        </button>
        <button onClick={() => save.mutate(false)} disabled={save.isPending} className="text-[13px] font-medium text-primary hover:underline">
          Just change the status
        </button>
        <button onClick={onDone} className="ml-auto rounded-md border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-[#f5f5f5]">
          Cancel
        </button>
      </div>
    </div>
  )
}
