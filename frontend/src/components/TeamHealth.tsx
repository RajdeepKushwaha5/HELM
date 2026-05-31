import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DatabaseZap,
  GitMerge,
  Moon,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Users,
  Zap,
} from 'lucide-react'
import { fetchTeamHealth } from '../api'
import { CoralProofPanel } from './CoralProof'
import { SourceLogo } from './BrandMarks'
import { BurnoutBarChart } from './InsightCharts'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function riskColor(risk: string) {
  if (risk === 'high') return 'th-risk-high'
  if (risk === 'medium') return 'th-risk-medium'
  return 'th-risk-low'
}

function ScoreRing({ score, risk }: { score: number; risk: string }) {
  const r = 22
  const circ = 2 * Math.PI * r
  const filled = circ * (score / 100)
  const color = risk === 'high' ? '#dc2626' : risk === 'medium' ? '#ca6a00' : '#006b32'

  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="th-score-ring">
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="4" />
      <circle
        cx="28" cy="28" r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x="28" y="33" textAnchor="middle" fontSize="12" fontWeight="700" fill={color}>
        {score}
      </text>
    </svg>
  )
}

const SEGMENTS = 10

function OffHoursBar({
  totalPrs,
  lateNightPrs,
  offHoursPrs,
}: {
  totalPrs: number
  lateNightPrs: number
  offHoursPrs: number
}) {
  const nightSegs = Math.round((lateNightPrs / totalPrs) * SEGMENTS)
  const extSegs   = Math.min(SEGMENTS - nightSegs, Math.round(((offHoursPrs - lateNightPrs) / totalPrs) * SEGMENTS))
  const nightPct  = Math.round((lateNightPrs / totalPrs) * 100)
  return (
    <div className="th-eng-offhours">
      <span className="th-offhours-label">Off-hours</span>
      <div
        className="th-offhours-segments"
        title={`${lateNightPrs} late-night PRs · ${offHoursPrs} off-hours total`}
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <div
            key={i}
            className={cx(
              'th-offhours-seg',
              i < nightSegs ? 'th-seg-night' :
              i < nightSegs + extSegs ? 'th-seg-extended' :
              'th-seg-empty'
            )}
          />
        ))}
      </div>
      <span className="th-offhours-pct">{nightPct}% late-night</span>
    </div>
  )
}

function EngineerCard({ eng }: { eng: any }) {
  const risk = eng.risk_level || 'low'
  const signals: string[] = eng.signals || []
  const initials = String(eng.author || 'U').split(/[._-]/).map((p: string) => p[0]?.toUpperCase() || '').join('').slice(0, 2) || '?'

  return (
    <div className={cx('th-engineer-card', riskColor(risk))}>
      <div className="th-eng-top">
        <div className="th-eng-avatar-wrap">
          <div className={cx('th-eng-avatar', riskColor(risk))}>{initials}</div>
          {eng.late_night_prs >= 2 && (
            <span className="th-eng-night-badge" title="Late-night PR activity detected">
              <Moon className="h-3 w-3" />
            </span>
          )}
        </div>
        <div className="th-eng-info">
          <p className="th-eng-name">{eng.author}</p>
          <span className={cx('th-eng-risk-badge', riskColor(risk))}>{risk} risk</span>
        </div>
        <ScoreRing score={eng.burnout_score || 0} risk={risk} />
      </div>

      <div className="th-eng-metrics">
        {eng.total_prs != null && (
          <div className="th-metric">
            <GitMerge className="h-3.5 w-3.5" />
            <span>{eng.total_prs} PRs</span>
          </div>
        )}
        {eng.late_night_prs != null && eng.late_night_prs > 0 && (
          <div className="th-metric th-metric-warn">
            <Moon className="h-3.5 w-3.5" />
            <span>{eng.late_night_prs} late-night</span>
          </div>
        )}
        {eng.open_tickets != null && (
          <div className="th-metric">
            <Terminal className="h-3.5 w-3.5" />
            <span>{eng.open_tickets} tickets</span>
          </div>
        )}
        {eng.overdue_tickets != null && eng.overdue_tickets > 0 && (
          <div className="th-metric th-metric-warn">
            <Clock className="h-3.5 w-3.5" />
            <span>{eng.overdue_tickets} overdue</span>
          </div>
        )}
        {eng.prs_with_errors != null && eng.prs_with_errors > 0 && (
          <div className="th-metric th-metric-danger">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{eng.prs_with_errors} error PRs</span>
          </div>
        )}
      </div>

      {/* Late-night activity bar: visual burnout radar */}
      {eng.total_prs > 0 && (eng.late_night_prs > 0 || eng.off_hours_prs > 0) && (
        <OffHoursBar
          totalPrs={eng.total_prs}
          lateNightPrs={eng.late_night_prs}
          offHoursPrs={eng.off_hours_prs}
        />
      )}

      {signals.length > 0 && (
        <ul className="th-signals">
          {signals.map((s, i) => (
            <li key={i} className="th-signal">
              <span className="th-signal-dot" />
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function TeamHealth() {
  const queryClient = useQueryClient()
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['team-health'],
    queryFn: () => fetchTeamHealth(),
    staleTime: 5 * 60_000,
  })

  const engineers: any[] = data?.engineers || []
  const summary = data?.summary || {}
  const proofs: any[] = data?.proofs || []

  const highCount = summary.high_risk || 0
  const mediumCount = summary.medium_risk || 0
  const totalCount = summary.total || 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="th-header">
        <div className="th-header-left">
          <div className="th-header-badge">
            <DatabaseZap className="h-4 w-4" />
            <span>GitHub × Linear × Sentry</span>
          </div>
          <p className="th-header-desc">
            {data?.cross_source_description ||
              'Three live data sources joined per engineer — burnout signals no single tool can see.'}
          </p>
        </div>
        <button
          type="button"
          className="soft-btn"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['team-health'] })}
        >
          <RefreshCw className={cx('h-4 w-4', isFetching && 'spin-icon')} />
          Refresh
        </button>
      </div>

      {/* Summary row */}
      <div className="th-summary-row">
        <div className="th-stat-card">
          <Users className="h-5 w-5" />
          <strong>{totalCount}</strong>
          <span>engineers tracked</span>
        </div>
        <div className={cx('th-stat-card', highCount > 0 && 'th-stat-card-danger')}>
          <AlertTriangle className="h-5 w-5" />
          <strong>{highCount}</strong>
          <span>high burnout risk</span>
        </div>
        <div className={cx('th-stat-card', mediumCount > 0 && 'th-stat-card-warn')}>
          <Activity className="h-5 w-5" />
          <strong>{mediumCount}</strong>
          <span>medium risk</span>
        </div>
        <div className="th-stat-card">
          <ShieldCheck className="h-5 w-5" />
          <strong>3</strong>
          <span>sources joined</span>
        </div>
      </div>

      {/* Source legend */}
      <div className="th-source-legend">
        <div className="th-source-item">
          <SourceLogo source="github" className="h-4 w-4" />
          <span>GitHub — PR timing (off-hours, late-night patterns)</span>
        </div>
        <div className="th-source-dot" />
        <div className="th-source-item">
          <SourceLogo source="linear" className="h-4 w-4" />
          <span>Linear — ticket pressure, overdue, high-priority</span>
        </div>
        <div className="th-source-dot" />
        <div className="th-source-item">
          <SourceLogo source="sentry" className="h-4 w-4" />
          <span>Sentry — error ownership, PRs introducing bugs</span>
        </div>
      </div>

      {/* Linear matching note */}
      <div className="th-match-note">
        <span>Linear ticket data is matched by display name vs GitHub handle (case-insensitive). If names differ across systems, ticket columns will show 0 — the Sentry and PR signals are unaffected.</span>
      </div>

      {/* Zero-ETL callout */}
      <div className="th-zero-etl-strip">
        <Zap className="h-4 w-4" />
        <div>
          <p>Why this insight doesn't exist anywhere else</p>
          <span>
            No single tool knows who worked until 2am <em>and</em> has 4 overdue P0 tickets <em>and</em> whose PRs keep introducing Sentry errors.
            Helm joins GitHub, Linear, and Sentry live in one Coral SQL plan — zero ETL, zero data warehouse, zero pipeline.
          </span>
        </div>
      </div>

      {/* Engineer grid */}
      {isLoading ? (
        <div className="th-loading">
          <RefreshCw className="h-5 w-5 spin-icon" />
          <p>Running 3-source Coral cross-join...</p>
          <code>github.pulls × linear.issues × sentry.issues — per engineer</code>
        </div>
      ) : error ? (
        <div className="th-error">
          <AlertTriangle className="h-5 w-5" />
          <p>Could not load team health data. Check that GitHub, Linear, and Sentry sources are connected.</p>
        </div>
      ) : engineers.length === 0 ? (
        <div className="th-empty">
          <CheckCircle2 className="h-6 w-6" />
          <p>No burnout signals detected — or Linear/Sentry sources need connecting.</p>
        </div>
      ) : (
        <div>
          <div className="th-grid-header">
            <h3>Engineer Health Pulse</h3>
            <span className="th-grid-subhead">Sorted by burnout score · Cross-source: GitHub × Linear × Sentry</span>
          </div>
          <div className="th-engineers-grid">
            {engineers.map((eng: any) => (
              <EngineerCard key={eng.author} eng={eng} />
            ))}
          </div>
          {/* Burnout radar chart — maps author → name for BurnoutBarChart */}
          <BurnoutBarChart
            engineers={engineers.map((e: any) => ({ ...e, name: e.author }))}
          />
        </div>
      )}

      {/* SQL Proof */}
      {proofs.length > 0 && (
        <CoralProofPanel proofs={proofs} title="Team Health Pulse SQL proofs" />
      )}
    </div>
  )
}
