import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DatabaseZap,
  GitPullRequest,
  RefreshCw,
  Zap,
} from 'lucide-react'
import { fetchReviewDebtAging } from '../api'
import { CoralProofPanel } from './CoralProof'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function ageDays(createdAt: string | null): number {
  if (!createdAt) return 0
  const created = new Date(String(createdAt))
  const now = new Date()
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
}

function ageClass(days: number): string {
  if (days >= 14) return 'rda-age-critical'
  if (days >= 7) return 'rda-age-warn'
  return 'rda-age-ok'
}

function AgeChip({ days }: Readonly<{ days: number }>) {
  return (
    <span className={cx('rda-age-chip', ageClass(days))}>
      <Clock className="h-3 w-3" />
      {days}d
    </span>
  )
}

function errorFillClass(events: number): string {
  if (events > 100) return 'rda-error-fill rda-fill-danger'
  if (events > 10) return 'rda-error-fill rda-fill-warn'
  return 'rda-error-fill rda-fill-ok'
}

function errorLabelClass(events: number): string {
  if (events > 100) return 'rda-label-danger'
  if (events > 10) return 'rda-label-warn'
  return 'rda-label-ok'
}

function ErrorBar({ events, max }: Readonly<{ events: number; max: number }>) {
  const pct = max > 0 ? Math.round((events / max) * 100) : 0
  let fillPct = 'rda-bar-narrow'
  if (pct >= 70) fillPct = 'rda-bar-wide'
  else if (pct >= 30) fillPct = 'rda-bar-mid'
  return (
    <div className="rda-error-bar" title={`${events} error events`}>
      <div className="rda-error-track">
        <div className={cx(errorFillClass(events), fillPct)} />
      </div>
      <span className={errorLabelClass(events)}>{events}</span>
    </div>
  )
}

export default function ReviewDebtAging() {
  const queryClient = useQueryClient()
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['review-debt-aging'],
    queryFn: () => fetchReviewDebtAging(),
    staleTime: 5 * 60_000,
  })

  const prs: any[] = data?.open_debt_prs || []
  const totalOpen: number = data?.total_open_prs || 0
  const prsWithErrors: number = data?.prs_with_live_errors || 0
  const totalErrorEvents: number = data?.total_blocked_error_events || 0
  const proofs: any[] = data?.proofs || []
  const maxErrorEvents = Math.max(...prs.map((r: any) => Number(r.total_error_events || 0)), 1)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rda-header">
        <div className="rda-header-badge">
          <DatabaseZap className="h-4 w-4" />
          <span>GitHub × Sentry</span>
        </div>
        <h2 className="rda-title">Review Debt Aging</h2>
        <p className="rda-desc">
          Open PRs stalled in review while related Sentry errors are actively firing.
          This is the worst possible state: code fixes are already written but stuck waiting
          for review while production breaks. GitHub open PRs joined to Sentry live errors
          by service name — one Coral SQL plan.
        </p>
        <button
          type="button"
          className="soft-btn"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['review-debt-aging'] })}
        >
          <RefreshCw className={cx('h-4 w-4', isFetching && 'spin-icon')} />
          Refresh
        </button>
      </div>

      {/* Summary row */}
      {!isLoading && !error && (
        <div className="rda-summary">
          <div>
            <p>{totalOpen}</p>
            <span>open PRs awaiting review</span>
          </div>
          <div className={prsWithErrors > 0 ? 'rda-stat-danger' : ''}>
            <p>{prsWithErrors}</p>
            <span>PRs with live errors</span>
          </div>
          <div className={totalErrorEvents > 0 ? 'rda-stat-warn' : ''}>
            <p>{totalErrorEvents.toLocaleString()}</p>
            <span>blocked error events</span>
          </div>
          <div>
            <p>{prs.filter((r: any) => ageDays(r.created_at) >= 7).length}</p>
            <span>stalled 7+ days</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="rda-loading">
          <RefreshCw className="h-5 w-5 spin-icon" />
          <p>Running GitHub × Sentry open PR scan...</p>
          <code>github.pulls (open, not draft) LEFT JOIN sentry.issues ON project ILIKE title word</code>
        </div>
      ) : error ? (
        <div className="rda-error">
          <AlertTriangle className="h-5 w-5" />
          <p>Could not load review debt data. Check GitHub and Sentry sources.</p>
        </div>
      ) : prs.length === 0 ? (
        <div className="rda-empty">
          <CheckCircle2 className="h-6 w-6" />
          <p>No open PRs found with stalled review.</p>
          <span>Either all PRs are moving quickly or the repo has no open PRs older than 1 day.</span>
        </div>
      ) : (
        <div className="rda-table">
          <div className="rda-table-head">
            <span>PR</span>
            <span>Author</span>
            <span>Age</span>
            <span>Review comments</span>
            <span>Live errors</span>
            <span>Error events</span>
            <span>Users hit</span>
          </div>
          {prs.map((row: any, i: number) => {
            const days = ageDays(row.created_at)
            const hasErrors = Number(row.total_error_events || 0) > 0
            return (
              <div
                key={i}
                className={cx(
                  'rda-table-row',
                  hasErrors && 'rda-row-danger',
                  !hasErrors && days >= 14 && 'rda-row-stale',
                )}
              >
                <a
                  href={row.pr_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rda-pr-link"
                >
                  <GitPullRequest className="h-3.5 w-3.5" />
                  #{row.pr_number} {row.pr_title}
                </a>
                <span className="rda-author">{row.author}</span>
                <AgeChip days={days} />
                <span className={cx('rda-review-count', row.review_comments === 0 && 'rda-no-review')}>
                  {row.review_comments === 0 ? 'no reviews' : `${row.review_comments} comment${row.review_comments !== 1 ? 's' : ''}`}
                </span>
                <span className={cx('rda-related-errors', hasErrors && 'rda-errors-live')}>
                  {row.related_errors > 0 ? `${row.related_errors} errors` : '—'}
                </span>
                <ErrorBar events={Number(row.total_error_events || 0)} max={maxErrorEvents} />
                <span>{row.users_affected > 0 ? row.users_affected : '—'}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Zero-ETL callout */}
      <div className="rda-zero-etl">
        <Zap className="h-4 w-4" />
        <div>
          <p>Why this can't be seen without Coral</p>
          <span>
            GitHub knows which PRs are open and for how long. Sentry knows which services are
            breaking. No single tool knows which open PRs are blocking fixes for actively broken
            services. Helm joins them live in one Coral SQL plan — zero warehouse, zero ETL.
          </span>
        </div>
      </div>

      {proofs.length > 0 && (
        <CoralProofPanel proofs={proofs} title="Review Debt Aging SQL proof" />
      )}
    </div>
  )
}
