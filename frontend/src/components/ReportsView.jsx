import { navigate } from '../lib/router'
import { AnalyticsView } from './AnalyticsView'
import { ExportView } from './ExportView'
import { BudgetView, FuelTrends, WeeklyEmail } from './ReportsExtras'
import { Tabs } from './ui'

export function ReportsView({ sub }) {
  const tab = ['trends', 'budget', 'weekly', 'downloads'].includes(sub) ? sub : 'analytics'
  return (
    <div>
      <Tabs
        items={[
          { key: 'analytics', label: 'Analytics' },
          { key: 'trends', label: 'Fuel trends' },
          { key: 'budget', label: 'Budget vs actual' },
          { key: 'weekly', label: 'Weekly email' },
          { key: 'downloads', label: 'Downloads (Excel / CSV)' },
        ]}
        value={tab}
        onChange={(k) => (k === 'analytics' ? navigate('reports') : navigate('reports', k))}
      />
      {tab === 'analytics' && <AnalyticsView />}
      {tab === 'trends' && <FuelTrends />}
      {tab === 'budget' && <BudgetView />}
      {tab === 'weekly' && <WeeklyEmail />}
      {tab === 'downloads' && <ExportView />}
    </div>
  )
}
