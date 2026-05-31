import { useRef, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle,
  ExternalLink,
  GitPullRequest,
  Loader2,
  Send,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { prReviewStream, executeAction } from '../api'
import { CoralProofPanel, type CoralProof } from './CoralProof'

interface TraceStep {
  id: string
  label: string
  status: 'running' | 'done' | 'error'
  sources?: string[]
}

interface ReviewResult {
  pr_number: number
  pr_title: string
  pr_author: string
  pr_url: string
  pr_state: string
  risk_level: string
  service_hints: string[]
  review_text: string
  summary: Record<string, number>
  draft_action: { id: string; title: string; target: string; body: string; pr_ref: string }
  proofs: CoralProof[]
  owner: string
  repo: string
}

const RISK_CONFIG = {
  HIGH:   { label: 'HIGH RISK',   cls: 'pr-risk-high',   icon: ShieldAlert },
  MEDIUM: { label: 'MEDIUM RISK', cls: 'pr-risk-medium',  icon: AlertTriangle },
  LOW:    { label: 'LOW RISK',    cls: 'pr-risk-low',     icon: ShieldCheck },
} as const

function renderReviewMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: JSX.Element[] = []
  let key = 0

  for (const line of lines) {
    const k = key++
    if (line.startsWith('## ')) {
      elements.push(<h2 key={k} className="pr-review-h2">{line.slice(3)}</h2>)
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={k} className="pr-review-h3">{line.slice(4)}</h3>)
    } else if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
      elements.push(<p key={k} className="pr-review-bold">{line.slice(2, -2)}</p>)
    } else if (/^\*\*Risk:/.test(line)) {
      const riskParts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, idx) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={idx}>{part.slice(2, -2)}</strong>
          : <span key={idx}>{part}</span>
      )
      elements.push(<p key={k} className="pr-review-risk-line">{riskParts}</p>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={k} className="pr-review-li">{line.slice(2)}</li>)
    } else if (line === '---') {
      elements.push(<hr key={k} className="pr-review-hr" />)
    } else if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      elements.push(<p key={k} className="pr-review-italic">{line.slice(1, -1)}</p>)
    } else if (line.trim()) {
      elements.push(<p key={k} className="pr-review-p">{line}</p>)
    }
  }
  return elements
}

function EvidenceSummary({ summary, serviceHints }: { summary: Record<string, number>; serviceHints: string[] }) {
  const stats = [
    { label: 'Sentry errors', value: summary.sentry_errors ?? 0, danger: summary.fatal_errors > 0 },
    { label: 'Error events', value: summary.total_error_events ?? 0, danger: (summary.total_error_events ?? 0) > 100 },
    { label: 'PD incidents', value: summary.pd_incidents ?? 0, danger: (summary.high_urgency_incidents ?? 0) > 0 },
    { label: 'Deploy chains', value: summary.author_deploy_errors ?? 0, danger: (summary.author_deploy_errors ?? 0) >= 2 },
    { label: 'Open tickets', value: summary.open_tickets ?? 0, danger: false },
  ]
  return (
    <div className="pr-evidence-summary">
      <p className="pr-evidence-label">Coral evidence · service: <strong>{serviceHints.slice(0, 2).join(', ')}</strong></p>
      <div className="pr-evidence-stats">
        {stats.map(s => (
          <div key={s.label} className={`pr-stat ${s.danger ? 'pr-stat-danger' : ''}`}>
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TraceSteps({ steps }: { steps: TraceStep[] }) {
  if (!steps.length) return null
  return (
    <div className="pr-trace">
      {steps.map(step => (
        <div key={step.id} className={`pr-trace-step pr-trace-${step.status}`}>
          <span className="pr-trace-icon">
            {step.status === 'running' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : step.status === 'done' ? (
              <CheckCircle className="h-3 w-3" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
          </span>
          <span className="pr-trace-label">{step.label}</span>
          {step.sources && step.sources.length > 1 && (
            <span className="pr-trace-sources">{step.sources.join(' × ')}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function ReviewCard({ result, onPost }: { result: ReviewResult; onPost: () => void }) {
  const [postState, setPostState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [postMsg, setPostMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const risk = RISK_CONFIG[result.risk_level as keyof typeof RISK_CONFIG] ?? RISK_CONFIG.LOW
  const RiskIcon = risk.icon

  async function handlePost() {
    setPostState('running')
    try {
      const res = await executeAction({
        action_id: result.draft_action.id,
        target: result.draft_action.target,
        body: result.draft_action.body,
        channel: result.draft_action.pr_ref,
      })
      if (res.success) {
        setPostState('done')
        setPostMsg(res.comment_url ? 'Posted' : 'Done')
        onPost()
      } else {
        setPostState('error')
        setPostMsg(res.reason || 'Failed')
      }
    } catch (err: unknown) {
      setPostState('error')
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (err as { message?: string })?.message || 'Failed'
      setPostMsg(msg.slice(0, 80))
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(result.review_text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="pr-review-card">
      <div className="pr-review-card-header">
        <div className="pr-review-pr-meta">
          <GitPullRequest className="h-4 w-4 text-slate-400" />
          <a href={result.pr_url} target="_blank" rel="noreferrer" className="pr-review-pr-link">
            PR #{result.pr_number}: {result.pr_title}
          </a>
          <ExternalLink className="h-3 w-3 text-slate-500" />
        </div>
        <span className={`pr-risk-badge ${risk.cls}`}>
          <RiskIcon className="h-3 w-3" />
          {risk.label}
        </span>
      </div>

      <p className="pr-review-author">
        @{result.pr_author} · {result.owner}/{result.repo} · {result.pr_state}
      </p>

      <EvidenceSummary summary={result.summary} serviceHints={result.service_hints} />

      <div className="pr-review-body">
        {renderReviewMarkdown(result.review_text)}
      </div>

      <div className="pr-review-actions">
        <button
          type="button"
          onClick={handlePost}
          disabled={postState === 'running' || postState === 'done'}
          className={[
            'pr-post-btn',
            postState === 'done'  ? 'pr-post-btn-done'    :
            postState === 'error' ? 'pr-post-btn-error'   :
            postState === 'running' ? 'pr-post-btn-loading' : '',
          ].join(' ')}
        >
          {postState === 'running' ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Posting…</>
          ) : postState === 'done' ? (
            <><CheckCircle className="h-3.5 w-3.5" /> {postMsg || 'Posted to GitHub'}</>
          ) : postState === 'error' ? (
            <><XCircle className="h-3.5 w-3.5" /> {postMsg}</>
          ) : (
            <><Send className="h-3.5 w-3.5" /> Post Review to GitHub</>
          )}
        </button>
        <button type="button" onClick={handleCopy} className="pr-copy-btn">
          {copied ? <><CheckCircle className="h-3.5 w-3.5" /> Copied</> : 'Copy review'}
        </button>
      </div>
    </div>
  )
}

export default function PRReviewAgent() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [steps, setSteps] = useState<TraceStep[]>([])
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const val = input.trim()
    if (!val || loading) return
    setLoading(true)
    setSteps([])
    setResult(null)
    setError('')

    const liveSteps: TraceStep[] = []

    function onStep(step: { type: string; id: string; status: string; label: string; sources?: string[] }) {
      const ts: TraceStep = {
        id: step.id,
        label: step.label,
        status: step.status as TraceStep['status'],
        sources: step.sources,
      }
      // upsert by id
      const idx = liveSteps.findIndex(s => s.id === step.id)
      if (idx >= 0) liveSteps[idx] = ts
      else liveSteps.push(ts)
      setSteps([...liveSteps])
    }

    try {
      const data = await prReviewStream(val, onStep)
      setResult(data as ReviewResult)
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Unknown error'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="pr-review-console">
      <div className="pr-review-hero">
        <div className="pr-review-hero-icon">
          <Bot className="h-7 w-7" />
        </div>
        <div>
          <h2 className="pr-review-hero-title">PR Review Agent</h2>
          <p className="pr-review-hero-desc">
            Paste a GitHub PR URL or number. The agent queries Coral SQL across GitHub, Sentry,
            PagerDuty, and Linear to write a data-backed review — then posts it directly to the PR.
          </p>
        </div>
      </div>

      <form className="pr-review-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="pr-review-input"
          placeholder="https://github.com/owner/repo/pull/123  or just  123"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="pr-review-submit" disabled={!input.trim() || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><GitPullRequest className="h-4 w-4" /> Review PR</>}
        </button>
      </form>

      <div className="pr-review-how">
        <span className="pr-review-how-step"><strong>1</strong> Fetches PR from Coral (GitHub)</span>
        <span className="pr-review-how-arrow">→</span>
        <span className="pr-review-how-step"><strong>2</strong> Sentry errors + PD incidents for service</span>
        <span className="pr-review-how-arrow">→</span>
        <span className="pr-review-how-step"><strong>3</strong> Author's deploy error history + Linear load</span>
        <span className="pr-review-how-arrow">→</span>
        <span className="pr-review-how-step"><strong>4</strong> Gemini writes review · you approve · posts</span>
      </div>

      {(loading || steps.length > 0) && !result && (
        <div className="pr-review-running">
          <div className="pr-review-running-header">
            <Bot className="h-4 w-4 text-coral-400" />
            <span>Agent running…</span>
          </div>
          <TraceSteps steps={steps} />
        </div>
      )}

      {error && (
        <div className="pr-review-error">
          <XCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <>
          <TraceSteps steps={steps} />
          <ReviewCard result={result} onPost={() => {}} />
          <CoralProofPanel proofs={result.proofs} title="PR Review SQL proof" />
        </>
      )}
    </section>
  )
}
