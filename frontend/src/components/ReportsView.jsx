import { href, navigate } from '../lib/router'
import { AnalyticsView } from './AnalyticsView'
import { ExportView } from './ExportView'
import { BudgetView, FuelTrends } from './ReportsExtras'
import { Tabs } from './ui'

const TABS = [
  { key: 'spending', label: 'Spending' },
  { key: 'fuel', label: 'Fuel' },
  { key: 'tolls', label: 'Tolls' },
  { key: 'budget', label: 'Budget' },
]

export function ReportsView({ sub }) {
  if (sub === 'downloads') {
    return (
      <div>
        <a href={href('reports')} className="mb-3 inline-block text-[13px] font-medium text-primary no-underline hover:underline">‹ Back to reports</a>
        <ExportView />
      </div>
    )
  }
  const tab = TABS.some((t) => t.key === sub) ? sub : 'spending'
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Tabs items={TABS} value={tab} onChange={(k) => (k === 'spending' ? navigate('reports') : navigate('reports', k))} />
        </div>
        <a href={href('reports', 'downloads')} className="rounded-md border border-line bg-white px-3 py-1.5 text-[13px] font-medium text-ink no-underline hover:bg-[#f5f5f5]">
          Download (Excel / CSV)
        </a>
      </div>
      {tab === 'spending' && <AnalyticsView key="spending" section="spending" />}
      {tab === 'fuel' && (
        <>
          <AnalyticsView key="fuel" section="fuel" />
          <div className="mt-4">
            <FuelTrends />
          </div>
        </>
      )}
      {tab === 'tolls' && <AnalyticsView key="tolls" section="tolls" />}
      {tab === 'budget' && <BudgetView />}
    </div>
  )
}
