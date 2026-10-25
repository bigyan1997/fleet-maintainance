import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createFine, deleteFine, FINE_KINDS, updateFine, useFines } from '../api/fines'
import { fetchDrivers } from '../api/extra'
import { fetchVehicles } from '../api/vehicles'
import { useActions } from '../lib/actions'
import { fmtDayDate, todayIso } from '../lib/formatDate'
import { ConfirmDialog } from './ConfirmDialog'
import { Documents } from './Documents'

const inputCls = 'h-[34px] rounded-md border border-line bg-white px-2.5 text-[13px] focus:border-primary focus:outline-none'
const labelCls = 'flex flex-col gap-1 text-[11px] font-medium tracking-wide text-off uppercase'
const money = (n) => `$${Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const BLANK = { vehicle: '', date: '', time: '', kind: 'Speeding', amount: '', name_driver_by: '', pay_by: '', driver: '', reference: '', notes: '' }

// "name the driver by 03-11-2026 (6 days)" / "overdue by 3 days" / "paid".
function Deadline({ fine }) {
  if (fine.status === 'paid') return <span className="font-medium text-ok">Paid {fine.paid_on ? fmtDayDate(fine.paid_on) : ''}</span>
  const what = fine.status === 'to_name' ? 'Name the driver' : 'Pay'
  if (!fine.deadline) return <span className="text-off">{what}: no date given</span>
  const d = fine.daysLeft
  const tone = d < 0 ? 'font-semibold text-due' : d <= 7 ? 'font-semibold text-warn' : 'text-ink'
  return (
    <span className={tone}>
      {what} by {fmtDayDate(fine.deadline)}
      <span className="font-normal"> · {d < 0 ? `overdue by ${-d} day${d === -1 ? '' : 's'}` : d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'}`}</span>
    </span>
  )
}

// Fines and infringement notices. Each one watches two dates: the day the
// driver must be named by, then the day it must be paid by. Both show on Home
// when they are close.
export function FinesView() {
  const queryClient = useQueryClient()
  const { toast } = useActions()
  const fines = useFines()
  const vehicles = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const drivers = useQuery({ queryKey: ['drivers'], queryFn: fetchDrivers })
  const [form, setForm] = useState(null) // null = closed; otherwise the fine being added or edited
  const [naming, setNaming] = useState(null) // { id, driver }
  const [notices, setNotices] = useState(null) // the fine whose notice photos are showing
  const [removing, setRemoving] = useState(null)
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['fines'] })
    queryClient.invalidateQueries({ queryKey: ['analytics'] })
  }
  const fail = (fallback) => (err) => {
    const data = err?.response?.data
    const first = data && typeof data === 'object' ? (data.detail ?? Object.values(data).flat()[0]) : null
    toast(first ?? fallback, true)
  }
  const clean = (f) => ({
    vehicle: f.vehicle, date: f.date, time: f.time || null, kind: f.kind, amount: f.amount === '' ? 0 : f.amount,
    name_driver_by: f.name_driver_by || null, pay_by: f.pay_by || null, driver: f.driver || null, reference: f.reference, notes: f.notes,
  })
  const save = useMutation({
    mutationFn: (f) => (f.id ? updateFine(f.id, clean(f)) : createFine(clean(f))),
    onSuccess: (f) => { refresh(); setForm(null); toast(`${f.kind} fine saved for ${f.vehicleLabel}.`) },
    onError: fail('Could not save the fine.'),
  })
  const step = useMutation({
    mutationFn: ({ id, data }) => updateFine(id, data),
    onSuccess: (f) => {
      refresh(); setNaming(null)
      toast(f.status === 'paid' ? `${f.vehicleLabel} fine marked paid.` : f.status === 'to_pay' ? `${f.driverName || 'Driver'} named. Now to pay.` : 'Fine updated.')
    },
    onError: fail('Could not update the fine.'),
  })
  const remove = useMutation({
    mutationFn: (f) => deleteFine(f.id),
    onSuccess: () => { refresh(); setRemoving(null); toast('Fine removed.') },
    onError: fail('Could not remove the fine.'),
  })

  const rows = fines.data ?? []
  const open = rows.filter((f) => f.status !== 'paid')
  const owing = open.reduce((s, f) => s + Number(f.amount), 0)
  const vans = vehicles.data ?? []
  const people = (drivers.data ?? []).filter((d) => d.active)

  const startAdd = () => setForm({ ...BLANK, date: todayIso() })
  // Picking a van suggests its usual driver (you can change it).
  const pickVan = (id) => {
    const van = vans.find((v) => String(v.id) === String(id))
    setForm((f) => ({ ...f, vehicle: id, driver: f.driver || (van?.driver ?? '') }))
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-3.5 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Fines</h2>
          <p className="mt-0.5 text-xs text-off">Speeding, parking, camera and toll fines. Add the dates on the notice; the app watches them and shows a line on Home when one is close.</p>
        </div>
        <button onClick={startAdd} className="rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-dark">+ Add fine</button>
      </div>

      {open.length > 0 && (
        <div className="border-b border-line bg-warn-bg px-3.5 py-2 text-[13px] font-medium text-warn">
          {open.length} fine{open.length === 1 ? '' : 's'} still to deal with · {money(owing)} unpaid
        </div>
      )}

      {form && (
        <form
          className="grid gap-3 border-b border-line bg-[#fafafa] p-3.5"
          onSubmit={(e) => { e.preventDefault(); if (form.vehicle && form.date) save.mutate(form) }}
        >
          <div className="text-[13px] font-semibold text-ink">{form.id ? 'Edit fine' : 'New fine'}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={labelCls}>Van
              <select value={form.vehicle} onChange={(e) => pickVan(e.target.value)} className={inputCls}>
                <option value="">Choose a van…</option>
                {vans.map((v) => <option key={v.id} value={v.id}>{v.label}{v.rego ? ` · ${v.rego}` : ''}</option>)}
              </select>
            </label>
            <label className={labelCls}>What for
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inputCls}>
                {FINE_KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
            <label className={labelCls}>Date it happened
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} min="2000-01-01" max="2099-12-31" className={inputCls} />
            </label>
            <label className={labelCls}>Time (optional)
              <input type="time" value={form.time ?? ''} onChange={(e) => setForm({ ...form, time: e.target.value })} className={inputCls} />
            </label>
            <label className={labelCls}>Amount ($)
              <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 277" className={inputCls} />
            </label>
            <label className={labelCls} title="Leave blank if the notice doesn't ask who was driving">Name the driver by
              <input type="date" value={form.name_driver_by ?? ''} onChange={(e) => setForm({ ...form, name_driver_by: e.target.value })} min="2000-01-01" max="2099-12-31" className={inputCls} />
            </label>
            <label className={labelCls}>Pay by
              <input type="date" value={form.pay_by ?? ''} onChange={(e) => setForm({ ...form, pay_by: e.target.value })} min="2000-01-01" max="2099-12-31" className={inputCls} />
            </label>
            <label className={labelCls} title="Suggested from the van's usual driver; change it if someone else was driving">Who was driving
              <select value={form.driver ?? ''} onChange={(e) => setForm({ ...form, driver: e.target.value })} className={inputCls}>
                <option value="">Not known yet</option>
                {people.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className={labelCls}>Notice / reference number
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className={inputCls} />
            </label>
            <label className={labelCls + ' sm:col-span-2 lg:col-span-3'}>Note
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="where it happened, who to ring…" className={inputCls} />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={!form.vehicle || !form.date || save.isPending} className="rounded-md bg-primary px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
              {save.isPending ? 'Saving…' : 'Save fine'}
            </button>
            <button type="button" onClick={() => setForm(null)} className="rounded-md border border-line bg-white px-3 py-1.5 text-[13px] hover:bg-[#f5f5f5]">Cancel</button>
            <span className="text-xs text-off">You can attach a photo of the notice after saving.</span>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-off">{fines.isLoading ? 'Loading…' : 'No fines recorded. Add one when a notice arrives.'}</div>
      ) : (
        <ul className="divide-y divide-[#eef1f5]">
          {rows.map((f) => (
            <li key={f.id}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-[240px] flex-1">
                  <div className="text-[14px] font-semibold text-ink">
                    {f.vehicleLabel} <span className="font-normal text-off">· {f.kind}</span>
                    {f.status === 'to_name' && <span className="ml-2 rounded-full bg-due-bg px-2 py-0.5 text-xs font-semibold text-due">Name the driver</span>}
                    {f.status === 'to_pay' && <span className="ml-2 rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">To pay</span>}
                    {f.status === 'paid' && <span className="ml-2 rounded-full bg-ok-bg px-2 py-0.5 text-xs font-semibold text-ok">Paid</span>}
                  </div>
                  <div className="text-xs text-off">
                    {fmtDayDate(f.date)}{f.time ? ` ${f.time.slice(0, 5)}` : ''} · Driver: {f.driverName || 'not known yet'}{f.named_on ? ` (named ${fmtDayDate(f.named_on)})` : ''}
                    {f.reference ? ` · ${f.reference}` : ''}{f.notes ? ` · ${f.notes}` : ''}
                  </div>
                  <div className="text-xs"><Deadline fine={f} /></div>
                </div>
                <div className="w-[100px] text-right text-[18px] font-semibold tabular-nums">{money(f.amount)}</div>
                <div className="flex flex-wrap items-center gap-2">
                  {f.status === 'to_name' && (naming?.id === f.id ? (
                    <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); if (naming.driver) step.mutate({ id: f.id, data: { driver: Number(naming.driver), named_on: todayIso() } }) }}>
                      <select autoFocus value={naming.driver} onChange={(e) => setNaming({ ...naming, driver: e.target.value })} className={inputCls + ' w-[170px]'}>
                        <option value="">Who was driving?</option>
                        {people.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <button type="submit" disabled={!naming.driver} className="h-[34px] rounded-md bg-primary px-3 text-[13px] font-semibold text-white hover:bg-primary-dark disabled:opacity-50">Driver named</button>
                      <button type="button" onClick={() => setNaming(null)} className="h-[34px] px-2 text-[13px] text-off hover:text-ink">✕</button>
                    </form>
                  ) : (
                    <button onClick={() => setNaming({ id: f.id, driver: f.driver ?? '' })} className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-dark">Name the driver</button>
                  ))}
                  {f.status === 'to_pay' && (
                    <button onClick={() => step.mutate({ id: f.id, data: { paid_on: todayIso() } })} className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-dark">Mark paid</button>
                  )}
                  {f.status === 'paid' && (
                    <button onClick={() => step.mutate({ id: f.id, data: { paid_on: null } })} className="rounded-md border border-line bg-white px-3 py-1.5 text-[13px] hover:bg-[#f5f5f5]" title="Undo if it was ticked by mistake">Undo paid</button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-x-3 px-4 pb-2.5 text-xs">
                <button onClick={() => setNotices(notices === f.id ? null : f.id)} className="text-primary hover:underline">
                  {notices === f.id ? 'hide notice' : `notice photo${f.noticeCount ? ` (${f.noticeCount})` : ''}`}
                </button>
                <button onClick={() => setForm({ ...f, time: f.time ? f.time.slice(0, 5) : '', driver: f.driver ?? '' })} className="text-primary hover:underline">edit</button>
                <button onClick={() => setRemoving(f)} className="text-primary hover:underline">remove</button>
              </div>
              {notices === f.id && (
                <div className="border-t border-[#eef1f5] bg-[#fafafa] px-4 py-3">
                  <Documents fine={f.id} vehicle={f.vehicle} compact />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {removing && (
        <ConfirmDialog
          title="Remove this fine?"
          message={`Remove the ${removing.kind.toLowerCase()} fine for ${removing.vehicleLabel} (${money(removing.amount)})? Its notice photos go to the Bin in Google Drive.`}
          confirmLabel="Remove"
          confirming={remove.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove.mutate(removing)}
        />
      )}
    </div>
  )
}
