import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { addStock, createStockItem, deleteStockItem, fetchStockMoves, updateStockItem, useStock } from '../api/stock'
import { useActions } from '../lib/actions'
import { fmtDateTime } from '../lib/formatDate'
import { ConfirmDialog } from './ConfirmDialog'

const inputCls = 'h-[34px] rounded-md border border-line bg-white px-2.5 text-[13px] focus:border-primary focus:outline-none'

// How an item's count is shown: plain when fine, "Order now" when below its
// order level, "Out" at zero.
export function StockPill({ item }) {
  if (item.status === 'out') return <span className="rounded-full bg-due-bg px-2.5 py-0.5 text-xs font-semibold text-due">Out of stock · order now</span>
  if (item.status === 'low') return <span className="rounded-full bg-warn-bg px-2.5 py-0.5 text-xs font-semibold text-warn">Order now</span>
  return null
}

function History({ item }) {
  const moves = useQuery({ queryKey: ['stock-moves', item.id, item.quantity], queryFn: () => fetchStockMoves(item.id) })
  const rows = moves.data ?? []
  return (
    <div className="border-t border-[#eef1f5] bg-[#fafafa] px-4 py-2.5 text-xs text-off">
      {rows.length === 0 ? 'No changes yet.' : (
        <ul className="grid gap-0.5">
          {rows.slice(0, 10).map((m) => (
            <li key={m.id}>
              <span className="tabular-nums">{fmtDateTime(m.created_at)}</span>{' · '}
              <b className={m.change < 0 ? 'text-ink' : 'text-ok'}>{m.change < 0 ? `used ${-m.change}` : `added ${m.change}`}</b>
              {' · '}{m.quantity_after} left{m.note ? ` · ${m.note}` : ''}{m.who_label ? ` · ${m.who_label}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Spare parts in stock. "Used 1" takes one off; "Add" puts more on. Below the
// order level the part shows "Order now" here and on Home.
export function StockView() {
  const queryClient = useQueryClient()
  const { toast } = useActions()
  const items = useStock()
  const [form, setForm] = useState({ name: '', quantity: '', order_below: '2' })
  const [open, setOpen] = useState(null) // the item whose history is showing
  const [adding, setAdding] = useState(null) // { id, amount }
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['stock'] })
  const fail = (fallback) => (err) => toast(err?.response?.data?.detail ?? fallback, true)

  const create = useMutation({
    mutationFn: () => createStockItem(form),
    onSuccess: (i) => { refresh(); setForm({ name: '', quantity: '', order_below: '2' }); toast(`${i.name} added: ${i.quantity} in stock.`) },
    onError: fail('Could not add the part.'),
  })
  const use = useMutation({
    mutationFn: (i) => addStock(i.id, 'use', 1),
    onSuccess: (i) => { refresh(); toast(i.status === 'ok' ? `${i.name}: ${i.quantity} left.` : `${i.name}: ${i.quantity} left. Order now.`, i.status !== 'ok') },
    onError: fail('Could not take one off.'),
  })
  const add = useMutation({
    mutationFn: ({ id, amount }) => addStock(id, 'add', amount),
    onSuccess: (i) => { refresh(); setAdding(null); toast(`${i.name}: ${i.quantity} in stock.`) },
    onError: fail('Could not add that many.'),
  })
  const save = useMutation({
    mutationFn: (i) => updateStockItem(i.id, { name: i.name, quantity: i.quantity, order_below: i.order_below, notes: i.notes ?? '' }),
    onSuccess: () => { refresh(); setEditing(null); toast('Saved.') },
    onError: fail('Could not save.'),
  })
  const remove = useMutation({
    mutationFn: (i) => deleteStockItem(i.id),
    onSuccess: () => { refresh(); setRemoving(null); toast('Part removed from the list.') },
  })

  const rows = items.data ?? []
  const needOrder = rows.filter((i) => i.status !== 'ok')

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="border-b border-line px-3.5 py-3">
        <h2 className="text-[15px] font-semibold text-ink">Stock</h2>
        <p className="mt-0.5 text-xs text-off">Spare parts you keep, for example headlight bulbs. Press <b>Used 1</b> each time one is used. When a part drops below its order level it shows <b>Order now</b> here and on Home.</p>
      </div>

      {needOrder.length > 0 && (
        <div className="border-b border-line bg-warn-bg px-3.5 py-2 text-[13px] font-medium text-warn">
          Order now: {needOrder.map((i) => `${i.name} (${i.quantity} left)`).join(' · ')}
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-2.5 border-b border-line bg-[#fafafa] p-3"
        onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) create.mutate() }}
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[11px] font-medium tracking-wide text-off uppercase">
          Add a part
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Headlight bulb H4 12V" className={inputCls} />
        </label>
        <label className="flex w-[110px] flex-col gap-1 text-[11px] font-medium tracking-wide text-off uppercase">
          How many
          <input type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0" className={inputCls} />
        </label>
        <label className="flex w-[150px] flex-col gap-1 text-[11px] font-medium tracking-wide text-off uppercase" title="When the count drops below this number it shows Order now">
          Order when below
          <input type="number" min="1" value={form.order_below} onChange={(e) => setForm({ ...form, order_below: e.target.value })} className={inputCls} />
        </label>
        <button type="submit" disabled={!form.name.trim() || create.isPending} className="h-[34px] rounded-md bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
          {create.isPending ? 'Adding…' : '+ Add part'}
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-off">{items.isLoading ? 'Loading…' : 'No parts yet. Add the first one above, for example Headlight bulb H4 12V.'}</div>
      ) : (
        <ul className="divide-y divide-[#eef1f5]">
          {rows.map((i) =>
            editing?.id === i.id ? (
              <li key={i.id} className="flex flex-wrap items-end gap-2.5 bg-[#fafafa] px-4 py-3">
                <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[11px] font-medium tracking-wide text-off uppercase">Name
                  <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputCls} />
                </label>
                <label className="flex w-[100px] flex-col gap-1 text-[11px] font-medium tracking-wide text-off uppercase" title="Type the real count if the shelf is different">In stock
                  <input type="number" min="0" value={editing.quantity} onChange={(e) => setEditing({ ...editing, quantity: e.target.value })} className={inputCls} />
                </label>
                <label className="flex w-[130px] flex-col gap-1 text-[11px] font-medium tracking-wide text-off uppercase">Order below
                  <input type="number" min="1" value={editing.order_below} onChange={(e) => setEditing({ ...editing, order_below: e.target.value })} className={inputCls} />
                </label>
                <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[11px] font-medium tracking-wide text-off uppercase">Note
                  <input value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="where it's kept, which vans" className={inputCls} />
                </label>
                <button onClick={() => save.mutate(editing)} className="h-[34px] rounded-md bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-dark">Save</button>
                <button onClick={() => setEditing(null)} className="h-[34px] rounded-md border border-line bg-white px-3 text-[13px] hover:bg-[#f5f5f5]">Cancel</button>
              </li>
            ) : (
              <li key={i.id}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-[200px] flex-1">
                    <div className="text-[14px] font-semibold text-ink">{i.name} <StockPill item={i} /></div>
                    <div className="text-xs text-off">
                      order when below {i.order_below}{i.notes ? ` · ${i.notes}` : ''}
                      {' · '}<button onClick={() => setOpen(open === i.id ? null : i.id)} className="text-primary hover:underline">{open === i.id ? 'hide history' : 'history'}</button>
                      {' · '}<button onClick={() => setEditing({ ...i })} className="text-primary hover:underline">edit</button>
                      {' · '}<button onClick={() => setRemoving(i)} className="text-primary hover:underline">remove</button>
                    </div>
                  </div>
                  <div className={'w-[70px] text-right text-[26px] leading-none font-semibold tabular-nums ' + (i.status === 'ok' ? 'text-ink' : i.status === 'low' ? 'text-warn' : 'text-due')} title="In stock">
                    {i.quantity}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => use.mutate(i)}
                      disabled={i.quantity === 0 || use.isPending}
                      className="rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold hover:bg-[#f5f5f5] disabled:opacity-40"
                    >
                      Used 1
                    </button>
                    {adding?.id === i.id ? (
                      <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); if (adding.amount) add.mutate(adding) }}>
                        <input autoFocus type="number" min="1" value={adding.amount} onChange={(e) => setAdding({ ...adding, amount: e.target.value })} placeholder="How many" className={inputCls + ' w-[100px]'} />
                        <button type="submit" className="h-[34px] rounded-md bg-primary px-3 text-[13px] font-semibold text-white hover:bg-primary-dark">Add</button>
                        <button type="button" onClick={() => setAdding(null)} className="h-[34px] px-2 text-[13px] text-off hover:text-ink">✕</button>
                      </form>
                    ) : (
                      <button onClick={() => setAdding({ id: i.id, amount: '' })} className="rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold hover:bg-[#f5f5f5]">+ Add stock</button>
                    )}
                  </div>
                </div>
                {open === i.id && <History item={i} />}
              </li>
            ),
          )}
        </ul>
      )}

      {removing && (
        <ConfirmDialog
          title="Remove this part?"
          message={`Remove ${removing.name} from the stock list? Its history goes with it.`}
          confirmLabel="Remove"
          confirming={remove.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove.mutate(removing)}
        />
      )}
    </div>
  )
}
