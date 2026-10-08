import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchAnalytics } from '../api/analytics'
import { deleteFuelLog, fetchFuelLogs } from '../api/fuelLogs'
import { fetchIncidents } from '../api/incidents'
import { deleteService, fetchServices } from '../api/services'
import { deleteVehicle, fetchVehicles } from '../api/vehicles'
import { useActions } from '../lib/actions'
import { fmtAgo, fmtDate } from '../lib/formatDate'
import { statusWord } from '../lib/serviceStatus'
import { href, navigate } from '../lib/router'
import { ConfirmDialog } from './ConfirmDialog'
import { Documents } from './Documents'
import { ChangeHistory } from './ChangeHistory'
import { StatusBadge } from './FleetView'
import { VanDetail } from './FuelByVan'
import { byNewest, expiryCell, serviceText, KmAsOf } from '../lib/fleet'
import { Button, Card, Empty, PageHeader, Pill, Tabs } from './ui'

const money = (n) => `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const km = (n) => `${Number(n).toLocaleString()} km`
const TIMELINE_STEP = 40

function Fact({ label, children, tone, sub }) {
  const tones = { due: 'bg-due-bg text-due', warn: 'bg-warn-bg text-warn' }
  return (
    <div className={'rounded-lg px-3.5 py-2.5 ' + (tones[tone] ?? 'bg-[#f4f6f9]')}>
      <div className={'text-[11.5px] font-medium ' + (tone ? '' : 'text-off')}>{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold tabular-nums">{children}</div>
      {sub && <div className={'text-[11.5px] ' + (tone ? '' : 'text-off')}>{sub}</div>}
    </div>
  )
}

function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 border-b border-[#eef1f5] py-2.5 text-[13px] last:border-0">
      <span className="text-off">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  )
}

function Timeline({ entries, onOpen }) {
  const [limit, setLimit] = useState(TIMELINE_STEP)
  if (entries.length === 0) return <Empty>Nothing logged for this van yet.</Empty>
  const tone = { Service: 'ok', Fuel: 'info', Wash: 'off', Incident: 'due' }
  return (
    <>
      <ul className="divide-y divide-[#eef1f5]">
        {entries.slice(0, limit).map((e) => (
          <li key={e.key} className="grid cursor-pointer grid-cols-[92px_80px_1fr_auto] items-baseline gap-3 px-4 py-2.5 text-[13px] hover:bg-[#f8fafc]" onClick={() => onOpen(e)}>
            <span className="text-xs text-off tabular-nums">{fmtDate(e.date)}</span>
            <span><Pill tone={tone[e.kind]}>{e.kind}</Pill></span>
            <span className="min-w-0">
              <span className="font-medium">{e.title}</span>
              {e.sub && <span className="text-off"> · {e.sub}</span>}
            </span>
            <span className="text-right font-medium whitespace-nowrap tabular-nums">{e.amount ?? ''}</span>
          </li>
        ))}
      </ul>
      {entries.length > limit && (
        <div className="border-t border-line px-4 py-2.5 text-center">
          <button onClick={() => setLimit((l) => l + TIMELINE_STEP)} className="text-xs font-medium text-primary hover:underline">
            Show {Math.min(TIMELINE_STEP, entries.length - limit)} more of {entries.length - limit}
          </button>
        </div>
      )}
    </>
  )
}

export function VanPage({ id }) {
  const vanId = Number(id)
  const { openForm, toast } = useActions()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('history')
  const [show, setShow] = useState('All')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [removeTarget, setRemoveTarget] = useState(null)

  const vehicles = useQuery({ queryKey: ['vehicles', ''], queryFn: () => fetchVehicles('') })
  const services = useQuery({ queryKey: ['services', { vehicle: vanId, all: true }], queryFn: () => fetchServices({ vehicle: vanId, page_size: 1000 }) })
  const washes = useQuery({
    queryKey: ['services', { vehicle: vanId, washes: true }],
    queryFn: () => fetchServices({ vehicle: vanId, service_type: 'Van wash', page_size: 1000 }),
  })
  const fuel = useQuery({ queryKey: ['fuel-logs', { vehicle: vanId, all: true }], queryFn: () => fetchFuelLogs({ vehicle: vanId, page_size: 5000 }) })
  const incidents = useQuery({ queryKey: ['incidents', { vehicle: vanId, all: true }], queryFn: () => fetchIncidents({ vehicle: vanId, page_size: 500 }) })
  const analytics = useQuery({ queryKey: ['analytics', { vehicle: vanId }], queryFn: () => fetchAnalytics({ vehicle: vanId }) })
  const fleet = useQuery({ queryKey: ['analytics', {}], queryFn: () => fetchAnalytics({}) })

  const refresh = () => {
    for (const key of ['services', 'fuel-logs', 'washes', 'vehicles', 'dashboard', 'alerts', 'analytics']) queryClient.invalidateQueries({ queryKey: [key] })
  }
  const deleteVan = useMutation({
    mutationFn: () => deleteVehicle(vanId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      toast('Vehicle deleted.')
      navigate('vans')
    },
    onError: (err) => setDeleteError(err?.response?.data?.detail ?? 'Could not delete vehicle.'),
  })
  const removeRecord = useMutation({
    mutationFn: (r) => (r.kind === 'fuel' ? deleteFuelLog(r.id) : deleteService(r.id)),
    onSuccess: () => { refresh(); setRemoveTarget(null); toast('Deleted.') },
    onError: () => toast('Could not delete.', true),
  })

  const v = vehicles.data?.find((x) => x.id === vanId)
  if (vehicles.isLoading) return null
  if (!v) {
    return (
      <div>
        <PageHeader title="Van not found" back={{ href: href('vans'), label: 'All vans' }} />
        <Card><Empty>This van doesn't exist any more. It may have been deleted.</Empty></Card>
      </div>
    )
  }

  const serviceRows = services.data?.results ?? []
  const washRows = washes.data?.results ?? []
  const fuelRows = fuel.data?.results ?? []
  const fills = fuelRows.filter((f) => f.isFuel).sort(byNewest)
  const charges = fuelRows.filter((f) => !f.isFuel).sort(byNewest)
  const incidentRows = incidents.data?.results ?? []
  const fuelStats = analytics.data?.fuelVans?.[0]
  const fleetAvg = fleet.data?.fuelFleetPer100
  const svc = v.nextServiceDue
  const tyre = v.nextTyreDue
  const openIncidents = incidentRows.filter((i) => i.status !== 'Resolved')
  const lastService = serviceRows.find((s) => s.status === 'Invoiced' || s.status === 'Completed, awaiting invoice')

  const entries = [
    ...serviceRows.map((s) => ({
      key: `s${s.id}`, kind: 'Service', date: s.date, record: s,
      title: s.service_type, sub: [statusWord(s.status), s.mechanicName && `by ${s.mechanicName}`, s.odometer && km(s.odometer), s.issues && `issues: ${s.issues}`].filter(Boolean).join(' · '),
      amount: s.cost ? money(s.cost) : null,
    })),
    ...washRows.map((w) => ({ key: `w${w.id}`, kind: 'Wash', date: w.date, record: w, title: 'Washed', sub: fmtAgo(w.date) })),
    ...fills.map((f) => ({
      key: `f${f.id}`, kind: 'Fuel', date: f.date, record: f,
      title: `${Number(f.litres).toFixed(2)} L ${f.product && f.product !== 'Diesel' ? f.product.toLowerCase() : 'diesel'}`,
      sub: [(f.notes || '').split(' · ')[0], f.odometer && km(f.odometer)].filter(Boolean).join(' · '),
      amount: money(f.cost),
    })),
    ...incidentRows.map((i) => ({
      key: `i${i.id}`, kind: 'Incident', date: i.date, record: i,
      title: `${i.incident_type} · ${i.severity}`, sub: [i.status, i.description].filter(Boolean).join(' · '),
      amount: i.cost ? money(i.cost) : null,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const openEntry = (e) => {
    if (e.kind === 'Service') openForm('service', e.record)
    else if (e.kind === 'Fuel') openForm('fuel', e.record)
    else if (e.kind === 'Incident') openForm('incident', e.record)
    else setRemoveTarget({ kind: 'wash', id: e.record.id, label: `the ${fmtDate(e.record.date)} wash` })
  }

  const preset = { vehicle: vanId }
  const tabs = [
    { key: 'history', label: 'History', count: entries.length },
    { key: 'fuel', label: 'Fuel', count: fills.length },
    { key: 'documents', label: 'Documents' },
    { key: 'details', label: 'Details' },
  ]
  const KINDS = { Services: 'Service', Fuel: 'Fuel', Washes: 'Wash', Incidents: 'Incident' }
  const shown = show === 'All' ? entries : entries.filter((e) => e.kind === KINDS[show])

  return (
    <div>
      <PageHeader
        back={{ href: href('vans'), label: 'All vans' }}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {v.label}
            <StatusBadge status={v.statusBadge} />
          </span>
        }
        description={[v.subtitle || v.rego || 'No rego', v.fuel_type, v.driverName && `driver ${v.driverName}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button icon="incident" onClick={() => openForm('incident', preset)}>Report incident</Button>
            <Button variant="primary" icon="plus" onClick={() => openForm('service', preset)}>Log service for {v.label}</Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Fact label="Odometer">{v.odometer ? km(v.odometer) : '—'}</Fact>
        <Fact
          label="Next service"
          tone={svc && svc.km_left < 0 ? 'due' : svc && svc.km_left < 2000 ? 'warn' : undefined}
          sub={svc ? (svc.km_left < 0 ? serviceText(svc) : `${svc.km_left.toLocaleString()} km to go`) + (svc.booked ? ` · booked ${fmtDate(svc.booked.date)}` : '') : 'no service logged yet'}
        >
          {svc ? km(svc.due_at) : '—'}
        </Fact>
        <Fact label="Last service" sub={lastService ? [lastService.service_type, lastService.cost && Number(lastService.cost) ? money(lastService.cost) : ''].filter(Boolean).join(' · ') : 'none logged yet'}>
          {lastService ? fmtDate(lastService.date) : '—'}
        </Fact>
        <Fact
          label="Fuel use"
          tone={fuelStats?.highUse ? 'warn' : undefined}
          sub={fuelStats?.per100 && fleetAvg ? `fleet average ${fleetAvg}` : 'needs 2+ odometer readings'}
        >
          {fuelStats?.per100 ? `${fuelStats.per100} L/100km${fuelStats.highUse ? ' ▲' : ''}` : '—'}
        </Fact>
      </div>

      {(v.openJob || openIncidents.length > 0) && (
        <div className="mb-5 flex flex-wrap gap-2.5">
          {v.openJob && (
            <button onClick={() => openForm('service', v.openJob)} className="rounded-lg border border-[#bcd5ee] bg-[#eef5fc] px-3.5 py-2 text-left text-[13px] hover:brightness-95">
              <span className="font-semibold text-primary">Open job:</span> {v.openJob.service_type} · {statusWord(v.openJob.status)} · {fmtDate(v.openJob.date)}
            </button>
          )}
          {openIncidents.map((i) => (
            <button key={i.id} onClick={() => openForm('incident', i)} className="rounded-lg border border-[#f5b5b5] bg-due-bg px-3.5 py-2 text-left text-[13px] text-due hover:brightness-95">
              <span className="font-semibold">Open incident:</span> {i.incident_type} · {i.severity} · {fmtDate(i.date)}
            </button>
          ))}
        </div>
      )}

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === 'history' && (
        <Card
          title="History, newest first"
          description="Services, fuel, washes and incidents for this van. Click a line to open it."
          padded={false}
          actions={
            <div className="flex flex-wrap gap-1">
              {['All', 'Services', 'Fuel', 'Washes', 'Incidents'].map((k) => (
                <button
                  key={k}
                  onClick={() => setShow(k)}
                  className={'rounded-md px-2.5 py-1 text-xs font-medium ' + (show === k ? 'bg-primary text-white' : 'bg-white text-off ring-1 ring-line hover:text-ink')}
                >
                  {k}
                </button>
              ))}
            </div>
          }
        >
          <Timeline key={show} entries={shown} onOpen={openEntry} />
        </Card>
      )}

      {tab === 'fuel' && (
        fuelRows.length === 0 ? <Card><Empty>No fuel logged for this van.</Empty></Card> : (
          <div className="grid gap-2">
            <p className="text-[13px] text-off">
              Fill-ups and fuel card charges for this van, newest first.
              {fuelStats && <> Totals: <b className="text-ink">{fuelStats.fills} fill-ups</b>, <b className="text-ink">{Math.round(fuelStats.litres).toLocaleString()} L</b>, <b className="text-ink">{money(fuelStats.cost)}</b> including card fees.</>}
            </p>
            <VanDetail
              fills={fills}
              charges={charges}
              onPick={(f) => openForm('fuel', f)}
              onEdit={(f) => openForm('fuel', f)}
              onDelete={(f) => setRemoveTarget({ kind: 'fuel', id: f.id, label: `the ${fmtDate(f.date)} ${f.isFuel ? 'fill-up' : f.product.toLowerCase()}` })}
            />
          </div>
        )
      )}

      {tab === 'documents' && (
        <Card title="Documents" description="Rego papers, invoices and photos for this van, including files attached to its services and incidents." padded={false}>
          <Documents vehicle={vanId} />
        </Card>
      )}

      {tab === 'details' && (
        <Card title="Van details" description="Registration, identifiers and service settings." actions={
          <div className="flex gap-2">
            <Button variant="danger" icon="trash" className="h-8 text-xs" onClick={() => { setDeleting(true); setDeleteError(null) }}>Delete van</Button>
            <Button variant="primary" icon="edit" className="h-8 text-xs" onClick={() => openForm('vehicle', v)}>Edit details</Button>
          </div>
        }>
          <div className="max-w-[720px]">
            <DetailRow label="Name / make">{v.make}</DetailRow>
            <DetailRow label="Model">{v.model || '—'}</DetailRow>
            <DetailRow label="Year">{v.year || '—'}</DetailRow>
            <DetailRow label="Rego / plate">{v.rego || '—'}</DetailRow>
            <DetailRow label="Vehicle number">{v.vehicle_number || '—'}</DetailRow>
            <DetailRow label="VIN"><span className="font-mono text-xs">{v.vin || '—'}</span></DetailRow>
            <DetailRow label="Fuel type">{v.fuel_type || '—'}</DetailRow>
            <DetailRow label="Fuel card">{v.fuel_card_number || '— (filled in by the first statement import)'}</DetailRow>
            <DetailRow label="Odometer">{v.odometer ? km(v.odometer) : '—'}<KmAsOf van={v} /></DetailRow>
            <DetailRow label="Service interval">every {km(v.service_interval_km || 10000)}</DetailRow>
            <DetailRow label="Tyre interval">{v.tyre_interval_km ? `every ${km(v.tyre_interval_km)}` : 'not set'}</DetailRow>
            <DetailRow label="Next new tyres">{tyre ? `${km(tyre.due_at)} (${serviceText(tyre)})` : v.tyre_interval_km ? 'no tyre change logged yet' : 'tyre interval not set'}</DetailRow>
            <DetailRow label="Rego expiry">{v.rego_expiry ? expiryCell(v.rego_expiry) : 'not entered'}</DetailRow>
            <DetailRow label="Washing">{v.wash_needed ? `Washed in-house every 2 weeks · last ${v.lastWashed ? `${fmtDate(v.lastWashed)} (${fmtAgo(v.lastWashed)})` : 'never logged'}` : 'Not needed (driver takes it home)'}</DetailRow>
            <DetailRow label="Usual driver">{v.driverName || 'No regular driver (set it with Edit details, or Vans → Drivers)'}</DetailRow>
            <DetailRow label="QR sticker page"><a href={`/report/${v.report_token}/`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Open the driver page</a> <span className="text-off">· print stickers on Vans → QR stickers</span></DetailRow>
          </div>
        </Card>
      )}
      {tab === 'details' && (
        <Card className="mt-4" title="Change history" description="Every add, change and delete for this van." padded={false}>
          <ChangeHistory vehicle={vanId} />
        </Card>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete vehicle?"
          message={`Delete ${v.label} (${v.rego || 'no rego'})? This can't be undone.`}
          errorMessage={deleteError}
          confirming={deleteVan.isPending}
          onCancel={() => setDeleting(false)}
          onConfirm={() => deleteVan.mutate()}
        />
      )}
      {removeTarget && (
        <ConfirmDialog
          title="Delete this record?"
          message={`Delete ${removeTarget.label}? This can't be undone.`}
          confirming={removeRecord.isPending}
          onCancel={() => setRemoveTarget(null)}
          onConfirm={() => removeRecord.mutate(removeTarget)}
        />
      )}
    </div>
  )
}

