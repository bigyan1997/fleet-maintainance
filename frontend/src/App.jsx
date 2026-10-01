import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { logout, me } from './api/auth'
import { fetchLinks } from './api/links'
import { LoginPage } from './components/LoginPage'
import { TopBar } from './components/TopBar'
import { Toast } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'
import { HomeView } from './components/HomeView'
import { FleetView } from './components/FleetView'
import { VanPage } from './components/VanPage'
import { HistoryView } from './components/HistoryView'
import { MechanicsView } from './components/MechanicsView'
import { WashesView } from './components/WashesView'
import { IncidentsView } from './components/IncidentsView'
import { FuelView } from './components/FuelView'
import { FuelImport } from './components/FuelImport'
import { ReportsView } from './components/ReportsView'
import { DriversView, QrStickers, RegoDates, TyresView } from './components/VansExtras'
import { VehicleForm } from './components/VehicleForm'
import { ServiceForm } from './components/ServiceForm'
import { IncidentForm } from './components/IncidentForm'
import { FuelForm } from './components/FuelForm'
import { WashForm } from './components/WashForm'
import { FinishJobForm } from './components/FinishJobForm'
import { Icon, Modal } from './components/ui'
import { ActionsContext } from './lib/actions'
import { href, redirect, useRoute } from './lib/router'

// The tabs across the top. The key is also the web address (#/vans/29 is a
// van's page, which lives under the Vans tab).
const TABS = [
  { key: 'home', label: 'Home' },
  { key: 'vans', label: 'Vans' },
  { key: 'services', label: 'Services' },
  { key: 'washes', label: 'Washes' },
  { key: 'fuel', label: 'Fuel' },
  { key: 'reports', label: 'Reports' },
]

// Old addresses (bookmarks) that moved in the simpler layout.
const MOVED = { dashboard: ['home'], alerts: ['home'], incidents: ['services', 'incidents'] }

const SERVICE_TABS = [
  { key: '', label: 'Services' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'mechanics', label: 'Mechanics' },
]

const FLEET_TABS = [
  { key: '', label: 'All vans' },
  { key: 'drivers', label: 'Drivers' },
  { key: 'tyres', label: 'Tyres' },
  { key: 'qr', label: 'QR stickers' },
  { key: 'dates', label: 'Rego & insurance dates' },
]

function useToast() {
  const [toast, setToast] = useState({ message: '', isError: false })
  const timer = useRef(null)
  const show = useCallback((message, isError = false) => {
    setToast({ message, isError })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast({ message: '', isError: false }), 3200)
  }, [])
  return { toast, show }
}

function App() {
  const meQuery = useQuery({ queryKey: ['me'], queryFn: me })

  if (meQuery.isLoading) return null
  if (meQuery.isError || !meQuery.data) return <LoginPage />
  return <MainApp username={meQuery.data.username} />
}

// Forms open as a pop-up over the current tab, so you never lose your place.
function FormModal({ form, onClose, toast }) {
  const common = { onDone: onClose, onSaved: (m) => toast(m), onError: (m) => toast(m, true) }
  if (form.kind === 'fuel-import') return <FuelImport onClose={onClose} />
  const body = {
    service: <ServiceForm service={form.record} {...common} />,
    fuel: <FuelForm fuel={form.record} {...common} />,
    incident: <IncidentForm incident={form.record} {...common} />,
    vehicle: <VehicleForm vehicle={form.record} {...common} />,
    wash: <WashForm wash={form.record} {...common} />,
    finish: <FinishJobForm job={form.record} {...common} />,
  }[form.kind]
  return (
    <Modal onClose={onClose}>
      <div className="relative">
        <button onClick={onClose} className="absolute top-4 right-4 rounded-md p-1.5 text-off hover:bg-[#f1f4f8] hover:text-ink" aria-label="Close">
          <Icon name="close" className="h-4 w-4" />
        </button>
        {body}
      </div>
    </Modal>
  )
}

function SubTabs({ items, value, base }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1">
      {items.map((t) => (
        <a
          key={t.key}
          href={href(base, t.key)}
          className={
            'rounded-md px-3 py-1.5 text-[13px] font-medium no-underline ' +
            (value === t.key ? 'bg-primary text-white' : 'bg-white text-off ring-1 ring-line hover:text-ink')
          }
        >
          {t.label}
        </a>
      ))}
    </div>
  )
}

function MainApp({ username }) {
  const queryClient = useQueryClient()
  const { toast, show } = useToast()
  const linksQuery = useQuery({ queryKey: ['links'], queryFn: fetchLinks, staleTime: Infinity })
  const [form, setForm] = useState(null)
  const path = useRoute()

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(['me'], null)
      queryClient.clear()
    },
  })

  const actions = useMemo(() => ({ openForm: (kind, record) => setForm({ kind, record }), toast: show }), [show])
  const openForm = actions.openForm
  const tab = TABS.some((t) => t.key === path[0]) ? path[0] : 'home'

  useEffect(() => {
    if (path.length === 0) redirect('home')
    else if (MOVED[path[0]]) redirect(...MOVED[path[0]])
  }, [path])

  let page
  if (tab === 'home') {
    page = <HomeView />
  } else if (tab === 'vans' && /^\d+$/.test(path[1] ?? '')) {
    page = <VanPage key={path[1]} id={path[1]} />
  } else if (tab === 'vans') {
    const sub = FLEET_TABS.some((t) => t.key === path[1]) ? path[1] : ''
    page = sub === '' ? (
      <FleetView onAdd={() => openForm('vehicle')} />
    ) : (
      <div>
        <a href={href('vans')} className="mb-3 inline-block text-[13px] font-medium text-primary no-underline hover:underline">‹ All vans</a>
        {sub === 'drivers' && <DriversView />}
        {sub === 'tyres' && <TyresView />}
        {sub === 'qr' && <QrStickers />}
        {sub === 'dates' && <RegoDates />}
      </div>
    )
  } else if (tab === 'services') {
    // #/services, #/services/Booked (a status), #/services/mechanic/3,
    // #/services/mechanics, #/services/incidents
    const byMechanic = path[1] === 'mechanic' ? path[2] : ''
    const subTab = ['mechanics', 'incidents'].includes(path[1]) ? path[1] : ''
    const status = path[1] && path[1] !== 'mechanic' && !subTab ? path[1] : ''
    page = (
      <div>
        <SubTabs items={SERVICE_TABS} value={subTab} base="services" />
        {subTab === 'mechanics' ? (
          <MechanicsView />
        ) : subTab === 'incidents' ? (
          <IncidentsView onEdit={(i) => openForm('incident', i)} onAdd={() => openForm('incident')} />
        ) : (
          <HistoryView
            key={path.join('/')}
            initialStatus={status}
            initialMechanic={byMechanic}
            onEdit={(s) => openForm('service', s)}
            onError={(m) => show(m, true)}
          />
        )}
      </div>
    )
  } else if (tab === 'washes') page = <WashesView onError={(m) => show(m, true)} />
  else if (tab === 'fuel') page = <FuelView onEdit={(f) => openForm('fuel', f)} onAdd={() => openForm('fuel')} />
  else if (tab === 'reports') page = <ReportsView sub={path[1]} />

  return (
    <ActionsContext.Provider value={actions}>
      <div className="min-h-screen bg-paper">
        <UpdateBanner />
        <TopBar username={username} links={linksQuery.data} onLogout={() => logoutMutation.mutate()} />
        <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-8">
          {/* Tabs and the two everyday buttons share one line. */}
          <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line">
            <div className="flex gap-1 overflow-x-auto">
              {TABS.map((t) => (
                <a
                  key={t.key}
                  href={href(t.key)}
                  className={
                    '-mb-px border-b-2 px-3.5 py-2.5 text-[14px] font-medium whitespace-nowrap no-underline ' +
                    (tab === t.key ? 'border-primary text-primary' : 'border-transparent text-off hover:text-ink')
                  }
                >
                  {t.label}
                </a>
              ))}
            </div>
            <div className="flex items-center gap-2 pb-2">
              <button onClick={() => openForm('wash')} className="rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#f5f5f5]">
                Log wash
              </button>
              <button onClick={() => openForm('service')} className="rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-primary-dark">
                + Log service
              </button>
            </div>
          </div>

          {page}
        </div>
      </div>
      {form && <FormModal form={form} onClose={() => setForm(null)} toast={show} />}
      <Toast message={toast.message} isError={toast.isError} />
    </ActionsContext.Provider>
  )
}

export default App
