import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { changePassword, createUser, fetchActivity, fetchUsers, setUserActive } from '../api/extra'
import { fetchVehicles } from '../api/vehicles'
import { useActions } from '../lib/actions'
import { fmtAgo, fmtDate, fmtDateTime } from '../lib/formatDate'
import { href, navigate } from '../lib/router'
import { Button, Card, Empty, PageHeader, Pill, Tabs } from './ui'

const inputCls = 'h-9 w-full rounded-md border border-line bg-white px-2.5 text-[13px] focus:border-primary focus:outline-none'
const KIND_TONE = { Service: 'ok', Fuel: 'info', Wash: 'off', Incident: 'due', Van: 'info', Document: 'info', Driver: 'off', Budget: 'warn', User: 'warn' }

function Logins() {
  const queryClient = useQueryClient()
  const { toast } = useActions()
  const users = useQuery({ queryKey: ['users'], queryFn: fetchUsers })
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [pw, setPw] = useState({ current: '', new: '' })
  const add = useMutation({
    mutationFn: () => createUser(form),
    onSuccess: (u) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setForm({ name: '', email: '', password: '' })
      toast(`Login added for ${u.email}. Give them the password yourself.`)
    },
    onError: (err) => toast(err?.response?.data?.detail ?? 'Could not add the login.', true),
  })
  const toggle = useMutation({
    mutationFn: (u) => setUserActive(u.id, !u.active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (err) => toast(err?.response?.data?.detail ?? 'Could not change the login.', true),
  })
  const change = useMutation({
    mutationFn: () => changePassword(pw),
    onSuccess: () => { setPw({ current: '', new: '' }); toast('Password changed.') },
    onError: (err) => toast(err?.response?.data?.detail ?? 'Could not change the password.', true),
  })

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card title="Who can log in" description="Everyone here can see and change everything. Switch a login off when someone leaves; their history stays." padded={false}>
        <ul className="divide-y divide-[#eef1f5]">
          {(users.data ?? []).map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px]">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e6eef8] text-xs font-bold text-primary uppercase">{(u.name || u.email).slice(0, 1)}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{u.name || u.email} {u.isMe && <Pill tone="info">you</Pill>} {!u.active && <Pill tone="off">switched off</Pill>}</div>
                <div className="text-xs text-off">{u.email} · {u.lastLogin ? `last in ${fmtAgo(u.lastLogin)}` : 'never logged in'}</div>
              </div>
              {!u.isMe && (
                <Button variant={u.active ? 'ghost' : 'secondary'} className="h-8 text-xs" disabled={toggle.isPending} onClick={() => toggle.mutate(u)}>
                  {u.active ? 'Switch off' : 'Switch back on'}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <form className="grid gap-3 border-t border-line p-4" onSubmit={(e) => { e.preventDefault(); add.mutate() }}>
          <div className="text-[13.5px] font-semibold">Add a login (e.g. your boss)</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs font-medium text-off">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></label>
            <label className="grid gap-1 text-xs font-medium text-off">Email (they sign in with it)<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></label>
            <label className="grid gap-1 text-xs font-medium text-off">Starting password<input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" icon="plus" disabled={add.isPending || !form.email || !form.password}>Add login</Button>
            <span className="text-xs text-off">At least 8 characters, not all numbers. They can change it after signing in (Team → Logins).</span>
          </div>
        </form>
      </Card>

      <Card title="Change my password">
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); change.mutate() }}>
          <label className="grid gap-1 text-xs font-medium text-off">Current password<input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={inputCls} /></label>
          <label className="grid gap-1 text-xs font-medium text-off">New password<input type="password" autoComplete="new-password" value={pw.new} onChange={(e) => setPw({ ...pw, new: e.target.value })} className={inputCls} /></label>
          <div><Button type="submit" variant="primary" disabled={change.isPending || !pw.current || !pw.new}>Change password</Button></div>
        </form>
      </Card>
    </div>
  )
}

export function ActivityList({ vehicle, limit = 300, compact = false }) {
  const [who, setWho] = useState('')
  const [van, setVan] = useState(vehicle ?? '')
  const vans = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles(''), enabled: !vehicle })
  const users = useQuery({ queryKey: ['users'], queryFn: fetchUsers, enabled: !compact })
  const filters = { vehicle: van || undefined, who: who || undefined, limit }
  const { data } = useQuery({ queryKey: ['activity', filters], queryFn: () => fetchActivity(filters) })
  const rows = data ?? []
  const people = [...new Set([...(users.data ?? []).map((u) => u.name || u.email), ...rows.map((r) => r.who_label)].filter(Boolean))]

  return (
    <div>
      {!compact && (
        <div className="flex flex-wrap gap-2 border-b border-line p-4">
          <select value={van} onChange={(e) => setVan(e.target.value)} aria-label="Van" className={inputCls + ' w-auto'}>
            <option value="">All vans</option>
            {(vans.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Person" className={inputCls + ' w-auto'}>
            <option value="">Everyone</option>
            {people.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      )}
      {rows.length === 0 ? (
        <Empty>Nothing recorded yet. Every change from now on appears here with who made it.</Empty>
      ) : (
        <ul>
          {rows.map((r, i) => {
            const day = r.created_at.slice(0, 10)
            const header = i === 0 || day !== rows[i - 1].created_at.slice(0, 10)
            return (
              <li key={r.id}>
                {header && <div className="bg-[#f8fafc] px-4 py-1.5 text-[11.5px] font-semibold tracking-wide text-off uppercase">{fmtDate(day)} · {fmtAgo(day)}</div>}
                <div className="grid grid-cols-[52px_78px_1fr] items-baseline gap-3 border-b border-[#eef1f5] px-4 py-2.5 text-[13px]">
                  <span className="text-xs text-off tabular-nums">{fmtDateTime(r.created_at).slice(11)}</span>
                  <span><Pill tone={KIND_TONE[r.kind] ?? 'off'}>{r.kind}</Pill></span>
                  <span className="min-w-0">
                    <span className="font-semibold">{r.who_label || 'Someone'}</span> <span className="text-off">{r.action.toLowerCase()}</span> {r.summary}
                    {r.vehicle && !vehicle && <> · <a href={href('vans', r.vehicle)} className="text-primary hover:underline">open van</a></>}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function TeamView({ sub }) {
  const tab = sub === 'logins' ? 'logins' : 'activity'
  return (
    <div>
      <PageHeader title="Team" description="Who changed what, and who can log in." />
      <Tabs
        items={[{ key: 'activity', label: 'Activity' }, { key: 'logins', label: 'Logins' }]}
        value={tab}
        onChange={(k) => (k === 'activity' ? navigate('team') : navigate('team', k))}
      />
      {tab === 'activity' ? (
        <Card title="Activity" description="Every add, change and delete, newest first, with who did it. Driver reports from QR stickers show as “Driver … (QR sticker)”." padded={false}>
          <ActivityList />
        </Card>
      ) : (
        <Logins />
      )}
    </div>
  )
}
