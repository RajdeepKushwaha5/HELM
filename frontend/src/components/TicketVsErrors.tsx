import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  RefreshCw,
  TicketIcon,
  Zap,
} from 'lucide-react'
import { fetchTicketTeams } from '../api'
import { CoralProofPanel } from './CoralProof'
import { SourceLogo } from './BrandMarks'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function riskClass(risk: string) {
  if (risk === 'high') return 'tve-risk-high'
  if (risk === 'medium') return 'tve-risk-medium'
  return 'tve-risk-low'
}

function PressureBar({ score }: { score: number }) {
  const color = score >= 60 ? '#dc2626' : score >= 30 ? '#ca6a00' : '#006b32'
  return (
    <div className="tve-pressure-bar-track">
      <div
        className="tve-pressure-bar-fill"
        style={{ width: `${score}%`, background: color, transition: 'width 0.5s ease' }}
      />
    </div>
  )
}

function TeamRow({ team }: { team: any }) {
  const risk = team.risk_level || 'low'
  return (
    <div className={cx('tve-team-row', riskClass(risk))}>
      <div className="tve-team-header">
        <div className="tve-team-name-wrap">
          <span className={cx('tve-risk-dot', riskClass(risk))} />
          <strong className="tve-team-key">{team.team}</strong>
          <span className={cx('tve-risk-badge', riskClass(risk))}>{risk}</span>
        </div>
        <span className="tve-pressure-label">
          Pressure: <b>{team.pressure_score}</b>/100
        </span>
      </div>

      <PressureBar score={team.pressure_score} />

      <div className="tve-team-stats">
        <div className="tve-stat">
          <TicketIcon className="h-3.5 w-3.5" />
          <span><b>{team.open_tickets}</b> open tickets</span>
        </div>
        {team.high_priority_tickets > 0 && (
          <div className="tve-stat tve-stat-warn">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span><b>{team.high_priority_tickets}</b> P0/P1</span>
          </div>
        )}
        <div className="tve-stat">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span><b>{team.related_errors ?? 0}</b> Sentry errors</span>
        </div>
        {(team.total_error_events ?? 0) > 0 && (
          <div className="tve-stat tve-stat-danger">
            <span><b>{team.total_error_events}</b> error events</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function TicketVsErrors() {
  const queryClient = useQueryClient()
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['ticket-teams'],
    queryFn: () => fetchTicketTeams(),
    staleTime: 5 * 60_000,
  })

  const teams: any[] = data?.teams || []
  const summary = data?.summary || {}
  const proofs: any[] = data?.proofs || []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="th-header">
        <div className="th-header-left">
          <div className="th-header-badge">
            <DatabaseZap className="h-4 w-4" />
            <span>Linear × Sentry</span>
          </div>
          <p className="th-header-desc">
            {data?.cross_source_description ||
              'Linear ticket pressure joined to Sentry error volume per team — two live sources, one Coral plan.'}
          </p>
        </div>
        <button
          type="button"
          className="soft-btn"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['ticket-teams'] })}
        >
          <RefreshCw className={cx('h-4 w-4', isFetching && 'spin-icon')} />
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="th-summary-row">
        <div className="th-stat-card">
          <TicketIcon className="h-5 w-5" />
          <strong>{summary.total_teams ?? 0}</strong>
          <span>teams analyzed</span>
        </div>
        <div className={cx('th-stat-card', (summary.high_risk_teams ?? 0) > 0 && 'th-stat-card-danger')}>
          <AlertTriangle className="h-5 w-5" />
          <strong>{summary.high_risk_teams ?? 0}</strong>
          <span>high pressure teams</span>
        </div>
        <div className="th-stat-card">
          <TicketIcon className="h-5 w-5" />
          <strong>{summary.total_open_tickets ?? 0}</strong>
          <span>open tickets total</span>
        </div>
        <div className="th-stat-card">
          <AlertTriangle className="h-5 w-5" />
          <strong>{summary.total_related_errors ?? 0}</strong>
          <span>linked Sentry errors</span>
        </div>
      </div>

      {/* Source legend */}
      <div className="th-source-legend">
        <div className="th-source-item">
          <SourceLogo source="linear" className="h-4 w-4" />
          <span>Linear — open tickets, P0/P1 count, overdue work</span>
        </div>
        <div className="th-source-dot" />
        <div className="th-source-item">
          <SourceLogo source="sentry" className="h-4 w-4" />
          <span>Sentry — errors correlated to team by project name match</span>
        </div>
      </div>

      {/* Zero-ETL callout */}
      <div className="th-zero-etl-strip">
        <Zap className="h-4 w-4" />
        <div>
          <p>Why this view doesn't exist in Linear or Sentry alone</p>
          <span>
            Linear sees tickets. Sentry sees errors. Neither knows about the other.
            Coral joins them by team key in one SQL plan — showing which teams are both overloaded with P0 tickets
            <em> and</em> generating the most production errors simultaneously.
          </span>
        </div>
      </div>

      {/* Team rows */}
      {isLoading ? (
        <div className="th-loading">
          <RefreshCw className="h-5 w-5 spin-icon" />
          <p>Running Linear × Sentry cross-join...</p>
          <code>linear.issues LEFT JOIN sentry.issues ON project ILIKE team_key</code>
        </div>
      ) : error ? (
        <div className="th-error">
          <AlertTriangle className="h-5 w-5" />
          <p>Could not load team data. Check that Linear and Sentry sources are connected.</p>
        </div>
      ) : teams.length === 0 ? (
        <div className="th-empty">
          <CheckCircle2 className="h-6 w-6" />
          <p>No teams found — or Linear/Sentry sources need connecting. The query looks for Linear team keys of 4+ characters that match Sentry project names.</p>
        </div>
      ) : (
        <div className="tve-teams-list">
          {teams.map((team: any) => (
            <TeamRow key={team.team} team={team} />
          ))}
        </div>
      )}

      {proofs.length > 0 && (
        <CoralProofPanel proofs={proofs} title="Linear × Sentry team JOIN proof" />
      )}
    </div>
  )
}
