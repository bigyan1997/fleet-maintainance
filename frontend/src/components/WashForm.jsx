import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createService } from '../api/services'
import { fetchVehicles } from '../api/vehicles'
import { DateInput, Field, FormRow } from './FormFields'

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Log a van wash. Washes are service records of type "Van wash", saved as
// Invoiced straight away (done in-house, nothing to wait for) — same as the
// Washes tab's "Washed today" button.
export function WashForm({ wash, onDone, onSaved, onError }) {
  const [vehicle, setVehicle] = useState(wash?.vehicle ?? '')
  const [date, setDate] = useState(today())
  const queryClient = useQueryClient()
  const vehiclesQuery = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })

  const mutation = useMutation({
    mutationFn: () => createService({ vehicle, service_type: 'Van wash', date, status: 'Invoiced' }),
    onSuccess: () => {
      for (const key of ['washes', 'services', 'vehicles']) queryClient.invalidateQueries({ queryKey: [key] })
      onSaved('Wash logged.')
      onDone()
    },
    onError: () => onError('Could not log the wash.'),
  })

  return (
    <div className="p-6">
      <h2 className="mb-4 text-[15px] font-semibold text-ink">Log a van wash</h2>
      <FormRow>
        <Field label="Vehicle">
          <select
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value ? Number(e.target.value) : '')}
            className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm"
          >
            <option value="">Select vehicle…</option>
            {(vehiclesQuery.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>{v.label} ({v.rego})</option>
            ))}
          </select>
        </Field>
        <Field label="Date washed">
          <DateInput value={date} onChange={setDate} max={today()} />
        </Field>
      </FormRow>
      <div className="flex items-center gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !vehicle || !date || date > today()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : 'Log wash'}
        </button>
        <button onClick={onDone} className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-[#f5f5f5]">
          Cancel
        </button>
      </div>
    </div>
  )
}
