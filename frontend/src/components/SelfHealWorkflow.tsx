import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  DatabaseZap,
  GitMerge,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Terminal,
  XCircle,
  Zap,
} from 'lucide-react'
import { fetchSelfHeal } from '../api'
import { SourceLogo } from './BrandMarks'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type ApprovalState = 'pending' | 'approved' | 'dismissed'

function WorkflowStep({
  number,
  title,
  detail,
  status,
  chip,
}: {
  number: number
  title: string
  detail: string
  status: 'done' | 'active' | 'pending'
  chip?: string
}) {
  return (
    <div className={cx('sh-step', `sh-step-${status}`)}>
      <div className="sh-step-num">
        {status === 'done' ? <CheckCircle2 className="h-4 w-4" /> : <span>{number}</span>}
      </div>
      <div className="sh-step-body">
        <p>{title}</p>
        <small>{detail}</small>
      </div>
      {chip && <span className="sh-step-chip">{chip}</span>}
    </div>
  )
}

function ActionCard({
  action,
  state,
  onApprove,
  onDismiss,
}: {
  action: any
  state: ApprovalState
  onApprove: () => void
  onDismiss: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  function copyBody() {
    navigator.clipboard.writeText(action.body || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const iconMap: Record<string, string> = { Slack: 'slack', Linear: 'linear', GitHub: 'github' }
  const sourceKey = iconMap[action.target] || 'github'

  return (
    <div className={cx('sh-action-card', state !== 'pending' && `sh-action-${state}`)}>
      <div className="sh-action-head" onClick={() => setExpanded(!expanded)}>
        <div className="sh-action-source">
          <SourceLogo source={sourceKey} className="h-5 w-5" />
        </div>
        <div className="sh-action-info">
          <p>{action.title}</p>
          <span>
            {action.target} · evidence {action.evidence_score}/100 · {action.confidence} confidence
          </span>
        </div>
        <div className="sh-action-status-wrap">
          {state === 'approved' && (
            <span className="sh-action-badge sh-action-badge-approved">
              <CheckCircle2 className="h-3.5 w-3.5" /> Approved
            </span>
          )}
          {state === 'dismissed' && (
            <span className="sh-action-badge sh-action-badge-dismissed">
              <XCircle className="h-3.5 w-3.5" /> Dismissed
            </span>
          )}
          {state === 'pending' && (
            <span className="sh-action-badge sh-action-badge-pending">
              <ShieldCheck className="h-3.5 w-3.5" /> Needs approval
            </span>
          )}
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </div>

      {expanded && (
        <div className="sh-action-body">
          <div className="sh-action-draft">
            <div className="sh-draft-header">
              <span>Draft content</span>
              <button type="button" className="sh-copy-btn" onClick={copyBody}>
                <Copy className="h-3.5 w-3.5" />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="sh-draft-body">{action.body}</pre>
          </div>

          {state === 'pending' && (
            <div className="sh-action-controls">
              <button type="button" className="sh-approve-btn" onClick={onApprove}>
                <CheckCircle2 className="h-4 w-4" />
                Approve &amp; Copy
              </button>
              <button type="button" className="sh-dismiss-btn" onClick={onDismiss}>
                <XCircle className="h-4 w-4" />
                Dismiss
              </button>
            </div>
          )}
          {state === 'approved' && (
            <div className="sh-approved-note">
              <CheckCircle2 className="h-4 w-4" />
              <span>Approved — content copied to clipboard. Nothing was sent automatically.</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SelfHealWorkflow() {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['selfheal'],
    queryFn: () => fetchSelfHeal(),
    staleTime: 5 * 60_000,
  })

  const [approvals, setApprovals] = useState<Record<string, ApprovalState>>({})

  const chains: any[] = data?.chains || []
  const draftActions: any[] = data?.draft_actions || []
  const top = data?.top_chain || chains[0]
  const hasData = chains.length > 0
  const workflowStep: string = data?.workflow_step || (hasData ? 'approve' : 'detect')

  const approvedCount = Object.values(approvals).filter(v => v === 'approved').length

  function approve(id: string) {
    const action = draftActions.find((a: any) => a.id === id)
    if (action?.body) {
      navigator.clipboard.writeText(action.body).catch(() => {})
    }
    setApprovals(prev => ({ ...prev, [id]: 'approved' }))
  }

  function dismiss(id: string) {
    setApprovals(prev => ({ ...prev, [id]: 'dismissed' }))
  }

  const stepStatus = (step: 'detect' | 'score' | 'draft' | 'approve'): 'done' | 'active' | 'pending' => {
    const order = ['detect', 'score', 'draft', 'approve']
    const current = order.indexOf(workflowStep)
    const target = order.indexOf(step)
    if (target < current) return 'done'
    if (target === current) return 'active'
    return 'pending'
  }

  const steps = [
    {
      title: 'Detect causal chain',
      detail: 'GitHub PR merge → Sentry error → PagerDuty incident detected via 4-source Coral SQL JOIN (NOT EXISTS causality filter, 7-day window)',
      status: hasData ? 'done' : stepStatus('detect'),
      chip: hasData ? `${chains.length} chain${chains.length !== 1 ? 's' : ''}` : 'running',
    },
    {
      title: 'Score evidence',
      detail: 'Cross-source evidence scored 0-100: PagerDuty incident (+30) + fatal severity (+20) + user impact (+10) + missing Linear triage (+10)',
      status: hasData ? 'done' : stepStatus('score'),
      chip: top ? `${top.evidence_score}/100` : undefined,
    },
    {
      title: 'Generate draft actions',
      detail: 'Helm pre-fills Linear remediation ticket, Slack status post, and GitHub rollback proposal from live Coral evidence',
      status: draftActions.length > 0 ? 'done' : stepStatus('draft'),
      chip: draftActions.length > 0 ? `${draftActions.length} drafts` : undefined,
    },
    {
      title: 'Human approval',
      detail: 'Nothing is sent or written without explicit approval. You review, approve, and copy to clipboard.',
      status: approvedCount > 0 ? 'done' : draftActions.length > 0 ? stepStatus('approve') : 'pending',
      chip: approvedCount > 0 ? `${approvedCount} approved` : undefined,
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="sh-header">
        <div className="sh-header-badge">
          <Zap className="h-4 w-4" />
          <span>Self-Healing Workflow</span>
        </div>
        <h2 className="sh-header-title">
          From production incident to remediation in one SQL-grounded workflow
        </h2>
        <p className="sh-header-sub">
          Helm runs a 4-source Coral SQL JOIN (GitHub x Sentry x PagerDuty x Linear) to detect
          the PR to error to incident chain, flags chains with no Linear follow-up, scores
          evidence 0-100, pre-fills remediation drafts, and holds every write behind human approval.
        </p>
        <button
          type="button"
          className="soft-btn"
          onClick={() => refetch()}
        >
          <RefreshCw className={cx('h-4 w-4', isFetching && 'spin-icon')} />
          Refresh evidence
        </button>
      </div>

      {/* Workflow map */}
      <div className="sh-workflow-map">
        {steps.map((step, i) => (
          <WorkflowStep
            key={step.title}
            number={i + 1}
            title={step.title}
            detail={step.detail}
            status={step.status as 'done' | 'active' | 'pending'}
            chip={step.chip}
          />
        ))}
      </div>

      {/* Evidence snapshot */}
      {top && (
        <div className="sh-evidence-snapshot">
          <div className="sh-evidence-header">
            <DatabaseZap className="h-4 w-4" />
            <p>Evidence Snapshot — Top Chain</p>
            <span className="sh-evidence-score">{top.evidence_score}/100 evidence score</span>
          </div>
          <div className="sh-evidence-chain">
            <div className="sh-ev-node sh-ev-node-github">
              <SourceLogo source="github" className="h-4 w-4" />
              <div>
                <p>PR #{top.pr_number}</p>
                <small>{top.pr_title}</small>
                <small className="sh-ev-time">{String(top.merged_at || '').slice(0, 16)}</small>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 sh-ev-arrow" />
            <div className="sh-ev-node sh-ev-node-sentry">
              <SourceLogo source="sentry" className="h-4 w-4" />
              <div>
                <p>{top.error_title}</p>
                <small>{top.service} · {top.severity} · {top.error_events} {top.error_events === 1 ? 'event' : 'events'}</small>
                <small className="sh-ev-time">{String(top.error_first_seen || '').slice(0, 16)}</small>
              </div>
            </div>
            {top.incident_id && (
              <>
                <ChevronRight className="h-4 w-4 sh-ev-arrow" />
                <div className="sh-ev-node sh-ev-node-pagerduty">
                  <SourceLogo source="pagerduty" className="h-4 w-4" />
                  <div>
                    <p>{top.incident_service || 'Incident triggered'}</p>
                    <small>{top.urgency} urgency · {top.incident_status}</small>
                    <small className="sh-ev-time">{String(top.incident_created_at || '').slice(0, 16)}</small>
                  </div>
                </div>
              </>
            )}
            <>
              <ChevronRight className="h-4 w-4 sh-ev-arrow" />
              <div className={cx('sh-ev-node', top.needs_triage ? 'sh-ev-node-warn' : 'sh-ev-node-linear')}>
                <SourceLogo source="linear" className="h-4 w-4" />
                <div>
                  {top.followup_id ? (
                    <>
                      <p>{top.followup_id}</p>
                      <small>{top.followup_title || 'ticket exists'}</small>
                    </>
                  ) : (
                    <>
                      <p>No Linear ticket</p>
                      <small>needs triage</small>
                    </>
                  )}
                </div>
              </div>
            </>
          </div>
        </div>
      )}

      {/* Thesis strip */}
      <div className="sh-thesis">
        <div>
          <p>Without Helm</p>
          <ul>
            <li>Manual Sentry → GitHub correlation (30+ min)</li>
            <li>Manual PagerDuty check</li>
            <li>Hand-write Slack message from memory</li>
            <li>Create Linear ticket manually</li>
          </ul>
        </div>
        <div className="sh-thesis-vs">VS</div>
        <div className="sh-thesis-right">
          <p>With Helm + Coral</p>
          <ul>
            <li>1 SQL JOIN detects the full chain in seconds</li>
            <li>Evidence score computed automatically</li>
            <li>All 3 draft actions pre-filled from live data</li>
            <li>Human approves — nothing auto-fires</li>
          </ul>
        </div>
      </div>

      {/* Draft actions */}
      {isLoading ? (
        <div className="sh-loading">
          <Loader2 className="h-5 w-5 spin-icon" />
          <p>Loading incident chain and generating draft actions...</p>
        </div>
      ) : error ? (
        <div className="sh-error">
          <AlertTriangle className="h-5 w-5" />
          <p>Could not load evidence. Check GitHub and Sentry sources.</p>
        </div>
      ) : draftActions.length === 0 ? (
        <div className="sh-empty">
          <CheckCircle2 className="h-6 w-6" />
          <p>No incident chains detected in the last 7 days.</p>
          <span>Draft actions will appear here when Coral detects a PR → error → incident → triage-gap chain.</span>
        </div>
      ) : (
        <div>
          <div className="sh-actions-header">
            <h3>Draft Remediation Actions</h3>
            <span>
              {approvedCount}/{draftActions.length} approved ·
              Review each action, approve to copy to clipboard
            </span>
          </div>
          <div className="sh-actions-list">
            {draftActions.map((action: any) => (
              <ActionCard
                key={action.id}
                action={action}
                state={approvals[action.id] || 'pending'}
                onApprove={() => approve(action.id)}
                onDismiss={() => dismiss(action.id)}
              />
            ))}
          </div>
          <p className="sh-guardrail-note">
            <ShieldCheck className="h-3.5 w-3.5" />
            Nothing is sent automatically. Approving copies the draft to your clipboard for manual review and send.
          </p>
        </div>
      )}
    </div>
  )
}
