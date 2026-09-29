import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setServiceStatus } from '../api/services'
import { SERVICE_STATUSES, STATUS_STYLES } from '../lib/serviceStatus'

// Colour-coded status dropdown that saves as soon as it changes. Used inside
// clickable table rows, so it stops clicks from opening the row.
export function StatusSelect({ service, onError }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (status) => setServiceStatus(service.id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: () => onError?.('Could not update status.'),
  })
  const value = mutation.isPending ? mutation.variables : service.status

  return (
    <select
      value={value}
      disabled={mutation.isPending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => mutation.mutate(e.target.value)}
      className={'rounded-full border px-2 py-0.5 text-xs font-medium disabled:opacity-60 ' + (STATUS_STYLES[value] ?? '')}
    >
      {SERVICE_STATUSES.map((s) => (
        <option key={s} value={s} className="bg-white text-ink">{s}</option>
      ))}
    </select>
  )
}
