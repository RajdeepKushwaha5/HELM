import { useState, useRef } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  GitMerge,
  Loader2,
  PackagePlus,
  Search,
  Terminal,
  Ticket,
  Users,
  XCircle,
} from 'lucide-react'
import { handoverStream } from '../api'
import { CoralProofPanel } from './CoralProof'
import { SourceLogo } from './BrandMarks'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type StepStatus = 'idle' | 'running' | 'done' | 'error'

type Step = {
  id: string
  label: string
  icon: React.ElementType
  sources?: string[]
  status: StepStatus
}

const INITIAL_STEPS: Step[] = [
  { id: 'prs',       label: 'Fetching PR history…',        icon: GitMerge,   sources: ['github'],          status: 'idle' },
  { id: 'tickets',   label: 'Fetching open tickets…',      icon: Ticket,     sources: ['linear'],          status: 'idle' },
  { id: 'errors',    label: 'Tracing error ownership…',    icon: AlertTriangle, sources: ['github', 'sentry'], status: 'idle' },
  { id: 'synthesis', label: 'Synthesising brief…',         icon: DatabaseZap, status: 'idle' },
]

function StepRow({ step }: { step: Step }) {
  const Icon = step.icon
  return (
    <div className={cx('hb-step', `hb-step-${step.status}`)}>
      <div className="hb-step-icon-wrap">
        {step.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {step.status === 'done'    && <CheckCircle2 className="h-3.5 w-3.5" />}
        {step.status === 'error'   && <XCircle className="h-3.5 w-3.5" />}
        {step.status === 'idle'    && <Icon className="h-3.5 w-3.5" />}
      </div>
      <span className="hb-step-label">{step.label}</span>
      {step.sources && step.status !== 'idle' && (
        <div className="hb-step-sources">
          {step.sources.map(s => <SourceLogo key={s} source={s} className="h-3 w-3" />)}
        </div>
      )}
    </div>
  )
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={idx}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={idx}>{part.slice(1, -1)}</code>
    return <span key={idx}>{part}</span>
  })
}

function MarkdownBrief({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []

  lines.forEach((line, i) => {
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="hb-md-h1">{line.slice(2)}</h1>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="hb-md-h2">{line.slice(3)}</h2>)
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="hb-md-h3">{line.slice(4)}</h3>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={i} className="hb-md-li">{line.slice(2)}</li>)
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(<li key={i} className="hb-md-oli">{line.replace(/^\d+\.\s/, '')}</li>)
    } else if (line.startsWith('---')) {
      elements.push(<hr key={i} className="hb-md-hr" />)
    } else if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      elements.push(<p key={i} className="hb-md-italic">{line.replace(/^\*|\*$/g, '')}</p>)
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="hb-md-spacer" />)
    } else {
      elements.push(<p key={i} className="hb-md-p">{renderInline(line)}</p>)
    }
  })

  return <div className="hb-brief-body">{elements}</div>
}

export default function HandoverBrief() {
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function updateStep(id: string, patch: Partial<Step>) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  async function run() {
    const name = username.trim().replace(/^@/, '')
    if (!name || status === 'running') return
    setStatus('running')
    setError('')
    setResult(null)
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: 'idle' })))
    try {
      const final = await handoverStream(name, (step) => {
        updateStep(step.id, {
          label: step.label,
          status: step.status as StepStatus,
        })
      })
      setResult(final)
      setStatus('done')
    } catch (err: any) {
      setError(err?.message || 'Handover brief failed')
      setStatus('error')
    }
  }

  const summary = result?.summary

  return (
    <div className="hb-shell">
      {/* Header */}
      <div className="hb-header">
        <div className="hb-header-left">
          <PackagePlus className="h-5 w-5 hb-header-icon" />
          <div>
            <p className="hb-header-title">Developer Handover Brief</p>
            <span className="hb-header-sub">
              Enter a GitHub username — Helm queries Coral across GitHub × Linear × Sentry and generates a structured knowledge handover in seconds.
            </span>
          </div>
        </div>
        <div className="hb-sources-strip">
          {['github', 'linear', 'sentry'].map(s => (
            <div key={s} className="hb-source-chip">
              <SourceLogo source={s} className="h-3.5 w-3.5" />
              <span>{s}</span>
            </div>
          ))}
          <span className="hb-source-sep">3-source JOIN</span>
        </div>
      </div>

      {/* Input */}
      <div className="hb-input-row">
        <div className="hb-input-wrap">
          <span className="hb-at">@</span>
          <input
            ref={inputRef}
            className="hb-input"
            placeholder="github-username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
            disabled={status === 'running'}
            spellCheck={false}
          />
        </div>
        <button
          type="button"
          className="hb-run-btn"
          onClick={run}
          disabled={status === 'running' || !username.trim()}
        >
          {status === 'running' ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
          ) : (
            <><Search className="h-4 w-4" /> Generate Brief</>
          )}
        </button>
      </div>

      {/* Idle state hint */}
      {status === 'idle' && (
        <div className="hb-idle-hint">
          <div className="hb-idle-steps">
            <div className="hb-idle-step"><GitMerge className="h-3.5 w-3.5" /><span>GitHub PR history (6 months)</span></div>
            <div className="hb-idle-arrow">→</div>
            <div className="hb-idle-step"><Ticket className="h-3.5 w-3.5" /><span>Open Linear tickets</span></div>
            <div className="hb-idle-arrow">→</div>
            <div className="hb-idle-step"><AlertTriangle className="h-3.5 w-3.5" /><span>Sentry error ownership</span></div>
            <div className="hb-idle-arrow">→</div>
            <div className="hb-idle-step"><Terminal className="h-3.5 w-3.5" /><span>AI handover brief</span></div>
          </div>
          <p className="hb-idle-desc">
            3 live Coral SQL queries across GitHub, Linear, and Sentry — synthesised by Gemini into a structured markdown brief. No manual data collection.
          </p>
        </div>
      )}

      {/* Progress steps */}
      {status !== 'idle' && (
        <div className="hb-steps">
          {steps.map(step => <StepRow key={step.id} step={step} />)}
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="hb-error">
          <XCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Result */}
      {status === 'done' && result && (
        <>
          {/* Summary stats */}
          {summary && (
            <div className="hb-summary-bar">
              <div className="hb-summary-stat">
                <span className="hb-summary-num">{summary.pr_count}</span>
                <span className="hb-summary-label">PRs merged (6mo)</span>
              </div>
              <div className="hb-summary-div" />
              <div className="hb-summary-stat">
                <span className="hb-summary-num hb-num-amber">{summary.open_tickets}</span>
                <span className="hb-summary-label">open tickets to reassign</span>
              </div>
              <div className="hb-summary-div" />
              <div className="hb-summary-stat">
                <span className={cx('hb-summary-num', summary.live_errors > 0 ? 'hb-num-red' : 'hb-num-green')}>
                  {summary.live_errors}
                </span>
                <span className="hb-summary-label">live errors inherited</span>
              </div>
              <div className="hb-summary-div" />
              <div className="hb-summary-stat">
                <span className="hb-summary-num">+{summary.total_additions?.toLocaleString()}</span>
                <span className="hb-summary-label">lines added</span>
              </div>
            </div>
          )}

          {/* Brief text */}
          <div className="hb-brief-panel">
            <div className="hb-brief-header">
              <Users className="h-4 w-4" />
              <span>Handover Brief — @{result.username}</span>
              <span className="hb-brief-badge">Coral SQL · 3 sources</span>
            </div>
            <MarkdownBrief text={result.brief_text || ''} />
          </div>

          {/* Proofs */}
          <CoralProofPanel proofs={result.proofs || []} title="Handover Brief SQL proofs" />
        </>
      )}
    </div>
  )
}
