import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Zap,
  XCircle,
  Clock,
  Cpu,
  Circle,
} from 'lucide-react'
import { fetchTokenROI } from '../api'
import { CoralProofPanel } from './CoralProof'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function fmtUSD(val: number | null | undefined) {
  if (val == null) return '—'
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`
  return `$${val.toFixed(2)}`
}

function fmtTokens(val: number | null | undefined) {
  if (val == null) return '—'
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1000) return `${(val / 1000).toFixed(0)}K`
  return `${val}`
}

type WasteFlag = 'orphan' | 'loop' | 'model_mismatch'

function ScoreRing({ score, status }: Readonly<{ score: number; status: string }>) {
  const circumference = 2 * Math.PI * 40
  const filled = (score / 100) * circumference

  return (
    <div className="troi-score-ring-wrap">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="40"
          className={`troi-ring-arc troi-ring-arc-${status}`}
          fill="none"
          strokeWidth="8"
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="round"
        />
      </svg>
      <div className="troi-score-inner">
        <span className={`troi-score-num troi-score-num-${status}`}>{score}</span>
        <span className="troi-score-label">/100</span>
      </div>
    </div>
  )
}

function StatusBadge({ status }: Readonly<{ status: string }>) {
  if (status === 'linked' || status === 'completed') return <span className="troi-badge troi-badge-green"><CheckCircle2 className="h-3 w-3" />Linked to Linear</span>
  if (status === 'in_progress') return <span className="troi-badge troi-badge-yellow"><Clock className="h-3 w-3" />In Progress</span>
  if (status === 'cancelled') return <span className="troi-badge troi-badge-gray"><XCircle className="h-3 w-3" />Cancelled</span>
  return <span className="troi-badge troi-badge-red"><Circle className="h-3 w-3" />Orphan</span>
}

function WasteChip({ flag }: Readonly<{ flag: WasteFlag }>) {
  const labels: Record<WasteFlag, string> = { orphan: 'Orphan', loop: 'Loop Waste', model_mismatch: 'Model Mismatch' }
  return <span className="troi-waste-chip">{labels[flag] ?? flag}</span>
}

export default function TokenROI() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'attribution' | 'loops' | 'mismatches' | 'orphans'>('attribution')
  const [showProofs, setShowProofs] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['token-roi'],
    queryFn: () => fetchTokenROI(),
    retry: false,
    staleTime: 60_000,
  })

  async function handleRefresh() {
    setRefreshing(true)
    await qc.invalidateQueries({ queryKey: ['token-roi'] })
    setRefreshing(false)
  }

  const roi = data?.roi
  const attribution: any[] = data?.attribution ?? []
  const loops: any[] = data?.loop_waste ?? []
  const mismatches: any[] = data?.model_mismatches ?? []
  const orphans: any[] = data?.orphan_spend ?? []
  const proofs: any[] = data?.proofs ?? []
  const emptyProject: boolean = data?.empty_project ?? false
  const langfuseConnected: boolean = data?.langfuse_connected ?? false
  const demoMode: boolean = data?.demo_mode ?? true

  const scoreStatus = roi?.status ?? 'no_data'

  return (
    <div className="troi-shell">
      {/* ── Header ── */}
      <div className="troi-header">
        <div className="troi-header-left">
          <div className="troi-eyebrow">
            <TrendingDown className="h-3.5 w-3.5" />
            <span>Langfuse × Linear × Sentry — AI spend attribution</span>
            {!isLoading && (
              emptyProject ? (
                <span className="troi-demo-pill" style={{ background: 'rgba(15, 118, 110, 0.12)', color: 'var(--green-2)', borderColor: 'rgba(15, 118, 110, 0.3)' }}>CONNECTED (0 TRACES)</span>
              ) : demoMode ? (
                <span className="troi-demo-pill">DEMO</span>
              ) : null
            )}
          </div>
            <h1 className="troi-title">Token ROI Score</h1>
          <p className="troi-subtitle">
            Every dollar your team spends on AI tokens — attributed to a shipped feature,
            an open ticket, or flagged as waste. Powered by Coral.
          </p>
        </div>
        <button
          type="button"
          className="troi-refresh-btn"
          onClick={handleRefresh}
          disabled={isLoading || refreshing}
        >
          <RefreshCw className={cx('h-3.5 w-3.5', (isLoading || refreshing) && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* ── Loading / Error ── */}
      {isLoading && (
        <div className="troi-loading">
          <Zap className="h-5 w-5 animate-pulse" />
          Running Langfuse × Linear × Sentry Coral queries…
        </div>
      )}
      {error && (
        <div className="troi-error">
          <AlertTriangle className="h-4 w-4" />
          {String(error)}
        </div>
      )}

      {data && (
        <>
          {emptyProject && (
            <div className="troi-connection-notice">
              <Zap className="h-4 w-4 troi-notice-icon animate-pulse" />
              <div className="troi-notice-content">
                <strong>Langfuse Connected!</strong>
                <span>
                  Coral queried Langfuse successfully, but found <strong>0 live traces</strong>. 
                  We're showing curated demo data below so you can preview the dashboard. 
                  Start tracing your AI agent's LLM calls to see your real token ROI!
                </span>
              </div>
            </div>
          )}

          {/* ── ROI Score + KPIs ── */}
          <div className="troi-kpi-row">
            <div className="troi-score-card">
              <ScoreRing score={roi?.score ?? 0} status={scoreStatus} />
              <div className="troi-score-meta">
                <span className={`troi-score-status troi-score-status-${scoreStatus}`}>
                  {scoreStatus === 'healthy' ? '✅ Healthy' : scoreStatus === 'warning' ? '⚠ Warning' : '🔴 Critical'}
                </span>
                <span className="troi-score-desc">Token ROI Score</span>
                {roi?.breakdown && (
                  <div className="troi-breakdown">
                    <div className="troi-bd-row"><span>Attribution</span><span>{roi.breakdown.attribution}/40</span></div>
                    <div className="troi-bd-row"><span>Orphan penalty</span><span>{roi.breakdown.orphan_penalty}/30</span></div>
                    <div className="troi-bd-row"><span>Loop efficiency</span><span>{roi.breakdown.loop_efficiency}/20</span></div>
                    <div className="troi-bd-row"><span>Model match</span><span>{roi.breakdown.model_optimisation}/10</span></div>
                  </div>
                )}
              </div>
            </div>

            <div className="troi-kpi-grid">
              <div className="troi-kpi">
                <DollarSign className="h-4 w-4 troi-kpi-icon" />
                <span className="troi-kpi-value">{fmtUSD(roi?.total_cost_usd)}</span>
                <span className="troi-kpi-label">7-day AI spend</span>
              </div>
              <div className="troi-kpi troi-kpi-warn">
                <AlertTriangle className="h-4 w-4 troi-kpi-icon" />
                <span className="troi-kpi-value">{fmtUSD(roi?.total_waste_usd)}</span>
                <span className="troi-kpi-label">Detected waste</span>
              </div>
              <div className="troi-kpi troi-kpi-good">
                <TrendingUp className="h-4 w-4 troi-kpi-icon" />
                <span className="troi-kpi-value">{fmtUSD(roi?.potential_saving_weekly)}</span>
                <span className="troi-kpi-label">Weekly saving potential</span>
              </div>
              <div className="troi-kpi">
                <Cpu className="h-4 w-4 troi-kpi-icon" />
                <span className="troi-kpi-value">{fmtTokens(attribution.reduce((s: number, r: any) => s + (r.tokens_burned ?? 0), 0))}</span>
                <span className="troi-kpi-label">Tokens burned (7d)</span>
              </div>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="troi-tabs">
            {([ ['attribution', 'Attribution', attribution.length],
               ['loops',       'Loop Waste',   loops.length],
               ['mismatches',  'Model Mismatch', mismatches.length],
               ['orphans',     'Orphan Spend',  orphans.length],
            ] as const).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                className={cx('troi-tab', tab === id && 'troi-tab-active')}
                onClick={() => setTab(id)}
              >
                {label}
                {count > 0 && <span className="troi-tab-count">{count}</span>}
              </button>
            ))}
          </div>

          {/* ── Attribution Table ── */}
          {tab === 'attribution' && (
            <div className="troi-table-wrap">
              <table className="troi-table">
                <thead>
                  <tr>
                    <th>AI Operation</th>
                    <th>Team</th>
                    <th>Cost (7d)</th>
                    <th>Tokens</th>
                    <th>Traces</th>
                    <th>Linked Feature</th>
                    <th>Status</th>
                    <th>Owner</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {attribution.map((row: any, i: number) => (
                    <tr key={i} className={cx('troi-tr', (row.waste_flags?.length > 0 || !row.linked_feature) && 'troi-tr-waste')}>
                      <td>
                        <span className="troi-op-name">{row.ai_operation}</span>
                        {(row.waste_flags ?? []).map((f: WasteFlag) => <WasteChip key={f} flag={f} />)}
                      </td>
                      <td className="troi-muted">{row.team ?? '—'}</td>
                      <td className="troi-cost">{fmtUSD(row.total_cost_usd)}</td>
                      <td className="troi-muted">{fmtTokens(row.tokens_burned)}</td>
                      <td className="troi-muted">{row.trace_count ?? '—'}</td>
                      <td>{row.linked_feature ?? <span className="troi-no-ticket">No ticket</span>}</td>
                      <td><StatusBadge status={row.feature_status} /></td>
                      <td className="troi-muted">{row.feature_owner ?? '—'}</td>
                      <td className={cx(row.production_errors > 0 && 'troi-errors')}>
                        {row.production_errors ?? 0}
                      </td>
                    </tr>
                  ))}
                  {attribution.length === 0 && (
                    <tr><td colSpan={9} className="troi-empty">No attribution data — add Langfuse traces with metadata.linearId</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Loop Waste ── */}
          {tab === 'loops' && (
            <div className="troi-waste-list">
              {loops.length === 0 && <div className="troi-empty-state">No loop waste detected in the last 24 hours.</div>}
              {loops.map((row: any, i: number) => (
                <div key={i} className="troi-waste-card troi-waste-card-loop">
                  <div className="troi-wc-header">
                    <span className="troi-wc-name">{row.operation}</span>
                    <span className="troi-wc-cost troi-cost">{fmtUSD(row.wasted_cost_usd)}</span>
                  </div>
                  <div className="troi-wc-meta">
                    <span><Clock className="h-3 w-3" />{row.loop_iterations} iterations</span>
                    <span><Cpu className="h-3 w-3" />{fmtTokens(row.avg_tokens_per_trace)} avg tokens</span>
                    <span className="troi-muted">{row.session_id}</span>
                  </div>
                  <p className="troi-wc-hint">
                    Agent looped {row.loop_iterations}× in one session — add an early exit condition to stop runaway reasoning.
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── Model Mismatches ── */}
          {tab === 'mismatches' && (
            <div className="troi-waste-list">
              {mismatches.length === 0 && <div className="troi-empty-state">No model mismatches detected.</div>}
              {mismatches.map((row: any, i: number) => (
                <div key={i} className="troi-waste-card troi-waste-card-model">
                  <div className="troi-wc-header">
                    <span className="troi-wc-name">{row.operation}</span>
                    <span className="troi-wc-cost troi-cost">{fmtUSD(row.potential_weekly_saving_usd)}/wk saving</span>
                  </div>
                  <div className="troi-wc-meta">
                    <span>Using <strong>{row.current_model}</strong></span>
                    <span>{fmtTokens(row.avg_tokens)} avg tokens</span>
                    <span>{row.calls_7d} calls/week</span>
                    <span className="troi-muted">{fmtUSD(row.total_7d_cost_usd)} this week</span>
                  </div>
                  <p className="troi-wc-hint">
                    {Math.round(row.avg_tokens ?? 0)}-token average — switch to <strong>claude-haiku-4</strong> for ~80% cost reduction.
                    Estimated equivalent: {fmtUSD(row.haiku_equivalent_cost_usd)}/week.
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── Orphan Spend ── */}
          {tab === 'orphans' && (
            <div className="troi-waste-list">
              {orphans.length === 0 && <div className="troi-empty-state">No orphan spend detected — all operations are linked to tickets.</div>}
              {orphans.map((row: any, i: number) => (
                <div key={i} className="troi-waste-card troi-waste-card-orphan">
                  <div className="troi-wc-header">
                    <span className="troi-wc-name">{row.operation}</span>
                    <span className="troi-wc-cost troi-cost">{fmtUSD(row.orphan_spend_7d_usd)}</span>
                  </div>
                  <div className="troi-wc-meta">
                    <span>{row.trace_count} traces</span>
                    <span>{fmtTokens(row.orphan_tokens_7d)} tokens</span>
                    <span className="troi-muted">{row.team ?? 'No team'}</span>
                  </div>
                  <p className="troi-wc-hint">
                    No linked Linear ticket. Add <code>metadata.linearId</code> to your Langfuse traces to attribute this spend.
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── Coral Proof ── */}
          <div className="troi-proof-toggle">
            <button type="button" className="troi-proof-btn" onClick={() => setShowProofs(p => !p)}>
              {showProofs ? 'Hide' : 'Show'} Coral SQL proofs ({proofs.length})
            </button>
          </div>
          {showProofs && proofs.length > 0 && (
            <CoralProofPanel proofs={proofs} title="Token ROI — Coral SQL proofs" />
          )}

          {/* ── Source note ── */}
          <div className="troi-source-note">
            {emptyProject
              ? '✅ Connected to Langfuse — 0 traces found. Showing demo data to illustrate layout.'
              : demoMode
              ? '⚡ Demo mode — set LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY in .env to switch to live data'
              : '✅ Live — Langfuse × Linear × Sentry joined by Coral in one SQL plan'}
          </div>
        </>
      )}
    </div>
  )
}
