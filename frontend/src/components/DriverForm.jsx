import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createDriver, updateDriver } from '../api/extra'
import { navigate } from '../lib/router'
import { DateInput, Field, FormRow, NumberInput, SectionLabel, TextInput } from './FormFields'

// Same lists as the server (models.LICENCE_CLASS_CHOICES / LICENCE_STATE_CHOICES).
export const LICENCE_CLASSES = {
  C: 'C (car)',
  LR: 'LR (light rigid)',
  MR: 'MR (medium rigid)',
  HR: 'HR (heavy rigid)',
  HC: 'HC (heavy combination)',
  MC: 'MC (multi combination)',
}
const LICENCE_STATES = ['NSW', 'VIC', 'QLD', 'ACT', 'SA', 'WA', 'TAS', 'NT', 'Overseas']

const selectClass = 'w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm focus:outline-none focus:border-primary'
const TEXT = ['name', 'phone', 'licence_number', 'licence_class', 'licence_state', 'notes']
const DATES = ['date_of_birth', 'date_joined', 'licence_expiry', 'points_checked']

function fromDriver(d) {
  const form = { active: d?.active ?? true, demerit_points: d?.demerit_points ?? '' }
  for (const key of [...TEXT, ...DATES]) form[key] = d?.[key] || ''
  return form
}

// The server's message for the first field it refused, e.g. a half-typed year.
function firstError(err) {
  const data = err?.response?.data
  if (!data || typeof data !== 'object') return ''
  const value = data.detail ?? Object.values(data)[0]
  return Array.isArray(value) ? value[0] : value
}

// Add a driver, or edit one: name, date of birth, when they joined, licence
// details and demerit points (typed in by the office; nothing looks them up).
export function DriverForm({ driver, onDone, onSaved, onError }) {
  const isEdit = Boolean(driver?.id)
  const [form, setForm] = useState(() => fromDriver(driver))
  const queryClient = useQueryClient()
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, name: form.name.trim(), demerit_points: form.demerit_points === '' ? null : Number(form.demerit_points) }
      for (const key of DATES) payload[key] = form[key] || null
      return isEdit ? updateDriver(driver.id, payload) : createDriver(payload)
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] })
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      onSaved(isEdit ? 'Driver saved.' : 'Driver added.')
      onDone()
      if (!isEdit) navigate('vans', 'drivers', saved.id) // straight to their page, to add licence photos
    },
    onError: (err) => onError(firstError(err) || 'Could not save the driver.'),
  })

  return (
    <form className="p-6" onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) mutation.mutate() }}>
      <h2 className="mb-4 text-[15px] font-semibold text-ink">{isEdit ? `Edit ${driver.name}` : 'Add a driver'}</h2>

      <SectionLabel>Driver</SectionLabel>
      <FormRow>
        <Field label="Name">
          <TextInput value={form.name} onChange={set('name')} placeholder="Full name" autoFocus={!isEdit} />
        </Field>
        <Field label="Mobile">
          <TextInput value={form.phone} onChange={set('phone')} placeholder="e.g. 0400 000 000" />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Date of birth">
          <DateInput value={form.date_of_birth} onChange={set('date_of_birth')} min="1930-01-01" max="2099-12-31" />
        </Field>
        <Field label="Date joined">
          <DateInput value={form.date_joined} onChange={set('date_joined')} min="1980-01-01" max="2099-12-31" />
        </Field>
      </FormRow>

      <SectionLabel>Licence</SectionLabel>
      <FormRow>
        <Field label="Licence number">
          <TextInput value={form.licence_number} onChange={set('licence_number')} placeholder="From the licence card" />
        </Field>
        <Field label="Licence expires">
          <DateInput value={form.licence_expiry} onChange={set('licence_expiry')} min="2000-01-01" max="2099-12-31" />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Licence class">
          <select value={form.licence_class} onChange={(e) => set('licence_class')(e.target.value)} className={selectClass}>
            <option value="">Select…</option>
            {Object.entries(LICENCE_CLASSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
        <Field label="State">
          <select value={form.licence_state} onChange={(e) => set('licence_state')(e.target.value)} className={selectClass}>
            <option value="">Select…</option>
            {LICENCE_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </FormRow>

      <SectionLabel>Demerit points</SectionLabel>
      <FormRow>
        <Field label="Demerit points now">
          <NumberInput value={form.demerit_points} onChange={set('demerit_points')} min="0" max="30" placeholder="e.g. 0" />
        </Field>
        <Field label="Points checked on">
          <DateInput value={form.points_checked} onChange={set('points_checked')} min="2000-01-01" max="2099-12-31" />
        </Field>
      </FormRow>

      <SectionLabel>Notes</SectionLabel>
      <textarea
        value={form.notes}
        onChange={(e) => set('notes')(e.target.value)}
        rows={2}
        placeholder="Anything worth remembering, e.g. licence conditions"
        className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm focus:border-primary focus:outline-none"
      />
      {isEdit && (
        <label className="mt-3 flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active')(e.target.checked)} />
          Still driving for us
        </label>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-md border border-line bg-white px-4 py-2 text-[13px] font-medium hover:bg-[#f5f5f5]">Cancel</button>
        <button type="submit" disabled={!form.name.trim() || mutation.isPending} className="rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-white hover:bg-primary-dark disabled:opacity-50">
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save' : 'Add driver'}
        </button>
      </div>
    </form>
  )
}
