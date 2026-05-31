import { useState } from 'react'
import { AlertTriangle, CheckCircle, ChevronDown, Database, XCircle } from 'lucide-react'
import { SourceLogo } from './BrandMarks'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const SOURCE_ORDER = ['github', 'sentry', 'pagerduty', 'linear', 'slack']
const SOURCE_LABELS: Record<string, string> = {
  github:    'GitHub',
  sentry:    'Sentry',
  pagerduty: 'PagerDuty',
  linear:    'Linear',
  slack:     'Slack',
}

function StatusPill({ status }: { status: string }) {
  if (status === 'ready')
    return <span className="srm-pill srm-pill-ready"><CheckCircle className="h-3 w-3" />Ready</span>
  if (status === 'degraded')
    return <span className="srm-pill srm-pill-degraded"><AlertTriangle className="h-3 w-3" />Degraded</span>
  return <span className="srm-pill srm-pill-blocked"><XCircle className="h-3 w-3" />Blocked</span>
}

interface Props {
  readiness?: any
  isLoading?: boolean
  onGoToSetup?: () => void
}

export default function SourceReadinessMatrix({ readiness, isLoading, onGoToSetup }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (isLoading && !readiness) {
    return (
      <section className="srm-container">
        <div className="srm-header">
          <Database className="h-3.5 w-3.5 text-slate-400" />
          <span className="srm-title">Source Readiness</span>
        </div>
        <div className="srm-rows">
          {SOURCE_ORDER.map(s => (
            <div key={s} className="srm-row-skeleton shimmer" />
          ))}
        </div>
      </section>
    )
  }

  if (!readiness?.sources) return null

  const sources = readiness.sources as Record<string, any>
  const checkedAt = readiness.checked_at ? new Date(readiness.checked_at) : null
  const minutesAgo = checkedAt ? Math.floor((Date.now() - checkedAt.getTime()) / 60000) : null
  const readyCount = Object.values(sources).filter(s => s.status === 'ready').length
  const totalCount = SOURCE_ORDER.filter(s => sources[s]).length
  const allReady = readyCount === totalCount

  return (
    <section className="srm-container">
      <div className="srm-header">
        <div className="srm-header-left">
          <Database className="h-3.5 w-3.5" />
          <span className="srm-title">Source Readiness</span>
          <span className={cx('srm-count', allReady ? 'srm-count-ok' : 'srm-count-warn')}>
            {readyCount}/{totalCount}
          </span>
          <span className="srm-subtitle">contract checks passed</span>
        </div>
        <div className="srm-header-right">
          {minutesAgo !== null && (
            <span className="srm-age">
              {minutesAgo < 1 ? 'just now' : `${minutesAgo}m ago`}
            </span>
          )}
          {onGoToSetup && (
            <button type="button" className="srm-detail-link" onClick={onGoToSetup}>
              Full details
            </button>
          )}
        </div>
      </div>

      <div className="srm-rows">
        {SOURCE_ORDER.filter(s => sources[s]).map(source => {
          const src = sources[source]
          const isExpanded = expanded === source
          const hasIssues = src.status !== 'ready'

          const missingItems: string[] = [
            ...src.missing_tables.map((t: string) => `table ${t}`),
            ...src.missing_functions.map((f: string) => `${f}()`),
            ...src.missing_credentials.map((c: string) => c),
            ...Object.entries(src.missing_columns as Record<string, string[]>).flatMap(
              ([t, cols]) => (cols as string[]).map(c => `${t}.${c}`)
            ),
          ]

          const tablesText = src.tables_present.slice(0, 4).join(' · ')
          const hasMoreTables = src.tables_present.length > 4
          const fnText = (src.functions_present as Array<{ name: string }>)
            .map(f => `${f.name}()`)
            .join(' · ')

          return (
            <div
              key={source}
              className={cx('srm-row', `srm-row-${src.status}`, hasIssues && 'srm-row-clickable')}
              onClick={() => hasIssues && setExpanded(isExpanded ? null : source)}
            >
              <div className="srm-row-main">
                <div className="srm-source-id">
                  <SourceLogo source={source} className="h-3.5 w-3.5 srm-logo" />
                  <span className="srm-source-name">{SOURCE_LABELS[source] ?? source}</span>
                </div>
                <StatusPill status={src.status} />
                <span className="srm-tables-text">
                  {tablesText}
                  {hasMoreTables && <span className="srm-more">+{src.tables_present.length - 4}</span>}
                  {fnText && <span className="srm-fn"> · {fnText}</span>}
                  {!tablesText && !fnText && <span className="srm-none">no tables installed</span>}
                </span>
                {hasIssues && (
                  <ChevronDown className={cx('srm-chevron', isExpanded && 'srm-chevron-open')} />
                )}
              </div>

              {isExpanded && (
                <div className="srm-row-detail">
                  {missingItems.length > 0 ? (
                    <>
                      <span className="srm-missing-label">Missing:</span>
                      {missingItems.map(item => (
                        <span key={item} className="srm-missing-tag">{item}</span>
                      ))}
                    </>
                  ) : (
                    <span className="srm-missing-label">No specific missing items reported.</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <details className="srm-proof-accordion">
        <summary className="srm-proof-toggle">
          SQL proof · {readiness.duration_ms ?? '—'}ms
          {readiness.errors?.length > 0 && (
            <span className="srm-proof-errors">{readiness.errors.length} query error{readiness.errors.length > 1 ? 's' : ''}</span>
          )}
        </summary>
        <div className="srm-proof-body">
          {Object.entries(readiness.sql_proofs as Record<string, string>).map(([label, sql]) => (
            <div key={label} className="srm-proof-row">
              <span className="srm-proof-label">{label}</span>
              <code className="srm-proof-sql">{sql}</code>
            </div>
          ))}
          {readiness.errors?.length > 0 && (
            <div className="srm-proof-error-list">
              {readiness.errors.map((e: string, i: number) => (
                <span key={i} className="srm-proof-error-item">{e}</span>
              ))}
            </div>
          )}
        </div>
      </details>
    </section>
  )
}
