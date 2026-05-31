import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CheckCircle, ChevronRight, Database, Play, Terminal, Zap } from 'lucide-react'
import { sandboxQuery, fetchSandboxTemplates } from '../api'
import { SqlBlock } from './CoralProof'
import { SourceBadge } from './BrandMarks'

const ALL_SOURCES = ['github', 'sentry', 'pagerduty', 'linear', 'slack']

function detectSqlSources(sql: string): string[] {
  const normalized = sql.toLowerCase()
  return ALL_SOURCES.filter(source =>
    new RegExp(`\\b${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\.`, 'i').test(normalized)
  )
}

function estimatedRestMs(sourceCount: number): number {
  if (sourceCount <= 1) return 800
  if (sourceCount === 2) return 2500
  if (sourceCount === 3) return 5000
  return 7500
}

function SpeedRibbon({ actualMs, sourceCount }: { actualMs: number; sourceCount: number }) {
  const estimatedMs = estimatedRestMs(sourceCount)
  const maxMs = Math.max(actualMs, estimatedMs, 1)
  const ratio = Math.round(estimatedMs / Math.max(actualMs, 1))
  const coralPct = Math.max(4, Math.round((actualMs / maxMs) * 100))
  const restPct = Math.max(4, Math.round((estimatedMs / maxMs) * 100))

  if (sourceCount <= 1) {
    return (
      <div className="sandbox-perf-ribbon sandbox-perf-single">
        <div className="sandbox-perf-header">
          <span>Single-source Coral query</span>
          <b className="sandbox-perf-badge neutral">Live source</b>
        </div>
        <div className="sandbox-perf-row">
          <span className="sandbox-perf-label">Coral SQL</span>
          <div className="sandbox-perf-bar-wrap">
            <div
              className="sandbox-perf-bar coral"
              style={{ '--bar-pct': `${coralPct}%` } as React.CSSProperties}
            />
          </div>
          <span className="sandbox-perf-value coral">{actualMs}ms</span>
        </div>
        <p className="sandbox-perf-note">
          This is one live source, so the result emphasizes schema discovery, proof, and safe read-only execution.
          Pick a cross-source template to show Coral replacing multi-API polling and manual joins.
        </p>
      </div>
    )
  }

  return (
    <div className="sandbox-perf-ribbon">
      <div className="sandbox-perf-header">
        <span>Performance vs REST API polling</span>
        {ratio >= 2 && (
          <b className="sandbox-perf-badge">⚡ {ratio}× faster</b>
        )}
      </div>
      <div className="sandbox-perf-row">
        <span className="sandbox-perf-label">Coral SQL</span>
        <div className="sandbox-perf-bar-wrap">
          <div
            className="sandbox-perf-bar coral"
            style={{ '--bar-pct': `${coralPct}%` } as React.CSSProperties}
          />
        </div>
        <span className="sandbox-perf-value coral">{actualMs}ms</span>
      </div>
      <div className="sandbox-perf-row">
        <span className="sandbox-perf-label">{sourceCount} REST call{sourceCount !== 1 ? 's' : ''}</span>
        <div className="sandbox-perf-bar-wrap">
          <div
            className="sandbox-perf-bar rest"
            style={{ '--bar-pct': `${restPct}%` } as React.CSSProperties}
          />
        </div>
        <span className="sandbox-perf-value rest">~{estimatedMs.toLocaleString()}ms est.</span>
      </div>
      {sourceCount > 1 && (
        <p className="sandbox-perf-note">
          A REST loop needs {sourceCount} sequential API calls plus manual join logic in application code.
          Coral executes the entire plan in one federated query.
        </p>
      )}
    </div>
  )
}

export default function SqlSandbox() {
  const [sql, setSql] = useState('')
  const [sources, setSources] = useState<string[]>(['github', 'sentry'])
  const [result, setResult] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const templates = useQuery({
    queryKey: ['sandbox-templates'],
    queryFn: fetchSandboxTemplates,
    staleTime: Infinity,
  })

  function applyTemplate(tmpl: any) {
    setSql(tmpl.sql)
    setSources(tmpl.sources)
    setResult(null)
    setRunError(null)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function toggleSource(source: string) {
    setSources(prev =>
      prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]
    )
  }

  async function runQuery() {
    if (!sql.trim() || running) return
    const querySources = detectSqlSources(sql)
    const effectiveSources = sources.length ? sources : querySources
    setRunning(true)
    setRunError(null)
    setResult(null)
    try {
      const data = await sandboxQuery(sql, effectiveSources)
      setResult(data)
    } catch (err: any) {
      setRunError(err?.response?.data?.detail || err?.message || 'Query failed — check the SQL syntax and selected sources.')
    } finally {
      setRunning(false)
    }
  }

  const proof = result?.proof
  const rows: any[] = result?.rows || []
  const columns = rows[0] ? Object.keys(rows[0]) : []
  const sqlSources = detectSqlSources(sql)
  const visibleSources = sources
  const displayedSources = result ? (sqlSources.length ? sqlSources : proof?.sources || sources) : visibleSources
  const displayedSourceCount = displayedSources.length

  return (
    <div className="sandbox-shell">
      <div className="sandbox-header">
        <div className="sandbox-header-left">
          <Terminal className="h-5 w-5" style={{ color: 'var(--green)' }} />
          <div>
            <p className="sandbox-header-title">Coral SQL Sandbox</p>
            <span className="sandbox-header-sub">
              Run any read-only SELECT query across live sources. Coral joins them in a single federated plan.
            </span>
          </div>
        </div>
        <div className="sandbox-live-badge">
          <span className="sandbox-live-dot" />
          Live Coral engine
        </div>
      </div>

      {templates.data?.templates && (
        <div className="sandbox-templates">
          <span className="sandbox-templates-label">Templates:</span>
          {templates.data.templates.map((tmpl: any) => (
            <button
              key={tmpl.id}
              type="button"
              className="sandbox-template-pill"
              onClick={() => applyTemplate(tmpl)}
              title={tmpl.description}
            >
              <ChevronRight className="h-3 w-3" />
              {tmpl.label}
              {tmpl.sources.length > 1 && (
                <span className="sandbox-template-cross">cross-source</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="sandbox-editor-wrap">
        <textarea
          ref={textareaRef}
          className="sandbox-editor"
          value={sql}
          onChange={e => setSql(e.target.value)}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              runQuery()
            }
          }}
          placeholder={`-- Write a Coral SQL query or pick a template above\nSELECT g.number, g.title, s.title AS error_title\nFROM github.pulls g\nJOIN sentry.issues s\n  ON g.merged_at <= s.first_seen\nLIMIT 20`}
          spellCheck={false}
          rows={9}
        />
        <div className="sandbox-editor-footer">
          <div className="sandbox-source-toggles">
            <span className="sandbox-source-label">Enabled sources</span>
            {ALL_SOURCES.map(source => (
              <button
                key={source}
                type="button"
                className={`sandbox-source-toggle${visibleSources.includes(source) ? ' active' : ''}`}
                onClick={() => toggleSource(source)}
                title={visibleSources.includes(source)
                  ? `${source} is enabled for sandbox execution`
                  : `${source} is disabled for sandbox execution`}
              >
                {source}
              </button>
            ))}
            <span className="sandbox-source-hint">SQL decides which enabled sources are used</span>
          </div>
          <div className="sandbox-run-group">
            <span className="sandbox-run-hint">Ctrl+Enter</span>
            <button
              type="button"
              className="sandbox-run-btn"
              onClick={runQuery}
              disabled={running || !sql.trim()}
            >
              {running ? (
                <>
                  <span className="sandbox-run-spinner" />
                  Running…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Query
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {runError && (
        <div className="sandbox-error">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{runError}</span>
        </div>
      )}

      {result && (
        <div className="sandbox-results">
          <div className="sandbox-results-header">
            <div className="sandbox-results-meta">
              <CheckCircle className="h-4 w-4" style={{ color: 'var(--green)' }} />
              <span className="sandbox-results-count">
                {rows.length} row{rows.length !== 1 ? 's' : ''} returned
              </span>
              {displayedSourceCount > 1 && (
                <span className="sandbox-cross-badge">
                  <Database className="h-3 w-3" />
                  {displayedSourceCount}-source join
                </span>
              )}
            </div>
            <div className="sandbox-source-badges">
              {displayedSources.map((s: string) => (
                <SourceBadge key={s} source={s} />
              ))}
            </div>
          </div>

          {proof && proof.duration_ms > 0 && (
            <SpeedRibbon actualMs={proof.duration_ms} sourceCount={displayedSourceCount} />
          )}

          {rows.length > 0 && columns.length > 0 ? (
            <div className="sandbox-table-wrap">
              <table className="sandbox-table">
                <thead>
                  <tr>
                    {columns.map(col => (
                      <th key={col}>{col.replace(/_/g, ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {columns.map(col => (
                        <td key={col} title={row[col] != null ? String(row[col]) : ''}>
                          {row[col] === null || row[col] === undefined
                            ? '—'
                            : typeof row[col] === 'object'
                            ? JSON.stringify(row[col]).slice(0, 80)
                            : String(row[col]).slice(0, 120)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="sandbox-empty-results">
              Query completed with 0 rows. The proof still confirms source connectivity, execution plan, and runtime.
            </div>
          )}

          {proof && (
            <details className="sandbox-proof-detail">
              <summary className="sandbox-proof-summary">
                <Terminal className="h-3.5 w-3.5" />
                Coral execution proof
                <span className={`sandbox-proof-status ${proof.status === 'ok' ? 'ok' : 'error'}`}>
                  {proof.status}
                </span>
                <span className="sandbox-proof-ms">{proof.duration_ms}ms</span>
              </summary>
              <div className="sandbox-proof-body">
                <SqlBlock sql={sql} />
              </div>
            </details>
          )}
        </div>
      )}

      {!result && !runError && !running && (
        <div className="sandbox-idle-hint">
          <Zap className="h-6 w-6" />
          <p>Pick a template or write your own query</p>
          <span>
            Any SELECT across GitHub, Sentry, PagerDuty, Linear, or Slack — Coral joins live sources
            without ETL, pipelines, or a data warehouse.
          </span>
        </div>
      )}
    </div>
  )
}
