import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setServiceStatus } from '../api/services'
import { useActions } from '../lib/actions'
import { SERVICE_STATUSES, STATUS_STYLES, statusWord } from '../lib/serviceStatus'

// Moving a job to one of these opens the finish box (km, cost, mechanic) first.
const FINISHED = ['Completed, awaiting invoice', 'Invoiced']

// Colour-coded status dropdown. Booked / At mechanic save straight away;
// Waiting for invoice / Done ask for km, cost and mechanic first. Used inside
// clickable table rows, so it stops clicks from opening the row.
export function StatusSelect({ service, onError }) {
  const queryClient = useQueryClient()
  const { openForm } = useActions()
  const mutation = useMutation({
    mutationFn: (status) => setServiceStatus(service.id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    },
    onError: () => onError?.('Could not update status.'),
  })
  const value = mutation.isPending ? mutation.variables : service.status

  return (
    <select
      value={value}
      disabled={mutation.isPending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = e.target.value
        if (FINISHED.includes(next) && service.service_type !== 'Van wash') openForm('finish', { ...service, targetStatus: next })
        else mutation.mutate(next)
      }}
      className={'rounded-full border px-2 py-0.5 text-xs font-medium disabled:opacity-60 ' + (STATUS_STYLES[value] ?? '')}
    >
      {SERVICE_STATUSES.map((s) => (
        <option key={s} value={s} className="bg-white text-ink">{statusWord(s)}</option>
      ))}
    </select>
  )
}
