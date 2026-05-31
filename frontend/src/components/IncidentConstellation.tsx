import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  GitMerge,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Zap,
  XCircle,
} from 'lucide-react'
import { fetchConstellation } from '../api'
import { CoralProofPanel } from './CoralProof'
import { SourceLogo } from './BrandMarks'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function severityClass(level: string) {
  if (level === 'fatal') return 'const-node-fatal'
  if (level === 'error') return 'const-node-error'
  return 'const-node-warn'
}

function urgencyClass(urgency: string) {
  if (urgency === 'high') return 'const-node-fatal'
  return 'const-node-warn'
}

function formatTime(value?: string) {
  if (!value) return null
  return String(value).replace('T', ' ').slice(0, 16)
}

function minutesBetween(start?: string, end?: string): number | null {
  if (!start || !end) return null
  try {
    const a = new Date(start.includes('T') ? start : start.replace(' ', 'T') + 'Z')
    const b = new Date(end.includes('T') ? end : end.replace(' ', 'T') + 'Z')
    const diff = Math.round((b.getTime() - a.getTime()) / 60000)
    return diff >= 0 ? diff : null
  } catch {
    return null
  }
}

function EvidenceScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? '#dc2626' : score >= 40 ? '#ca6a00' : '#006b32'
  const r = 14
  const circ = 2 * Math.PI * r
  const filled = circ * (score / 100)

  return (
    <div className="const-score-badge">
      <svg width="38" height="38" viewBox="0 0 38 38">
        <circle cx="19" cy="19" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3" />
        <circle
          cx="19" cy="19" r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
          transform="rotate(-90 19 19)"
        />
        <text x="19" y="23" textAnchor="middle" fontSize="9" fontWeight="700" fill={color}>{score}</text>
      </svg>
      <span>evidence</span>
    </div>
  )
}

function ConstellationChain({ chain, index }: { chain: any; index: number }) {
  const severity = chain.severity || 'error'
  const urgency = chain.urgency || ''
  const hasIncident = Boolean(chain.incident_id)
  const hasSlack = Number(chain.slack_messages || 0) > 0
  const errorToIncident = minutesBetween(chain.error_first_seen, chain.incident_created_at)
  const prToError = minutesBetween(chain.merged_at, chain.error_first_seen)
  const evidenceScore = Number(chain.evidence_score || 0)

  return (
    <div className={cx('const-chain', index === 0 && 'const-chain-primary')}>
      <div className="const-chain-header">
        <span className="const-chain-num">Chain {index + 1}</span>
        <EvidenceScoreBadge score={evidenceScore} />
        {index === 0 && <span className="const-chain-top-badge">Highest Evidence</span>}
      </div>

      {/* Visual node graph */}
      <div className="const-graph">

        {/* Node 1: GitHub PR */}
        <div className="const-node const-node-github">
          <div className="const-node-icon">
            <SourceLogo source="github" className="h-5 w-5" />
          </div>
          <div className="const-node-body">
            <span className="const-node-label">GitHub</span>
            <p className="const-node-title">PR #{chain.pr_number}</p>
            <small className="const-node-detail">{chain.pr_title}</small>
            <small className="const-node-time">{formatTime(chain.merged_at)}</small>
          </div>
        </div>

        {/* Edge: GitHub → Sentry */}
        <div className="const-edge">
          <div className="const-edge-line" />
          <div className="const-edge-label">
            <code>JOIN ON first_seen ≤ merged_at + 24h</code>
            {prToError != null && (
              <span className="const-edge-time">{prToError} min</span>
            )}
          </div>
          <div className="const-edge-arrow">▶</div>
        </div>

        {/* Node 2: Sentry Error */}
        <div className={cx('const-node', severityClass(severity))}>
          <div className="const-node-icon">
            <SourceLogo source="sentry" className="h-5 w-5" />
          </div>
          <div className="const-node-body">
            <span className="const-node-label">Sentry · {severity}</span>
            <p className="const-node-title">{chain.error_title}</p>
            <small className="const-node-detail">{chain.service} · {chain.error_events} {chain.error_events === 1 ? 'event' : 'events'}</small>
            <small className="const-node-time">{formatTime(chain.error_first_seen)}</small>
          </div>
        </div>

        {/* Edge: Sentry → PagerDuty */}
        <div className={cx('const-edge', !hasIncident && 'const-edge-dim')}>
          <div className="const-edge-line" />
          <div className="const-edge-label">
            <code>LEFT JOIN ON service ILIKE + 72h window</code>
            {errorToIncident != null && hasIncident && (
              <span className="const-edge-time">{errorToIncident} min</span>
            )}
          </div>
          <div className="const-edge-arrow">▶</div>
        </div>

        {/* Node 3: PagerDuty */}
        <div className={cx('const-node', hasIncident ? urgencyClass(urgency) : 'const-node-inactive')}>
          <div className="const-node-icon">
            <SourceLogo source="pagerduty" className="h-5 w-5" />
          </div>
          <div className="const-node-body">
            <span className="const-node-label">PagerDuty</span>
            {hasIncident ? (
              <>
                <p className="const-node-title">{chain.incident_service || 'Incident triggered'}</p>
                <small className="const-node-detail">{urgency} urgency · {chain.incident_status}</small>
                <small className="const-node-time">{formatTime(chain.incident_created_at)}</small>
              </>
            ) : (
              <>
                <p className="const-node-title">No incident linked</p>
                <small className="const-node-detail">LEFT JOIN returned null</small>
              </>
            )}
          </div>
        </div>

        {/* Edge: PagerDuty → Slack */}
        <div className={cx('const-edge', !hasSlack && 'const-edge-dim')}>
          <div className="const-edge-line" />
          <div className="const-edge-label">
            <code>LEFT JOIN ON ts within 4h + incident keywords</code>
          </div>
          <div className="const-edge-arrow">▶</div>
        </div>

        {/* Node 4: Slack */}
        <div className={cx('const-node', hasSlack ? 'const-node-slack' : 'const-node-inactive')}>
          <div className="const-node-icon">
            <SourceLogo source="slack" className="h-5 w-5" />
          </div>
          <div className="const-node-body">
            <span className="const-node-label">Slack</span>
            {hasSlack ? (
              <>
                <p className="const-node-title">{chain.slack_messages} messages</p>
                <small className="const-node-detail">max thread depth {chain.thread_depth}</small>
              </>
            ) : (
              <>
                <p className="const-node-title">No response detected</p>
                <small className="const-node-detail">No Slack channel configured or no messages</small>
              </>
            )}
          </div>
        </div>

      </div>

      {/* Author + service tags */}
      <div className="const-chain-meta">
        <span className="const-meta-chip">
          <GitMerge className="h-3 w-3" /> by {chain.author}
        </span>
        <span className="const-meta-chip">
          <Terminal className="h-3 w-3" /> {chain.service}
        </span>
        {chain.incident_id && (
          <span className="const-meta-chip const-meta-chip-incident">
            <ShieldAlert className="h-3 w-3" /> incident #{String(chain.incident_id).slice(0, 8)}
          </span>
        )}
      </div>
    </div>
  )
}


export default function IncidentConstellation() {
  const queryClient = useQueryClient()
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['constellation'],
    queryFn: () => fetchConstellation(),
    staleTime: 5 * 60_000,
  })

  const chains: any[] = data?.chains || []
  const draftActions: any[] = data?.draft_actions || []
  const proofs: any[] = data?.proofs || []
  const sourcesUsed: string[] = data?.sources_used || ['github', 'sentry', 'pagerduty']

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="const-header">
        <div className="const-header-left">
          <div className="const-header-badge">
            <DatabaseZap className="h-4 w-4" />
            <span>
              {sourcesUsed.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' × ')}
            </span>
          </div>
          <p className="const-header-desc">
            {data?.sql_description ||
              '4-source DataFusion JOIN: GitHub PR → Sentry error → PagerDuty incident → Slack response'}
          </p>
        </div>
        <div className="const-header-right">
          <div className="const-stats">
            <span><b>{chains.length}</b> chains</span>
            <span className="const-stats-dot" />
            <span><b>{chains.filter((c: any) => c.incident_id).length}</b> with incidents</span>
            {data?.has_slack && (
              <>
                <span className="const-stats-dot" />
                <span><b>{chains.filter((c: any) => Number(c.slack_messages || 0) > 0).length}</b> with Slack</span>
              </>
            )}
          </div>
          <button
            type="button"
            className="soft-btn"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['constellation'] })}
          >
            <RefreshCw className={cx('h-4 w-4', isFetching && 'spin-icon')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Zero-ETL thesis */}
      <div className="const-thesis">
        <div className="const-thesis-item">
          <DatabaseZap className="h-4 w-4" />
          <div>
            <p>One SQL plan</p>
            <span>All 4 sources in a single DataFusion execution — not 4 API calls</span>
          </div>
        </div>
        <div className="const-thesis-item">
          <Zap className="h-4 w-4" />
          <div>
            <p>Zero ETL</p>
            <span>No Fivetran, no Snowflake, no dbt. Live APIs, live data.</span>
          </div>
        </div>
        <div className="const-thesis-item">
          <CheckCircle2 className="h-4 w-4" />
          <div>
            <p>Proof attached</p>
            <span>Every edge is a SQL JOIN condition visible in the proof panel</span>
          </div>
        </div>
      </div>

      {/* Chains */}
      {isLoading ? (
        <div className="const-loading">
          <RefreshCw className="h-5 w-5 spin-icon" />
          <p>Running 4-source Coral JOIN...</p>
          <code>github.pulls × sentry.issues × pagerduty.incidents × slack.messages</code>
        </div>
      ) : error ? (
        <div className="const-error">
          <XCircle className="h-5 w-5" />
          <p>Could not load constellation data. Ensure GitHub and Sentry sources are connected.</p>
        </div>
      ) : chains.length === 0 ? (
        <div className="const-empty">
          <CheckCircle2 className="h-6 w-6" />
          <p>No causal chains in the last 30 days — or no matching PR/error pairs yet.</p>
          <span>The Coral JOIN ran successfully but returned 0 rows.</span>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="const-grid-header">
            <h3>Causal Chains</h3>
            <span>Each chain is one Coral cross-source JOIN result · sorted by evidence score</span>
          </div>
          <div className="const-chains-list">
            {chains.map((chain: any, i: number) => (
              <ConstellationChain key={`${chain.pr_number}-${chain.sentry_id}-${i}`} chain={chain} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Self-Heal redirect */}
      {draftActions.length > 0 && (
        <div className="const-selfheal-nudge">
          <ShieldAlert className="h-4 w-4" />
          <div>
            <p>{draftActions.length} draft remediation {draftActions.length === 1 ? 'action' : 'actions'} ready</p>
            <span>Open <b>Self-Heal Workflow</b> to review, approve, and copy draft Slack / Linear / GitHub actions</span>
          </div>
        </div>
      )}

      {/* SQL Proof */}
      {proofs.length > 0 && (
        <CoralProofPanel proofs={proofs} title="Constellation SQL proof" />
      )}
    </div>
  )
}
