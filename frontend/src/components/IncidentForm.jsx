import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todayIso } from '../lib/formatDate'
import { useState } from 'react'
import { fetchVehicles } from '../api/vehicles'
import { createIncident, updateIncident } from '../api/incidents'
import { uploadAttachment } from '../api/extra'
import { ISSUE_PHOTO, IssuePhotos } from './IssuePhotos'
import { Field, FormRow, NumberInput, SelectInput, DateInput, TextInput } from './FormFields'
import { IncidentLog } from './IncidentLog'

const TYPES = ['Accident', 'Breakdown', 'Damage', 'Other']
const SEVERITIES = ['Minor', 'Moderate', 'Major']
const STATUSES = ['Open', 'In progress', 'Resolved']

// Sydney's date, not UTC (UTC is still yesterday before ~10-11 am here).
const today = todayIso

function blankForm() {
  return {
    vehicle: '', incident_type: TYPES[0], date: today(), severity: SEVERITIES[0], location: '', status: STATUSES[0],
    cost: '', description: '', new_update: '', resolution: '', resolved_date: '',
  }
}

function fromIncident(x) {
  return {
    vehicle: x.vehicle, incident_type: x.incident_type, date: x.date, severity: x.severity,
    location: x.location || '', status: x.status, cost: x.cost ?? '', description: x.description || '',
    new_update: '', resolution: x.resolution || '', resolved_date: x.resolved_date || '',
  }
}

export function IncidentForm({ incident, onDone, onSaved, onError }) {
  const isEdit = Boolean(incident && incident.id)
  const [form, setForm] = useState(() => (isEdit ? fromIncident(incident) : { ...blankForm(), ...(incident ?? {}) }))
  const queryClient = useQueryClient()
  const vehiclesQuery = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))
  // Damage photos picked on a new incident, uploaded once it's saved.
  const [pendingPhotos, setPendingPhotos] = useState([])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, cost: form.cost || null, resolved_date: form.resolved_date || null }
      if (isEdit) return updateIncident(incident.id, payload)
      const saved = await createIncident(payload)
      await Promise.all(pendingPhotos.map((file) => uploadAttachment({ file, kind: ISSUE_PHOTO, vehicle: saved.vehicle, incident: saved.id })))
      return saved
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments'] })
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onSaved(isEdit ? 'Incident updated.' : 'Incident logged.')
      onDone(true)
    },
    onError: (err) => {
      const data = err?.response?.data
      onError(data?.detail ?? data?.resolution?.[0] ?? 'Could not save incident.')
    },
  })

  const vehicleOptions = vehiclesQuery.data ?? []
  const resolved = form.status === 'Resolved'
  const setStatus = (status) =>
    setForm((f) => ({ ...f, status, resolved_date: status === 'Resolved' ? f.resolved_date || today() : '' }))

  return (
    <div className="p-6">
      <h2 className="mb-4 text-[15px] font-semibold text-ink">{isEdit ? 'Edit incident' : 'Log an incident'}</h2>
      <FormRow>
        <Field label="Vehicle">
          <select value={form.vehicle} onChange={(e) => set('vehicle')(e.target.value ? Number(e.target.value) : '')} className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm">
            <option value="">Select vehicle…</option>
            {vehicleOptions.map((v) => <option key={v.id} value={v.id}>{v.label} ({v.rego})</option>)}
          </select>
        </Field>
        <Field label="Type">
          <SelectInput value={form.incident_type} onChange={set('incident_type')} options={TYPES} />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Date">
          <DateInput value={form.date} onChange={set('date')} />
        </Field>
        <Field label="Severity">
          <SelectInput value={form.severity} onChange={set('severity')} options={SEVERITIES} />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Location">
          <TextInput value={form.location} onChange={set('location')} placeholder="e.g. Highway 1, near Depot" />
        </Field>
        <Field label="Status">
          <SelectInput value={form.status} onChange={setStatus} options={STATUSES} />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Cost ($)">
          <NumberInput value={form.cost} onChange={set('cost')} placeholder="e.g. 850" />
        </Field>
        <div />
      </FormRow>
      <div className="mb-3">
        <Field label="Description">
          <TextInput value={form.description} onChange={set('description')} placeholder="What happened" />
        </Field>
        <IssuePhotos
          incident={isEdit ? incident.id : null}
          vehicle={form.vehicle}
          label="Photos of the damage"
          pending={pendingPhotos}
          onPendingChange={setPendingPhotos}
        />
      </div>
      <div className="mb-4 border-t border-line pt-4">
        <div className="mb-2 text-[13px] font-semibold text-ink">Updates</div>
        {isEdit && (
          <div className="mb-3">
            <IncidentLog updates={incident.updates} />
          </div>
        )}
        <Field label={isEdit ? 'Add an update (saved with the date and your name)' : 'First update (optional)'}>
          <textarea
            value={form.new_update}
            onChange={(e) => set('new_update')(e.target.value)}
            rows={2}
            placeholder="e.g. Quote received $420, booked for Thursday"
            className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm"
          />
        </Field>
      </div>
      {resolved && (
        <div className="mb-4 rounded-md border border-[#a7e3bc] bg-ok-bg/40 p-3">
          <FormRow>
            <Field label="Resolution: what was done *">
              <textarea
                value={form.resolution}
                onChange={(e) => set('resolution')(e.target.value)}
                rows={2}
                placeholder="e.g. Rear window replaced by SAM Mobile Glass, $420, paid"
                className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm"
              />
            </Field>
            <Field label="Resolved date">
              <DateInput value={form.resolved_date} onChange={set('resolved_date')} />
            </Field>
          </FormRow>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !form.vehicle || (resolved && !form.resolution.trim())}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Save incident'}
        </button>
        <button onClick={() => onDone(isEdit)} className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-[#f5f5f5]">
          Cancel
        </button>
      </div>
    </div>
  )
}
