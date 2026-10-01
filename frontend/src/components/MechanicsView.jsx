import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createMechanic, deleteMechanic, fetchMechanics, updateMechanic } from '../api/extra'
import { useActions } from '../lib/actions'
import { fmtAgo, fmtDate } from '../lib/formatDate'
import { href } from '../lib/router'
import { ConfirmDialog } from './ConfirmDialog'

const inputCls = 'h-[34px] rounded-md border border-line bg-white px-2.5 text-[13px] focus:border-primary focus:outline-none'
const money = (n) => `$${Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// The mechanics and workshops that service the vans, with how many jobs each
// has done and what they've cost.
export function MechanicsView() {
  const queryClient = useQueryClient()
  const { toast } = useActions()
  const { data } = useQuery({ queryKey: ['mechanics'], queryFn: fetchMechanics })
  const [form, setForm] = useState({ name: '', phone: '', address: '' })
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['mechanics'] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
  }
  const add = useMutation({
    mutationFn: () => createMechanic(form),
    onSuccess: (m) => { refresh(); setForm({ name: '', phone: '', address: '' }); toast(`${m.name} added.`) },
    onError: (err) => toast(err?.response?.data?.detail ?? 'Could not add the mechanic.', true),
  })
  const save = useMutation({
    mutationFn: (m) => updateMechanic(m.id, { name: m.name, phone: m.phone, address: m.address, active: m.active }),
    onSuccess: () => { refresh(); setEditing(null); toast('Mechanic saved.') },
    onError: () => toast('Could not save the mechanic.', true),
  })
  const remove = useMutation({
    mutationFn: (m) => deleteMechanic(m.id),
    onSuccess: () => { refresh(); setRemoving(null); toast('Mechanic removed.') },
  })
  const rows = data ?? []

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="border-b border-line px-3.5 py-3">
        <h2 className="text-[15px] font-semibold text-ink">Mechanics &amp; workshops</h2>
        <p className="mt-0.5 text-xs text-off">Who services the vans. Pick one on each service, and see their jobs and spend here.</p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2.5 border-b border-line bg-[#fafafa] p-3"
        onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) add.mutate() }}
      >
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[11px] font-medium tracking-wide text-off uppercase">
          Name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Canterbury Toyota" className={inputCls} />
        </label>
        <label className="flex w-[160px] flex-col gap-1 text-[11px] font-medium tracking-wide text-off uppercase">
          Phone
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[11px] font-medium tracking-wide text-off uppercase">
          Address
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
        </label>
        <button type="submit" disabled={!form.name.trim() || add.isPending} className="h-[34px] rounded-md bg-primary px-3.5 text-[13px] font-medium text-white hover:bg-primary-dark disabled:opacity-50">
          + Add mechanic
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line bg-[#fafafa] text-xs text-off">
              <th className="px-3 py-2.5 text-left font-medium">Mechanic / workshop</th>
              <th className="px-3 py-2.5 text-left font-medium">Phone</th>
              <th className="px-3 py-2.5 text-left font-medium">Address</th>
              <th className="px-3 py-2.5 text-right font-medium">Jobs</th>
              <th className="px-3 py-2.5 text-right font-medium">Total spent</th>
              <th className="px-3 py-2.5 text-left font-medium">Last job</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-off">No mechanics yet. Add one above, or pick "+ Add new mechanic" when logging a service.</td></tr>
            ) : (
              rows.map((m) =>
                editing?.id === m.id ? (
                  <tr key={m.id} className="border-b border-[#f0f0f0] bg-[#fafcff]">
                    <td className="px-3 py-2"><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Name" className={inputCls + ' w-full'} /></td>
                    <td className="px-3 py-2"><input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} aria-label="Phone" className={inputCls + ' w-full'} /></td>
                    <td className="px-3 py-2"><input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} aria-label="Address" className={inputCls + ' w-full'} /></td>
                    <td colSpan={3} className="px-3 py-2">
                      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Still use them</label>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => save.mutate(editing)} className="mr-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white">Save</button>
                      <button onClick={() => setEditing(null)} className="rounded-md border border-line bg-white px-2.5 py-1 text-xs">Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id} className={'border-b border-[#f0f0f0] ' + (m.active ? '' : 'text-off')}>
                    <td className="px-3 py-2.5 font-medium">
                      {m.name}
                      {!m.active && <span className="ml-1.5 rounded-full bg-[#f0f0f0] px-2 py-0.5 text-[11px] font-normal">not used any more</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{m.phone || '—'}</td>
                    <td className="px-3 py-2.5">{m.address || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.jobs}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(m.spend)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{m.lastJob ? <>{fmtDate(m.lastJob)} <span className="text-off">· {fmtAgo(m.lastJob)}</span></> : '—'}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {m.jobs > 0 && <a href={href('services', 'mechanic', m.id)} className="mr-2 text-xs font-medium text-primary hover:underline">See jobs</a>}
                      <button onClick={() => setEditing({ ...m })} className="mr-1 rounded px-1.5 py-1 text-off hover:bg-[#f0f0f0]" title="Edit">✎</button>
                      <button onClick={() => setRemoving(m)} className="rounded px-1.5 py-1 text-off hover:bg-due-bg hover:text-due" title="Remove">✕</button>
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-3.5 py-2.5 text-xs text-off">Jobs and total spent count services (not van washes) where this mechanic is picked.</p>

      {removing && (
        <ConfirmDialog
          title="Remove mechanic?"
          message={`Remove ${removing.name}? ${removing.jobs ? `Their ${removing.jobs} service${removing.jobs === 1 ? '' : 's'} will stay, just without a mechanic. To keep the name on old jobs, edit them and untick "Still use them" instead.` : ''}`}
          confirmLabel="Remove"
          confirming={remove.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove.mutate(removing)}
        />
      )}
    </div>
  )
}
