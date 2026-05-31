import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  DatabaseZap,
  GitMerge,
  RefreshCw,
  XCircle,
  Zap,
} from 'lucide-react'
import { fetchCircleCIHealth } from '../api'
import { CoralProofPanel } from './CoralProof'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function pipelineStateIcon(state: string | null) {
  if (!state) return <Circle className="h-3.5 w-3.5 ci-state-none" />
  if (state === 'errored') return <XCircle className="h-3.5 w-3.5 ci-state-error" />
  return <CheckCircle2 className="h-3.5 w-3.5 ci-state-ok" />
}

function fmtDuration(secs: number | null) {
  if (!secs) return '—'
  if (secs < 60) return `${Math.round(secs)}s`
  return `${Math.round(secs / 60)}m ${Math.round(secs % 60)}s`
}

function successFillClass(pct: number): string {
  if (pct >= 90) return 'ci-success-bar-fill ci-fill-good'
  if (pct >= 70) return 'ci-success-bar-fill ci-fill-warn'
  return 'ci-success-bar-fill ci-fill-bad'
}

function successLabelClass(pct: number): string {
  if (pct >= 90) return 'ci-success-bar-label ci-label-good'
  if (pct >= 70) return 'ci-success-bar-label ci-label-warn'
  return 'ci-success-bar-label ci-label-bad'
}

function successBarWidthClass(pct: number): string {
  if (pct >= 90) return 'ci-bar-high'
  if (pct >= 70) return 'ci-bar-mid'
  if (pct >= 40) return 'ci-bar-low'
  return 'ci-bar-min'
}

function SuccessBar({ rate }: Readonly<{ rate: number | null }>) {
  const pct = rate !== null && rate !== undefined ? Math.round(rate * 100) : 0
  return (
    <div className="ci-success-bar-wrap" title={`${pct}% success rate`}>
      <div className="ci-success-bar-track">
        <div className={cx(successFillClass(pct), successBarWidthClass(pct))} />
      </div>
      <span className={successLabelClass(pct)}>{pct}%</span>
    </div>
  )
}

function CIStateBlock({ isLoading, error }: Readonly<{ isLoading: boolean; error: unknown }>) {
  if (isLoading) {
    return (
      <div className="ci-loading">
        <RefreshCw className="h-5 w-5 spin-icon" />
        <p>Running 3-source Coral join...</p>
        <code>github.pulls × circleci.pipelines × sentry.issues — on vcs_revision = head__sha</code>
      </div>
    )
  }
  if (error) {
    return (
      <div className="ci-error">
        <AlertTriangle className="h-5 w-5" />
        <p>Could not load CircleCI data. Check that CIRCLECI_TOKEN and CIRCLECI_PROJECT_SLUG are set.</p>
      </div>
    )
  }
  return null
}

function errorLevelClass(level: string | null): string {
  if (level === 'fatal') return 'ci-fatal'
  return 'ci-error'
}

export default function CircleCIPanel() {
  const queryClient = useQueryClient()
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['circleci-health'],
    queryFn: () => fetchCircleCIHealth(),
    staleTime: 5 * 60_000,
  })

  const summary = data?.summary || {}
  const killerRows: any[] = data?.ci_passed_but_errored || []
  const prRows: any[] = data?.pr_pipeline_status || []
  const workflowRows: any[] = data?.workflow_metrics || []
  const proofs: any[] = data?.proofs || []

  if (data?.fallback) {
    return (
      <div className="space-y-5">
        <div className="ci-fallback">
          <AlertTriangle className="h-5 w-5" />
          <div>
            <p>CircleCI not configured</p>
            <span>{data.fallback_message}</span>
          </div>
        </div>
      </div>
    )
  }

  const stateBlock = <CIStateBlock isLoading={isLoading} error={error} />

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="ci-header">
        <div className="ci-header-badge">
          <DatabaseZap className="h-4 w-4" />
          <span>GitHub × CircleCI × Sentry</span>
        </div>
        <h2 className="ci-title">CI Health &amp; Error Correlation</h2>
        <p className="ci-desc">
          Three live APIs joined in one Coral SQL plan: GitHub merge history, CircleCI pipeline
          coverage, and Sentry error first_seen. Surfaces PRs that passed CI but still introduced
          production errors — the gap no single tool can see.
        </p>
        <button
          type="button"
          className="soft-btn"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['circleci-health'] })}
        >
          <RefreshCw className={cx('h-4 w-4', isFetching && 'spin-icon')} />
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      {!isLoading && !error && (
        <div className="ci-stats">
          <div>
            <p>{summary.total_prs_with_ci ?? 0}</p>
            <span>PRs with CI coverage</span>
          </div>
          <div className={summary.prs_with_errors_despite_ci > 0 ? 'ci-stat-danger' : ''}>
            <p>{summary.prs_with_errors_despite_ci ?? 0}</p>
            <span>passed CI, still errored</span>
          </div>
          <div>
            <p>{summary.total_workflows ?? 0}</p>
            <span>workflows tracked</span>
          </div>
          <div>
            <p>{summary.avg_success_rate !== null && summary.avg_success_rate !== undefined
              ? `${Math.round(summary.avg_success_rate * 100)}%`
              : '—'}
            </p>
            <span>avg success rate</span>
          </div>
        </div>
      )}

      {stateBlock ?? (
        <>
          {/* Killer query: CI passed but errored */}
          <div className="ci-section">
            <div className="ci-section-head">
              <Zap className="h-4 w-4 ci-killer-icon" />
              <div>
                <h3>CI Passed — Still Errored</h3>
                <span>PRs with CircleCI pipeline coverage that introduced Sentry errors within 24h of merge</span>
              </div>
            </div>
            {killerRows.length === 0 ? (
              <div className="ci-empty">
                <CheckCircle2 className="h-5 w-5" />
                <p>No PRs found that passed CI and introduced errors in the last 14 days.</p>
              </div>
            ) : (
              <div className="ci-killer-table">
                <div className="ci-table-head">
                  <span>PR</span>
                  <span>Author</span>
                  <span>Pipeline</span>
                  <span>Error</span>
                  <span>Events</span>
                  <span>Users hit</span>
                </div>
                {killerRows.map((row: any) => (
                  <div key={`${row.pr_number}-${row.error_title}`} className="ci-table-row">
                    <a
                      href={row.pr_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ci-pr-link"
                    >
                      <GitMerge className="h-3.5 w-3.5" />
                      #{row.pr_number} {row.pr_title}
                    </a>
                    <span className="ci-author">{row.author}</span>
                    <span className="ci-state">
                      {pipelineStateIcon(row.pipeline_state)}
                      {row.pipeline_state || 'no pipeline'}
                    </span>
                    <span className={cx('ci-error-title', errorLevelClass(row.level))}>
                      {row.error_title}
                    </span>
                    <span className="ci-count">{row.error_events}</span>
                    <span className="ci-count">{row.users_affected ?? '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Workflow metrics */}
          {workflowRows.length > 0 && (
            <div className="ci-section">
              <div className="ci-section-head">
                <h3>Workflow Health</h3>
                <span>Success rates and duration percentiles across all configured workflows</span>
              </div>
              <div className="ci-workflow-table">
                <div className="ci-table-head ci-workflow-head">
                  <span>Workflow</span>
                  <span>Success rate</span>
                  <span>Total runs</span>
                  <span>Failed</span>
                  <span>p50</span>
                  <span>p95</span>
                </div>
                {workflowRows.map((row: any) => (
                  <div key={row.workflow_name} className="ci-table-row ci-workflow-row">
                    <span className="ci-workflow-name">{row.workflow_name}</span>
                    <SuccessBar rate={row.success_rate} />
                    <span>{row.total_runs ?? '—'}</span>
                    <span className={row.failed_runs > 0 ? 'ci-count-warn' : ''}>{row.failed_runs ?? '—'}</span>
                    <span>{fmtDuration(row.p50_duration_secs)}</span>
                    <span>{fmtDuration(row.p95_duration_secs)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PR pipeline coverage table */}
          {prRows.length > 0 && (
            <div className="ci-section">
              <div className="ci-section-head">
                <h3>PR Pipeline Coverage (14 days)</h3>
                <span>Recent merged PRs and their CircleCI pipeline state</span>
              </div>
              <div className="ci-pr-table">
                <div className="ci-table-head ci-pr-head">
                  <span>PR</span>
                  <span>Author</span>
                  <span>Merged</span>
                  <span>CI state</span>
                </div>
                {prRows.map((row: any) => (
                  <div key={row.pr_number} className="ci-table-row ci-pr-row">
                    <a
                      href={row.pr_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ci-pr-link"
                    >
                      #{row.pr_number} {row.pr_title}
                    </a>
                    <span>{row.author}</span>
                    <span className="ci-ts">{row.merged_at ? String(row.merged_at).slice(0, 10) : '—'}</span>
                    <span className="ci-state-cell">
                      {pipelineStateIcon(row.pipeline_state)}
                      {row.pipeline_state || 'no CI'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Zero-ETL callout */}
      <div className="ci-zero-etl">
        <Zap className="h-4 w-4" />
        <div>
          <p>Why this doesn't exist in CI dashboards</p>
          <span>
            CircleCI only knows pipeline pass/fail. Sentry only knows error time. GitHub only knows merge time.
            Helm joins all three in one Coral SQL plan — commit SHA bridges GitHub to CircleCI, merge timestamp
            bridges GitHub to Sentry. Zero ETL, zero pipeline.
          </span>
        </div>
      </div>

      {proofs.length > 0 && (
        <CoralProofPanel proofs={proofs} title="CircleCI × GitHub × Sentry SQL proofs" />
      )}
    </div>
  )
}
