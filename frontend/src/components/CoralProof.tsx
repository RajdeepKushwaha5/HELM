import { useState } from 'react'
import { CheckCircle, Clipboard, Database, Gauge, GitBranch, Loader2, Rows3, Send, ShieldCheck, Table2, Terminal, XCircle } from 'lucide-react'
import { SourceBadge, SourceLogo } from './BrandMarks'

export interface CoralProof {
  name: string
  sql: string
  sources: string[]
  cross_source: boolean
  row_count: number
  duration_ms: number
  status: 'ok' | 'error' | 'running'
  error?: string | null
  mode?: string
  columns?: string[]
  sample_rows?: Record<string, unknown>[]
}

export interface DraftAction {
  id: string
  title: string
  target: string
  status: string
  body: string
}

const KEYWORDS = new Set([
  'SELECT', 'FROM', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'AND', 'OR',
  'WHERE', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'OFFSET', 'AS', 'WITH', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'DISTINCT', 'CAST', 'INTERVAL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IN', 'IS', 'NOT',
  'NULL', 'NULLS', 'DESC', 'ASC', 'LAST', 'FIRST', 'HAVING', 'UNION', 'ALL', 'EXISTS',
  'BETWEEN', 'LIKE', 'ILIKE', 'CURRENT_DATE', 'CURRENT_TIMESTAMP',
])

function tokenClass(token: string) {
  const upper = token.toUpperCase()
  if (token.startsWith('--')) return 'sql-token sql-comment'
  if (/^'.*'$/.test(token)) return 'sql-token sql-string'
  if (/^\d/.test(token)) return 'sql-token sql-number'
  if (KEYWORDS.has(upper)) return 'sql-token sql-keyword'
  if (/^[(),.*=<>+/-]+$/.test(token)) return 'sql-token sql-operator'
  if (/^[a-z_]+\.[a-z_]/i.test(token)) return 'sql-token sql-source'
  return 'sql-token sql-text'
}

function HighlightedLine({ line, lineNo }: { line: string; lineNo: number }) {
  const parts = line.split(/(--.*$|'[^']*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_.]*\b|[(),.*=<>+/-])/g)
  return (
    <div className="table-row">
      <span className="sql-line-number table-cell select-none pr-4 text-right">{lineNo}</span>
      <span className="table-cell whitespace-pre">
        {parts.map((part, i) => part ? <span key={i} className={tokenClass(part)}>{part}</span> : null)}
      </span>
    </div>
  )
}

export function SqlBlock({ sql }: { sql: string }) {
  return (
    <pre className="sql-block overflow-x-auto rounded-lg p-4 text-xs leading-relaxed">
      <code className="table">
        {sql.trim().split('\n').map((line, i) => (
          <HighlightedLine key={`${i}-${line}`} line={line} lineNo={i + 1} />
        ))}
      </code>
    </pre>
  )
}

export function CoralRuntimeBadge({ meta }: { meta?: { durationMs: number; mode: string; description?: string } }) {
  if (!meta) return null
  const isCache = meta.mode === 'Coral Cache'
  return (
    <span
      title={meta.description}
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium ${
        isCache
          ? 'border-safe/30 bg-safe/10 text-safe'
          : 'border-coral-400/30 bg-coral-500/10 text-coral-300'
      }`}
    >
      {isCache ? <Gauge className="h-3 w-3" /> : <Database className="h-3 w-3" />}
      {meta.durationMs}ms · {meta.mode}
    </span>
  )
}

function StatusPill({ proof }: { proof: CoralProof }) {
  const ok = proof.status === 'ok'
  const isCacheHit = ok && proof.duration_ms > 0 && proof.duration_ms < 250
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium ${
        ok ? 'border-safe/30 bg-safe/10 text-safe' : 'border-danger/30 bg-danger/10 text-danger'
      }`}>
        {ok ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
        {proof.status} · {proof.row_count} rows · {proof.duration_ms}ms
      </span>
      {isCacheHit && (
        <span className="coral-cache-pill inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-bold">
          <Gauge className="h-3 w-3" />
          ⚡ CACHE HIT
        </span>
      )}
    </div>
  )
}

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 100)
  const text = String(value)
  return text.length > 100 ? `${text.slice(0, 97)}...` : text
}

function visibleProofColumns(proof: CoralProof, columns: string[]) {
  if (columns.includes('pr_number') && columns.includes('error_title')) {
    return ['pr_number', 'pr_title', 'error_title', 'level', 'author'].filter(column => columns.includes(column))
  }
  return columns.slice(0, 5)
}

function QueryVisual({ proof }: { proof: CoralProof }) {
  const rows = proof.sample_rows || []
  const columns = proof.columns?.length ? proof.columns : rows[0] ? Object.keys(rows[0]) : []
  const visibleColumns = visibleProofColumns(proof, columns)

  return (
    <div className="space-y-4">
      <div className="proof-source-chain flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        {(proof.sources || []).map((source, index) => (
          <div key={`${source}-${index}`} className="flex items-center gap-2">
            <span className="proof-source-logo flex h-8 w-8 items-center justify-center rounded-lg bg-white text-navy-900">
              <SourceLogo source={source} className="h-4 w-4" />
            </span>
            <span className="proof-source-name text-xs font-semibold uppercase tracking-wider">{source}</span>
            {index < (proof.sources || []).length - 1 && (
              <span className="proof-source-join rounded border px-2 py-0.5 text-[10px] font-bold">
                {proof.cross_source ? 'JOIN' : 'READ'}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <Rows3 className="mb-2 h-4 w-4 text-coral-400" />
          <p className="proof-stat-value text-xl font-bold text-white">{proof.row_count ?? 0}</p>
          <p className="text-xs text-slate-500">rows returned</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <Table2 className="mb-2 h-4 w-4 text-coral-400" />
          <p className="proof-stat-value text-xl font-bold text-white">{columns.length}</p>
          <p className="text-xs text-slate-500">columns visible</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <Gauge className="mb-2 h-4 w-4 text-coral-400" />
          <p className="proof-stat-value text-xl font-bold text-white">{proof.duration_ms ? `${proof.duration_ms}ms` : '—'}</p>
          <p className="text-xs text-slate-500">runtime</p>
        </div>
      </div>

      {rows.length > 0 && visibleColumns.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="proof-result-table min-w-full text-left text-xs">
            <thead className="proof-result-head">
              <tr>
                {visibleColumns.map(column => (
                  <th key={column} className="px-3 py-2 font-semibold uppercase tracking-wider">
                    {column.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="proof-result-row">
                  {visibleColumns.map(column => (
                    <td key={column} className="proof-result-cell max-w-[18rem] px-3 py-2 align-top">
                      {formatCell(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-500">
          Query completed with no rows. The visual still proves source path, status, row count, and runtime.
        </div>
      )}
    </div>
  )
}

function ProofItem({ proof, index }: { proof: CoralProof; index: number }) {
  const [mode, setMode] = useState<'visual' | 'sql'>('visual')

  return (
    <details className="rounded-lg border border-white/10 bg-white/[0.025] p-3" open={index === 0}>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-200 proof-item-name">{proof.name}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(proof.sources || []).map(source => <SourceBadge key={source} source={source} />)}
              {proof.cross_source && (
                <span className="inline-flex items-center gap-1 rounded border border-coral-400/25 bg-coral-400/10 px-2 py-0.5 text-xs text-coral-300">
                  <GitBranch className="h-3 w-3" /> cross-source
                </span>
              )}
            </div>
          </div>
          <StatusPill proof={proof} />
        </div>
      </summary>
      <div className="mt-3 space-y-3">
        <div className="proof-toggle inline-flex rounded-lg p-1">
          <button
            type="button"
            onClick={() => setMode('visual')}
            className={`proof-toggle-btn rounded-md px-3 py-1 text-xs font-semibold transition-colors ${mode === 'visual' ? 'active' : ''}`}
          >
            Visual output
          </button>
          <button
            type="button"
            onClick={() => setMode('sql')}
            className={`proof-toggle-btn rounded-md px-3 py-1 text-xs font-semibold transition-colors ${mode === 'sql' ? 'active' : ''}`}
          >
            SQL query
          </button>
        </div>
        {proof.error && <p className="rounded border border-danger/20 bg-danger/10 p-2 text-xs text-danger">{proof.error}</p>}
        {mode === 'visual' ? <QueryVisual proof={proof} /> : <SqlBlock sql={proof.sql} />}
      </div>
    </details>
  )
}

export function CoralProofPanel({ proofs = [], title = 'Coral proof' }: { proofs?: CoralProof[]; title?: string }) {
  if (!proofs.length) return null
  const okCount = proofs.filter(proof => proof.status === 'ok').length
  return (
    <div className="glass rounded-xl border border-coral-500/15 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-coral-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-coral-400">{title}</span>
        </div>
        <span className="text-xs text-slate-500">{okCount}/{proofs.length} query proofs ok</span>
      </div>
      <div className="mb-3 flex items-center gap-1.5 rounded border border-safe/20 bg-safe/5 px-2.5 py-1.5 text-xs text-safe/80">
        <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 text-safe" />
        <span>External source data is treated as structured evidence, not instructions. Helm writes nothing without human approval.</span>
      </div>
      <div className="space-y-3">
        {proofs.map((proof, index) => <ProofItem key={`${proof.name}-${index}`} proof={proof} index={index} />)}
      </div>
    </div>
  )
}

export function SourceHealthPanel({ health }: { health?: any }) {
  if (!health?.sources?.length) return null
  return (
    <div className="glass rounded-xl border border-white/10 p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-coral-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-coral-400">Coral source health</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {health.sources.map((source: any) => {
          const ok = source.status === 'ok'
          return (
            <div key={source.name} className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-200">{source.name}</span>
                {ok ? <CheckCircle className="h-4 w-4 text-safe" /> : <XCircle className="h-4 w-4 text-warn" />}
              </div>
              <p className="text-xs text-slate-500">{source.table_count || 0} tables · {source.last_test?.status || 'unknown'}</p>
              {!!source.missing_inputs?.length && (
                <p className="mt-1 text-xs text-warn">missing: {source.missing_inputs.join(', ')}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

async function copyDraftToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const el = document.createElement('textarea')
  el.value = text
  el.style.cssText = 'position:fixed;top:-9999px'
  document.body.appendChild(el)
  el.focus()
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
}

function HelmDraftActionCard({ action, onExecute }: { action: DraftAction; onExecute?: (action: DraftAction) => Promise<void> }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [execState, setExecState] = useState<'idle' | 'running' | 'sent' | 'error'>('idle')
  const [execResult, setExecResult] = useState<string>('')

  async function handleCopy() {
    try {
      await copyDraftToClipboard(action.body)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 2400)
    }
  }

  async function handleExecute() {
    if (!onExecute || execState === 'running' || execState === 'sent') return
    setExecState('running')
    try {
      await onExecute(action)
      setExecState('sent')
      setExecResult('Sent')
    } catch (err: unknown) {
      setExecState('error')
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (err as { message?: string })?.message
        || 'Failed'
      setExecResult(msg.slice(0, 80))
      window.setTimeout(() => { setExecState('idle'); setExecResult('') }, 4000)
    }
  }

  const isGitHub = action.target.toLowerCase().includes('github')

  return (
    <div className="draft-action-card rounded-lg border border-white/10 bg-white/[0.025] p-3">
      <p className="text-sm font-medium text-slate-200">{action.title}</p>
      <p className="mt-1 text-xs text-coral-300">{action.target} · approval required</p>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">{action.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className={[
            'flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition-colors',
            copyState === 'copied'
              ? 'border-green-500/40 text-green-400'
              : copyState === 'error'
              ? 'border-red-500/40 text-red-400'
              : 'border-white/10 text-slate-400 hover:border-coral-500/40 hover:text-coral-300',
          ].join(' ')}
        >
          {copyState === 'copied' ? (
            <><CheckCircle className="h-3 w-3" /> Copied!</>
          ) : copyState === 'error' ? (
            <><XCircle className="h-3 w-3" /> Failed</>
          ) : (
            'Copy draft'
          )}
        </button>
        {onExecute && !isGitHub && (
          <button
            type="button"
            onClick={handleExecute}
            disabled={execState === 'running' || execState === 'sent'}
            className={[
              'flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold transition-colors',
              execState === 'sent'
                ? 'border-green-500/40 bg-green-500/10 text-green-400'
                : execState === 'error'
                ? 'border-red-500/40 text-red-400'
                : execState === 'running'
                ? 'cursor-wait border-coral-500/30 text-coral-400'
                : 'border-coral-500/40 bg-coral-500/10 text-coral-300 hover:bg-coral-500/20',
            ].join(' ')}
          >
            {execState === 'running' ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Sending…</>
            ) : execState === 'sent' ? (
              <><CheckCircle className="h-3 w-3" /> {execResult || 'Sent'}</>
            ) : execState === 'error' ? (
              <><XCircle className="h-3 w-3" /> {execResult || 'Error'}</>
            ) : (
              <><Send className="h-3 w-3" /> Approve &amp; Send</>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export function ApprovalDraftPanel({ actions = [], onExecute }: { actions?: DraftAction[]; onExecute?: (action: DraftAction) => Promise<void> }) {
  if (!actions.length) return null
  return (
    <div className="approval-draft-panel glass rounded-xl border border-warn/20 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clipboard className="h-4 w-4 text-warn" />
        <span className="text-xs font-semibold uppercase tracking-wider text-warn">Actions awaiting approval</span>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {actions.map(action => (
          <HelmDraftActionCard key={action.id} action={action} onExecute={onExecute} />
        ))}
      </div>
    </div>
  )
}
