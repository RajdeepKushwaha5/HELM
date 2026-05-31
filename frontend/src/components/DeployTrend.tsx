import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DatabaseZap, RefreshCw } from 'lucide-react'
import { fetchDeployWeekly } from '../api'
import { CoralProofPanel } from './CoralProof'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export default function DeployTrend() {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['deployWeekly'],
    queryFn: () => fetchDeployWeekly(),
    staleTime: 10 * 60_000,
  })

  const rows: any[] = data?.data || []

  const chartData = rows.map((r: any) => ({
    month: String(r.year_month || ''),
    deploys: Number(r.deploys || 0),
    new_errors: Number(r.new_errors || 0),
    fatal_errors: Number(r.fatal_errors || 0),
    active_authors: Number(r.active_authors || 0),
  }))

  const totalDeploys = rows.reduce((s: number, r: any) => s + Number(r.deploys || 0), 0)
  const totalErrors  = rows.reduce((s: number, r: any) => s + Number(r.new_errors || 0), 0)
  const totalFatal   = rows.reduce((s: number, r: any) => s + Number(r.fatal_errors || 0), 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="dt-header">
        <div className="dt-header-badge">
          <DatabaseZap className="h-4 w-4" />
          <span>GitHub × Sentry · Monthly Aggregate</span>
        </div>
        <h2 className="dt-title">Deploy Frequency vs Error Introduction Rate</h2>
        <p className="dt-desc">
          One DataFusion plan joins two independent live time series: GitHub deploy cadence
          (PR merges per month) and Sentry error introduction rate, grouped by calendar month.
          Neither API exposes both series. Coral computes this in a single SQL round-trip.
        </p>
        <button type="button" className="soft-btn" onClick={() => refetch()}>
          <RefreshCw className={cx('h-4 w-4', isFetching && 'spin-icon')} />
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      {!isLoading && !error && rows.length > 0 && (
        <div className="dt-stats">
          <div><p>{totalDeploys}</p><span>deploys (6 months)</span></div>
          <div><p>{totalErrors}</p><span>new Sentry errors</span></div>
          <div><p>{totalFatal}</p><span>fatal errors</span></div>
          <div>
            <p>{totalDeploys > 0 ? (totalErrors / totalDeploys).toFixed(1) : '—'}</p>
            <span>errors per deploy</span>
          </div>
        </div>
      )}

      {/* Chart */}
      {isLoading ? (
        <div className="dt-loading">
          <RefreshCw className="h-5 w-5 spin-icon" />
          <p>Running GitHub × Sentry temporal aggregate...</p>
          <code>github.pulls LEFT JOIN sentry.issues ON 24h window, grouped by month</code>
        </div>
      ) : error ? (
        <div className="dt-error">
          <p>Could not load deploy trend data. Check GitHub and Sentry sources.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="dt-empty">
          <p>No deployment data found in the last 6 months.</p>
          <span>The Coral JOIN ran successfully but returned no rows.</span>
        </div>
      ) : (
        <div className="dt-chart-wrap">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
                formatter={(value: any, name: string) => [value, name.replace(/_/g, ' ')]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="deploys" name="deploys" fill="#3b82f6" opacity={0.85} radius={[3, 3, 0, 0]} />
              <Bar yAxisId="left" dataKey="new_errors" name="new errors" fill="#f59e0b" opacity={0.75} radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="fatal_errors" name="fatal errors" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="dt-chart-note">
            Bars: deploy count and new error count per month (left axis).
            Line: fatal errors per month (right axis).
            NOT EXISTS causality filter ensures each error is attributed to its nearest preceding PR only.
          </p>
        </div>
      )}

      {/* Monthly table */}
      {rows.length > 0 && (
        <div className="dt-table">
          <div className="dt-table-head">
            <span>Month</span>
            <span>Deploys</span>
            <span>New errors</span>
            <span>Fatal</span>
            <span>Error / deploy</span>
            <span>Authors</span>
          </div>
          {chartData.map((row) => (
            <div key={row.month} className="dt-table-row">
              <span>{row.month}</span>
              <b>{row.deploys}</b>
              <span className={row.new_errors > 0 ? 'dt-cell-warn' : ''}>{row.new_errors}</span>
              <span className={row.fatal_errors > 0 ? 'dt-cell-fatal' : ''}>{row.fatal_errors}</span>
              <span>{row.deploys > 0 ? (row.new_errors / row.deploys).toFixed(1) : '—'}</span>
              <span>{row.active_authors}</span>
            </div>
          ))}
        </div>
      )}

      {data?.proofs && <CoralProofPanel proofs={data.proofs} title="Deploy trend SQL proof" />}
    </div>
  )
}
