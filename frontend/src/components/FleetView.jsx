import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { deleteVehicle, fetchVehicles } from '../api/vehicles'
import { ConfirmDialog } from './ConfirmDialog'

const BADGE = {
  ok: { label: 'OK', className: 'bg-ok-bg text-ok' },
  due_soon: { label: 'Due soon', className: 'bg-warn-bg text-warn' },
  attention: { label: 'Attention', className: 'bg-due-bg text-due' },
}

function StatusBadge({ status }) {
  const b = BADGE[status] ?? BADGE.ok
  return <span className={'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ' + b.className}>{b.label}</span>
}

function VehicleCard({ vehicle, onEdit, onDelete }) {
  const svc = vehicle.nextServiceDue
  const svcColor = svc && svc.km_left < 0 ? 'text-due' : svc && svc.km_left < 2000 ? 'text-warn' : 'text-off'
  return (
    <div className="relative rounded-lg border border-line bg-white p-4">
      <div className="absolute top-3 right-3 flex gap-1">
        <button onClick={() => onEdit(vehicle)} title="Edit" className="rounded-md border border-line bg-white px-1.5 py-1 text-off hover:bg-[#f5f5f5]">
          ✎
        </button>
        <button onClick={() => onDelete(vehicle)} title="Delete" className="rounded-md border border-line bg-white px-1.5 py-1 text-off hover:bg-due-bg hover:text-due">
          ✕
        </button>
      </div>
      <div className="mb-2 pr-14 text-sm font-semibold text-ink">{vehicle.label}</div>
      <div className="mb-2 text-xs text-off">
        {vehicle.rego || 'No rego'}
        {vehicle.vehicle_number ? ` · ${vehicle.vehicle_number}` : ''}
      </div>
      {vehicle.vin && (
        <div className="mb-1.5">
          <span className="rounded border border-line bg-[#f5f5f5] px-1.5 py-0.5 font-mono text-[11px] text-off">{vehicle.vin}</span>
        </div>
      )}
      <div className="mb-2 text-xs text-off">{vehicle.odometer ? `${vehicle.odometer.toLocaleString()} km` : ''}</div>
      <StatusBadge status={vehicle.statusBadge} />
      {svc && (
        <div className={'mt-2 text-[11px] ' + svcColor}>
          Service due: {svc.due_at.toLocaleString()} km{svc.km_left < 0 ? ' — overdue' : ` (${svc.km_left.toLocaleString()} km left)`}
        </div>
      )}
      <div className="mt-2 text-[11px] text-[#aaa]">
        {vehicle.rego_expiry && <div>Rego: {vehicle.rego_expiry}</div>}
        {vehicle.insurance_expiry && <div>Insurance: {vehicle.insurance_expiry}</div>}
      </div>
    </div>
  )
}

export function FleetView({ onEdit, onAdd }) {
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const queryClient = useQueryClient()
  const vehiclesQuery = useQuery({ queryKey: ['vehicles', search], queryFn: () => fetchVehicles(search) })

  const deleteMutation = useMutation({
    mutationFn: deleteVehicle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      setDeleteTarget(null)
    },
    onError: (err) => setDeleteError(err?.response?.data?.detail ?? 'Could not delete vehicle.'),
  })

  const vehicles = vehiclesQuery.data ?? []

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">All vehicles</h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search make, model, rego, VIN, vehicle #…"
          className="max-w-[280px] flex-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-[13px]"
        />
      </div>
      {vehicles.length === 0 ? (
        <div className="rounded-lg border border-line bg-white py-10 text-center text-off">
          {search ? 'No vehicles match your search.' : (
            <>
              No vehicles yet.{' '}
              <button onClick={onAdd} className="font-medium text-primary underline">
                Add one
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <VehicleCard key={v.id} vehicle={v} onEdit={onEdit} onDelete={(vh) => { setDeleteTarget(vh); setDeleteError(null) }} />
          ))}
        </div>
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete vehicle?"
          message={`Delete ${deleteTarget.label} (${deleteTarget.rego || 'no rego'})? This can't be undone.`}
          errorMessage={deleteError}
          confirming={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </div>
  )
}
