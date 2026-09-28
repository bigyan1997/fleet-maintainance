import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { logout, me } from './api/auth'
import { fetchLinks } from './api/links'
import { LoginPage } from './components/LoginPage'
import { TopBar } from './components/TopBar'
import { Toast } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'
import { DashboardView } from './components/DashboardView'
import { FleetView } from './components/FleetView'
import { VehicleForm } from './components/VehicleForm'
import { HistoryView } from './components/HistoryView'
import { ServiceForm } from './components/ServiceForm'
import { AlertsView } from './components/AlertsView'
import { IncidentsView } from './components/IncidentsView'
import { IncidentForm } from './components/IncidentForm'
import { FuelView } from './components/FuelView'
import { FuelForm } from './components/FuelForm'
import { AnalyticsView } from './components/AnalyticsView'
import { ExportView } from './components/ExportView'

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'fleet', label: 'Fleet' },
  { key: 'history', label: 'History' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'fuel', label: 'Fuel' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'log-service', label: 'Log service' },
  { key: 'export', label: 'Export' },
]

function useToast() {
  const [toast, setToast] = useState({ message: '', isError: false })
  const show = (message, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast({ message: '', isError: false }), 3200)
  }
  return { toast, show }
}

function App() {
  const meQuery = useQuery({ queryKey: ['me'], queryFn: me })

  if (meQuery.isLoading) return null
  if (meQuery.isError || !meQuery.data) return <LoginPage />
  return <MainApp username={meQuery.data.username} />
}

function MainApp({ username }) {
  const queryClient = useQueryClient()
  const { toast, show } = useToast()
  const linksQuery = useQuery({ queryKey: ['links'], queryFn: fetchLinks, staleTime: Infinity })

  const [activeTab, setActiveTab] = useState('dashboard')
  const [editingVehicle, setEditingVehicle] = useState(null) // vehicle object, or null for "add"
  const [editingService, setEditingService] = useState(null)
  const [editingIncident, setEditingIncident] = useState(null)
  const [editingFuel, setEditingFuel] = useState(null)

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(['me'], null)
      queryClient.clear()
    },
  })

  const goToTab = (tab) => setActiveTab(tab)

  const openAddVehicle = () => {
    setEditingVehicle(undefined) // undefined = "add new" (distinct from null = "not on this view")
    setActiveTab('add-vehicle')
  }
  const openEditVehicle = (vehicle) => {
    setEditingVehicle(vehicle)
    setActiveTab('add-vehicle')
  }
  const openLogService = () => {
    setEditingService(undefined)
    setActiveTab('log-service')
  }
  const openEditService = (service) => {
    setEditingService(service)
    setActiveTab('log-service')
  }
  const openLogIncident = () => {
    setEditingIncident(undefined)
    setActiveTab('log-incident')
  }
  const openEditIncident = (incident) => {
    setEditingIncident(incident)
    setActiveTab('log-incident')
  }
  const openLogFuel = () => {
    setEditingFuel(undefined)
    setActiveTab('log-fuel')
  }
  const openEditFuel = (fuel) => {
    setEditingFuel(fuel)
    setActiveTab('log-fuel')
  }

  return (
    <div className="min-h-screen bg-paper">
      <UpdateBanner />
      <TopBar username={username} links={linksQuery.data} onLogout={() => logoutMutation.mutate()} />
      <div className="mx-auto max-w-[1100px] px-4 py-6">
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">Fleet Maintenance</h1>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={openAddVehicle} className="rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#f5f5f5]">
              + Add vehicle
            </button>
            <button onClick={openLogIncident} className="rounded-md border border-[#fca5a5] bg-white px-3.5 py-1.5 text-[13px] font-medium text-due hover:bg-due-bg">
              Log incident
            </button>
            <button onClick={openLogFuel} className="rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#f5f5f5]">
              Log fuel
            </button>
            <button onClick={openLogService} className="rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-primary-dark">
              + Log service
            </button>
          </div>
        </div>

        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => goToTab(t.key)}
              className={
                'whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] font-medium ' +
                (activeTab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-off hover:text-ink')
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' && <DashboardView onOpenService={openEditService} onGoTo={goToTab} />}

        {activeTab === 'fleet' && <FleetView onEdit={openEditVehicle} onAdd={openAddVehicle} />}
        {activeTab === 'add-vehicle' && (
          <VehicleForm
            vehicle={editingVehicle}
            onDone={() => {
              setEditingVehicle(null)
              setActiveTab('fleet')
            }}
            onSaved={(msg) => show(msg)}
            onError={(msg) => show(msg, true)}
          />
        )}

        {activeTab === 'history' && <HistoryView onEdit={openEditService} />}
        {activeTab === 'log-service' && (
          <ServiceForm
            service={editingService}
            onDone={(goHistory) => {
              setEditingService(null)
              setActiveTab(goHistory ? 'history' : 'log-service')
            }}
            onSaved={(msg) => show(msg)}
            onError={(msg) => show(msg, true)}
          />
        )}

        {activeTab === 'alerts' && <AlertsView />}

        {activeTab === 'incidents' && <IncidentsView onEdit={openEditIncident} onAdd={openLogIncident} />}
        {activeTab === 'log-incident' && (
          <IncidentForm
            incident={editingIncident}
            onDone={(goList) => {
              setEditingIncident(null)
              setActiveTab(goList ? 'incidents' : 'incidents')
            }}
            onSaved={(msg) => show(msg)}
            onError={(msg) => show(msg, true)}
          />
        )}

        {activeTab === 'fuel' && <FuelView onEdit={openEditFuel} onAdd={openLogFuel} />}
        {activeTab === 'log-fuel' && (
          <FuelForm
            fuel={editingFuel}
            onDone={() => {
              setEditingFuel(null)
              setActiveTab('fuel')
            }}
            onSaved={(msg) => show(msg)}
            onError={(msg) => show(msg, true)}
          />
        )}

        {activeTab === 'analytics' && <AnalyticsView />}
        {activeTab === 'export' && <ExportView />}
      </div>
      <Toast message={toast.message} isError={toast.isError} />
    </div>
  )
}

export default App
