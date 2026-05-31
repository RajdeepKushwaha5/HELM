import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  MessageSquare,
  RefreshCw,
  Zap,
} from 'lucide-react'
import { fetchTicketThreadTracker } from '../api'
import { CoralProofPanel } from './CoralProof'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function priorityClass(priority: string | null) {
  if (!priority) return ''
  const p = String(priority).toLowerCase()
  if (p.includes('urgent') || p.includes('1')) return 'ttt-priority-urgent'
  if (p.includes('high') || p.includes('2')) return 'ttt-priority-high'
  if (p.includes('medium') || p.includes('3')) return 'ttt-priority-medium'
  return 'ttt-priority-low'
}

function MentionBar({ count, max }: Readonly<{ count: number; max: number }>) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  let cls = 'ttt-mention-fill ttt-fill-low'
  if (pct >= 80) cls = 'ttt-mention-fill ttt-fill-high'
  else if (pct >= 40) cls = 'ttt-mention-fill ttt-fill-mid'
  return (
    <div className="ttt-mention-bar" title={`${count} Slack mentions`}>
      <div className="ttt-mention-track">
        <div className={cls} />
      </div>
      <span>{count}</span>
    </div>
  )
}

function isUrgentOrHigh(t: any) {
  const p = String(t.priority || '').toLowerCase()
  return p.includes('urgent') || p.includes('high') || p === '1' || p === '2'
}

function TicketStateBlock({ isLoading, error, tickets }: Readonly<{ isLoading: boolean; error: unknown; tickets: any[] }>) {
  if (isLoading) {
    return (
      <div className="ttt-loading">
        <RefreshCw className="h-5 w-5 spin-icon" />
        <p>Running Linear × Slack cross-join...</p>
        <code>linear.issues (open, priority ≤ 2) JOIN slack.messages ON text ILIKE '%identifier%'</code>
      </div>
    )
  }
  if (error) {
    return (
      <div className="ttt-error">
        <AlertTriangle className="h-5 w-5" />
        <p>Could not load ticket thread data. Check Linear and Slack sources.</p>
      </div>
    )
  }
  if (tickets.length === 0) {
    return (
      <div className="ttt-empty">
        <CheckCircle2 className="h-6 w-6" />
        <p>No high-priority tickets generating Slack noise in the last 14 days.</p>
        <span>Either backlog is quiet, or Slack channel has no matching ticket references.</span>
      </div>
    )
  }
  return null
}

export default function TicketThreadTracker() {
  const queryClient = useQueryClient()
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['ticket-thread-tracker'],
    queryFn: () => fetchTicketThreadTracker(),
    staleTime: 5 * 60_000,
  })

  const tickets: any[] = data?.tickets || []
  const totalMentions: number = data?.total_mentions || 0
  const proofs: any[] = data?.proofs || []
  const maxMentions = Math.max(...tickets.map((t: any) => Number(t.slack_mentions || 0)), 1)

  if (data?.fallback) {
    return (
      <div className="space-y-5">
        <div className="ttt-fallback">
          <AlertTriangle className="h-5 w-5" />
          <div>
            <p>Slack channel not configured</p>
            <span>{data.fallback_message}</span>
          </div>
        </div>
      </div>
    )
  }

  const stateBlock = <TicketStateBlock isLoading={isLoading} error={error} tickets={tickets} />

  return (
    <div className="space-y-5">
      <div className="ttt-header">
        <div className="ttt-header-badge">
          <DatabaseZap className="h-4 w-4" />
          <span>Linear × Slack</span>
        </div>
        <h2 className="ttt-title">Ticket Thread Tracker</h2>
        <p className="ttt-desc">
          High-priority Linear tickets generating Slack thread chaos. Joins open tickets
          to channel messages by ticket identifier mention (e.g. ENG-42 in message text).
          Reveals backlog pressure that spills into chat — silent tickets making loud noise.
        </p>
        <button
          type="button"
          className="soft-btn"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['ticket-thread-tracker'] })}
        >
          <RefreshCw className={cx('h-4 w-4', isFetching && 'spin-icon')} />
          Refresh
        </button>
      </div>

      {!isLoading && !error && tickets.length > 0 && (
        <div className="ttt-summary">
          <div>
            <p>{tickets.length}</p>
            <span>noisy tickets (14 days)</span>
          </div>
          <div>
            <p>{totalMentions}</p>
            <span>total Slack mentions</span>
          </div>
          <div>
            <p>{tickets.filter((t: any) => t.max_thread_depth > 2).length}</p>
            <span>with deep threads (&gt;2)</span>
          </div>
          <div>
            <p>{tickets.filter(isUrgentOrHigh).length}</p>
            <span>urgent or high priority</span>
          </div>
        </div>
      )}

      {stateBlock ?? (
        <div className="ttt-table">
          <div className="ttt-table-head">
            <span>Ticket</span>
            <span>Priority</span>
            <span>Assignee</span>
            <span>Team</span>
            <span>Slack mentions</span>
            <span>Max thread depth</span>
          </div>
          {tickets.map((ticket: any) => (
            <div key={ticket.identifier} className={cx('ttt-table-row', ticket === tickets[0] && 'ttt-row-top')}>
              <div className="ttt-ticket-cell">
                <span className="ttt-identifier">{ticket.identifier}</span>
                <span className="ttt-ticket-title">{ticket.ticket_title}</span>
              </div>
              <span className={cx('ttt-priority-badge', priorityClass(ticket.priority))}>
                {ticket.priority || '—'}
              </span>
              <span className="ttt-assignee">{ticket.assignee_name || '—'}</span>
              <span className="ttt-team">{ticket.team_key || '—'}</span>
              <div className="ttt-mention-cell">
                <MessageSquare className="h-3.5 w-3.5" />
                <MentionBar count={Number(ticket.slack_mentions || 0)} max={maxMentions} />
              </div>
              <span className="ttt-depth">{ticket.max_thread_depth ?? '—'}</span>
            </div>
          ))}
        </div>
      )}

      <div className="ttt-zero-etl">
        <Zap className="h-4 w-4" />
        <div>
          <p>Why this insight doesn't exist in Linear or Slack alone</p>
          <span>
            Linear shows tickets. Slack shows conversations. Neither shows you which tickets are
            generating the most channel noise. Helm joins them in one Coral SQL plan — ticket
            identifier in message text is the cross-source key. Zero ETL, zero pipeline.
          </span>
        </div>
      </div>

      {proofs.length > 0 && (
        <CoralProofPanel proofs={proofs} title="Ticket Thread Tracker SQL proof" />
      )}
    </div>
  )
}
