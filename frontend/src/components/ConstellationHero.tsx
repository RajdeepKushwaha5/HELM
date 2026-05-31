import { AlertTriangle, ArrowRight, ChevronDown, ExternalLink, GitPullRequest, Loader2, MessageSquare, Shield, Zap } from 'lucide-react'
import { useState } from 'react'
import { SourceLogo } from './BrandMarks'
import { SqlBlock } from './CoralProof'

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ')
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 70 ? 'ch-score-high' :
    score >= 40 ? 'ch-score-med'  : 'ch-score-low'
  return (
    <span className={cx('ch-score', cls)}>
      {score}<span className="ch-score-denom">/100</span>
    </span>
  )
}

function SourceHop({ source, label, sub, danger, inactive }: { source: string; label: string; sub?: string; danger?: boolean; inactive?: boolean }) {
  return (
    <div className={cx('ch-hop', danger && 'ch-hop-danger', inactive && 'ch-hop-inactive')}>
      <SourceLogo source={source} className="h-3 w-3 ch-hop-logo" />
      <div className="ch-hop-text">
        <span className="ch-hop-label">{label}</span>
        {sub && !inactive && <span className="ch-hop-sub">{sub}</span>}
      </div>
    </div>
  )
}

function ChainRow({ row, idx, onClick }: { row: any; idx: number; onClick: () => void }) {
  const score = Number(row.evidence_score ?? 0)
  const isFatal = row.severity === 'fatal' || row.level === 'fatal'
  const hasIncident = Boolean(row.incident_id)
  const slackMsgs = Number(row.slack_messages ?? 0)

  const mergedAt = row.merged_at ? new Date(row.merged_at.slice(0, 19)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
  const errorEvents = Number(row.error_events ?? row.times_seen ?? 0).toLocaleString()
  const service = row.service || row.sentry_project || ''
  const urgency = row.urgency || ''

  return (
    <div className={cx('ch-chain', idx === 0 && 'ch-chain-top')} style={{ animationDelay: `${idx * 80}ms` }}>
      <div className="ch-chain-header" onClick={onClick}>
        <ScoreBadge score={score} />
        <div className="ch-chain-title">
          <div className="ch-chain-top-row">
            <span className="ch-chain-pr">PR #{row.pr_number}</span>
            <span className="ch-chain-name">{row.pr_title || row.error_title}</span>
          </div>
          <div className="ch-chain-bottom-row">
            {row.author && <span className="ch-chain-author">@{row.author}</span>}
            {mergedAt && <span className="ch-chain-time">{mergedAt}</span>}
          </div>
        </div>
      </div>

      <div className="ch-chain-flow">
        <SourceHop
          source="github"
          label={`PR #${row.pr_number}`}
          sub={row.pr_title?.slice(0, 30)}
        />
        <ArrowRight className="ch-arrow" />
        <SourceHop
          source="sentry"
          label={isFatal ? 'fatal error' : 'error'}
          sub={`${errorEvents} events`}
          danger={isFatal}
        />
        <ArrowRight className="ch-arrow" />
        <SourceHop
          source="pagerduty"
          label={hasIncident ? (urgency || 'incident') : 'no incident'}
          sub={hasIncident ? (service.slice(0, 20) || 'service') : undefined}
          danger={hasIncident && urgency === 'high'}
          inactive={!hasIncident}
        />
        <ArrowRight className="ch-arrow" />
        <SourceHop
          source="slack"
          label={slackMsgs > 0 ? `${slackMsgs} msgs` : 'no signal'}
          sub={slackMsgs > 0 ? '4h window' : undefined}
          danger={slackMsgs >= 5}
          inactive={slackMsgs === 0}
        />
      </div>
    </div>
  )
}

interface Props {
  data?: any
  isLoading?: boolean
  onViewFull?: () => void
}

export default function ConstellationHero({ data, isLoading, onViewFull }: Props) {
  const [proofOpen, setProofOpen] = useState(false)

  if (isLoading && !data) {
    return (
      <section className="ch-container ch-loading">
        <div className="ch-top-bar">
          <div className="ch-top-left">
            <Zap className="h-4 w-4 ch-hero-icon" />
            <span className="ch-hero-title">Live Incident Intelligence</span>
            <div className="ch-source-pills">
              {['github','sentry','pagerduty','slack'].map(s => (
                <span key={s} className="ch-source-pill ch-source-pill-loading">
                  <SourceLogo source={s} className="h-3 w-3" />
                </span>
              ))}
            </div>
          </div>
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        </div>
        <p className="ch-loading-label">Running 4-source Coral JOIN across GitHub × Sentry × PagerDuty × Slack…</p>
        <div className="ch-skeleton-rows">
          {[0,1,2].map(i => <div key={i} className="ch-skeleton-row ch-shimmer" style={{ animationDelay: `${i*120}ms` }} />)}
        </div>
      </section>
    )
  }

  if (!data) {
    return (
      <section className="ch-container ch-empty-state">
        <div className="ch-top-bar">
          <div className="ch-top-left">
            <Zap className="h-4 w-4 ch-hero-icon" />
            <span className="ch-hero-title">Live Incident Intelligence</span>
            <div className="ch-source-pills">
              {['github','sentry','pagerduty','slack'].map(s => (
                <span key={s} className="ch-source-pill">
                  <SourceLogo source={s} className="h-3 w-3" />
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="ch-empty">
          <Shield className="h-5 w-5 ch-empty-icon" />
          <span>Constellation data is waiting on the live Coral endpoint. Source health and SQL proof panels are still available below.</span>
        </div>
      </section>
    )
  }

  const chains: any[] = data.chains ?? []
  const proof = data.proofs?.[0]
  const sourcesUsed: string[] = data.sources_used ?? ['github','sentry','pagerduty']
  const hasSlack = data.has_slack
  const hasPD = data.has_pagerduty
  const duration = proof?.duration_ms
  const rowCount = proof?.row_count ?? chains.length

  return (
    <section className="ch-container">
      {/* Top bar */}
      <div className="ch-top-bar">
        <div className="ch-top-left">
          <Zap className="h-4 w-4 ch-hero-icon" />
          <span className="ch-hero-title">Live Incident Intelligence</span>
          <div className="ch-source-pills">
            {sourcesUsed.map(s => (
              <span key={s} className="ch-source-pill">
                <SourceLogo source={s} className="h-3 w-3" />
                <span>{s === 'pagerduty' ? 'PagerDuty' : s.charAt(0).toUpperCase() + s.slice(1)}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="ch-top-right">
          <span className="ch-meta-pill">
            {sourcesUsed.length}-source JOIN
          </span>
          {duration && <span className="ch-meta-pill ch-meta-time">{duration}ms</span>}
          <span className="ch-meta-pill">{rowCount} chains</span>
          <span className="ch-meta-pill ch-meta-safe"><Shield className="h-2.5 w-2.5" />0 writes</span>
        </div>
      </div>

      {/* SQL description line */}
      <p className="ch-sql-desc">
        <code className="ch-sql-inline">
          FROM github.pulls JOIN sentry.issues ON time_window LEFT JOIN pagerduty.incidents LEFT JOIN slack.messages
        </code>
        <span className="ch-sql-note"> — evidence_score = fatal×40 + incident×30 + slack×20 + volume×10</span>
      </p>

      {/* Chains */}
      {chains.length === 0 ? (
        <div className="ch-empty">
          <Shield className="h-5 w-5 ch-empty-icon" />
          <span>No causal chains found in last 30 days — no PRs correlate with production errors in this window.</span>
        </div>
      ) : (
        <div className="ch-chains">
          {chains.slice(0, 4).map((row, i) => (
            <ChainRow
              key={`${row.pr_number}-${i}`}
              row={row}
              idx={i}
              onClick={() => onViewFull?.()}
            />
          ))}
          {chains.length > 4 && (
            <button type="button" className="ch-show-more" onClick={onViewFull}>
              +{chains.length - 4} more chains · Full investigation →
            </button>
          )}
        </div>
      )}

      {/* Status badges */}
      <div className="ch-status-row">
        <span className={cx('ch-status-badge', hasPD ? 'ch-badge-warn' : 'ch-badge-ok')}>
          {hasPD ? <AlertTriangle className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
          {hasPD ? 'Active PagerDuty incident linked' : 'No active incidents linked'}
        </span>
        <span className={cx('ch-status-badge', hasSlack ? 'ch-badge-warn' : 'ch-badge-ok')}>
          <MessageSquare className="h-3 w-3" />
          {hasSlack ? 'Slack war-room activity detected' : 'No Slack signal'}
        </span>
        {onViewFull && (
          <button type="button" className="ch-full-btn" onClick={onViewFull}>
            Full investigation <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* SQL proof accordion */}
      {proof?.sql && (
        <details className="ch-proof" onToggle={e => setProofOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="ch-proof-toggle">
            <ChevronDown className={cx('ch-proof-chevron h-3.5 w-3.5', proofOpen && 'ch-proof-chevron-open')} />
            <GitPullRequest className="h-3 w-3" />
            SQL proof · {proof.row_count ?? 0} rows · {proof.duration_ms ?? 0}ms
            {proof.status === 'error' && <span className="ch-proof-err-badge">query failed</span>}
          </summary>
          <div className="ch-proof-sql">
            <SqlBlock sql={proof.sql} />
          </div>
        </details>
      )}
    </section>
  )
}
