import { useEffect, useRef, useState } from 'react'
import { Bot, Brain, CheckCircle, DatabaseZap, Loader2, Send, ShieldCheck, Sparkles, User, XCircle } from 'lucide-react'
import { askHelmStream, executeAction } from '../api'
import { ApprovalDraftPanel, CoralProofPanel, type CoralProof, type DraftAction } from './CoralProof'

interface TraceStep {
  id: string
  label: string
  status: 'running' | 'done' | 'error'
  sources?: string[]
  elapsedMs?: number
}

interface Message {
  role: 'user' | 'assistant'
  text: string
  proofs?: CoralProof[]
  draftActions?: DraftAction[]
  traceSteps?: TraceStep[]
  isError?: boolean
  ts: number
}

const SUGGESTIONS = [
  'Prove which PR caused the latest production error.',
  'What changed right before checkout started failing?',
  'Which service is one deploy away from an incident?',
  'Who should review the risky fix before we merge?',
  'What should we rollback, fix, or watch next?',
  'Show the GitHub to Sentry evidence chain.',
]

function renderInlineText(text: string) {
  const parts = text.split(/(`[^`]+`|https?:\/\/[^\s)]+)/g).filter(Boolean)
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>
    }
    if (/^https?:\/\//.test(part)) {
      const href = part.replace(/[.,;:]$/, '')
      return (
        <a key={`${part}-${index}`} href={href} target="_blank" rel="noreferrer">
          {href.replace(/^https:\/\/github\.com\/RajdeepKushwaha5\/nimbus-checkout-api\/pull\//, 'PR #')}
        </a>
      )
    }
    return <span key={`${part}-${index}`}>{part}</span>
  })
}

function MessageText({ text, isUser }: { readonly text: string; readonly isUser: boolean }) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const sentences = normalized
    .split(/(?<=[.!?])\s+(?=(?:For example|Similarly|Each|This|The|GitHub|PR|It)\b)/)
    .map(part => part.trim())
    .filter(Boolean)

  if (isUser || sentences.length < 3) {
    return <div className="chat-answer"><p>{renderInlineText(text)}</p></div>
  }

  const [lead, ...details] = sentences
  return (
    <div className="chat-answer chat-answer-brief">
      <p>{renderInlineText(lead)}</p>
      <ul>
        {details.map(sentence => (
          <li key={sentence}>{renderInlineText(sentence)}</li>
        ))}
      </ul>
    </div>
  )
}

function AgentTraceSteps({ steps }: { readonly steps: TraceStep[] }) {
  if (!steps.length) return null
  const doneCount = steps.filter(s => s.status === 'done').length
  const totalElapsed = steps.reduce((sum, s) => sum + (s.elapsedMs ?? 0), 0)
  return (
    <div className="agent-trace">
      <div className="agent-trace-header">
        <DatabaseZap className="h-3 w-3" />
        <span>{doneCount}/{steps.length} steps</span>
        {totalElapsed > 0 && <span className="agent-trace-elapsed">{totalElapsed}ms total</span>}
      </div>
      {steps.map(step => (
        <div key={step.id} className={`agent-trace-step agent-trace-${step.status}`}>
          <span className="agent-trace-icon">
            {step.status === 'running' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : step.status === 'done' ? (
              <CheckCircle className="h-3 w-3" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
          </span>
          <span className="agent-trace-label">{step.label}</span>
          {step.sources && step.sources.length > 1 && (
            <span className="agent-trace-sources">{step.sources.join(' × ')}</span>
          )}
          {step.elapsedMs != null && step.status === 'done' && (
            <span className="agent-trace-ms">{step.elapsedMs}ms</span>
          )}
        </div>
      ))}
    </div>
  )
}

function MessageBubble({ msg, onExecute }: { readonly msg: Message; readonly onExecute: (action: DraftAction) => Promise<void> }) {
  const isUser = msg.role === 'user'
  const proofCount = msg.proofs?.length ?? 0
  const crossSourceCount = msg.proofs?.filter(proof => proof.cross_source).length ?? 0
  const rowCount = msg.proofs?.reduce((total, proof) => total + (proof.row_count || 0), 0) ?? 0

  return (
    <article className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      <div className="chat-avatar">
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className="chat-message-stack">
        <div className={`chat-bubble${msg.isError ? ' chat-bubble-error' : ''}`}>
          <div className="chat-bubble-meta">
            <span>{isUser ? 'You' : 'Helm analyst'}</span>
            <time>{new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          </div>
          {msg.traceSteps && msg.traceSteps.length > 0 && (
            <AgentTraceSteps steps={msg.traceSteps} />
          )}
          <MessageText text={msg.text} isUser={isUser} />
        </div>
        {!isUser && (!!msg.proofs?.length || !!msg.draftActions?.length) && (
          <div className="chat-evidence">
            {proofCount > 0 && (
              <div className="ask-coral-advantage" aria-label="Coral retrieval advantage">
                <div>
                  <DatabaseZap className="h-4 w-4" />
                  <span>Coral plan</span>
                  <strong>{proofCount} SQL {proofCount === 1 ? 'proof' : 'proofs'}</strong>
                </div>
                <div>
                  <ShieldCheck className="h-4 w-4" />
                  <span>Joined safely</span>
                  <strong>{crossSourceCount} cross-source</strong>
                </div>
                <div>
                  <Sparkles className="h-4 w-4" />
                  <span>Structured rows</span>
                  <strong>{rowCount} returned</strong>
                </div>
                <div className="ask-token-compare">
                  <div className="ask-token-col ask-token-bad">
                    <span>Direct MCP tools</span>
                    <strong>~313k tokens</strong>
                    <small>29+ parallel calls</small>
                  </div>
                  <div className="ask-token-vs">vs</div>
                  <div className="ask-token-col ask-token-good">
                    <span>Coral SQL</span>
                    <strong>~112k tokens</strong>
                    <small>1 federated query</small>
                  </div>
                </div>
                <p>Coral's benchmarked retrieval path replaces direct API tool loops with compact SQL results.</p>
              </div>
            )}
            <ApprovalDraftPanel actions={msg.draftActions} onExecute={onExecute} />
            <CoralProofPanel proofs={msg.proofs} title="Ask Helm SQL proof" />
          </div>
        )}
      </div>
    </article>
  )
}

export default function AskHelm() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: "I'm connected to your live Coral sources. Ask about burnout, releases, services, incidents, or delivery risk and I'll answer with fresh SQL proof.",
      ts: Date.now(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [liveSteps, setLiveSteps] = useState<TraceStep[]>([])
  const [memoryTurns, setMemoryTurns] = useState(0)
  const sessionIdRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, liveSteps])

  async function handleExecuteAction(action: DraftAction) {
    await executeAction({ action_id: action.id, target: action.target, body: action.body })
  }

  async function send(question?: string) {
    const q = question ?? input.trim()
    if (!q || loading) return
    setInput('')
    setLiveSteps([])
    setMessages(prev => [...prev, { role: 'user', text: q, ts: Date.now() }])
    setLoading(true)

    const collectedSteps: TraceStep[] = []
    const stepStartTimes = new Map<string, number>()

    function onStep(step: { type: string; id: string; status: string; label: string; sources?: string[] }) {
      const now = performance.now()
      let elapsedMs: number | undefined
      if (step.status === 'running') {
        stepStartTimes.set(step.id, now)
      } else if (step.status === 'done' || step.status === 'error') {
        const start = stepStartTimes.get(step.id)
        if (start != null) elapsedMs = Math.round(now - start)
      }
      const ts: TraceStep = { id: step.id, label: step.label, status: step.status as TraceStep['status'], sources: step.sources, elapsedMs }
      const existing = collectedSteps.findIndex(s => s.id === step.id)
      if (existing >= 0) {
        collectedSteps[existing] = ts
      } else {
        collectedSteps.push(ts)
      }
      setLiveSteps([...collectedSteps])
    }

    try {
      const data = await askHelmStream(q, onStep, sessionIdRef.current ?? undefined)
      if (data.session_id) sessionIdRef.current = data.session_id
      if (data.history_turns !== undefined) setMemoryTurns(data.history_turns + 1)
      setLiveSteps([])
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: data.answer ?? 'No answer returned.',
        proofs: data.proofs as CoralProof[],
        draftActions: data.draft_actions as DraftAction[],
        traceSteps: collectedSteps,
        ts: Date.now(),
      }])
    } catch (err: unknown) {
      setLiveSteps([])
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err as { message?: string })?.message ||
        'Unknown error'
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `Backend error: ${detail}. Check that the server is running on port 8000.`,
        ts: Date.now(),
        isError: true,
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="ask-console">
      <aside className="ask-sidecar">
        <div className="ask-orb">
          <Bot className="h-8 w-8" />
        </div>
        <div>
          <p>Live analyst</p>
          <span>Every response calls the backend and attaches Coral proof when available.</span>
        </div>
        <div className="ask-signal-list">
          <span><DatabaseZap className="h-4 w-4" /> Live API</span>
          <span><ShieldCheck className="h-4 w-4" /> Draft-only actions</span>
          <span><Sparkles className="h-4 w-4" /> Gemini reasoning</span>
          <span className={memoryTurns > 0 ? 'ask-memory-active' : 'ask-memory-idle'}>
            <Brain className="h-4 w-4" />
            {memoryTurns > 0 ? `Memory: ${memoryTurns} turn${memoryTurns !== 1 ? 's' : ''}` : 'Memory ready'}
          </span>
        </div>
      </aside>

      <div className="chat-panel">
        <div className="chat-suggestions">
          {SUGGESTIONS.map(suggestion => (
            <button key={suggestion} type="button" onClick={() => send(suggestion)} disabled={loading}>
              <Sparkles className="h-3.5 w-3.5" />
              {suggestion}
            </button>
          ))}
        </div>

        <div className="chat-stream">
          {messages.map(msg => (
            <MessageBubble key={`${msg.role}-${msg.ts}`} msg={msg} onExecute={handleExecuteAction} />
          ))}
          {loading && (
            <article className="chat-message assistant">
              <div className="chat-avatar">
                <Bot className="h-4 w-4" />
              </div>
              <div className="chat-bubble thinking">
                {liveSteps.length > 0 ? (
                  <AgentTraceSteps steps={liveSteps} />
                ) : (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Starting agent…</span>
                  </>
                )}
              </div>
            </article>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="chat-composer"
          onSubmit={event => {
            event.preventDefault()
            send()
          }}
        >
          <input
            placeholder="Ask Helm about incidents, releases, services, or team risk..."
            value={input}
            onChange={event => setInput(event.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={!input.trim() || loading} title="Send question">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </form>
      </div>
    </section>
  )
}
