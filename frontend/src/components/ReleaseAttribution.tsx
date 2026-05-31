import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  GitMerge,
  RefreshCw,
  Tag,
  Zap,
  Link2,
  Clock,
} from 'lucide-react'
import { fetchReleaseAttribution } from '../api'
import { CoralProofPanel } from './CoralProof'
import { SourceLogo } from './BrandMarks'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function ReleaseRow({ release }: { release: any }) {
  const newErrors = parseInt(release.new_errors_in_release ?? 0)
  const hasPR = !!release.pr_number
  const riskClass = newErrors > 5 ? 'ra-risk-high' : newErrors > 0 ? 'ra-risk-medium' : 'ra-risk-low'

  return (
    <div className={cx('ra-release-row', riskClass)}>
      <div className="ra-release-header">
        <div className="ra-version-wrap">
          <Tag className="h-3.5 w-3.5" />
          <strong className="ra-version">{release.release_version}</strong>
          {newErrors > 0 && (
            <span className={cx('ra-error-badge', riskClass)}>
              {newErrors} new error{newErrors !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {release.released_at && (
          <span className="ra-timestamp">{String(release.released_at).slice(0, 16).replace('T', ' ')}</span>
        )}
      </div>

      <div className="ra-release-body">
        <div className="ra-source-col">
          <SourceLogo source="sentry" className="h-3.5 w-3.5" />
          <span className="ra-label">Commits:</span>
          <span>{release.commit_count ?? '—'}</span>
          <span className="ra-label ra-label-gap">Deploys:</span>
          <span>{release.deploy_count ?? '—'}</span>
        </div>
        {hasPR ? (
          <div className="ra-source-col ra-pr-col">
            <SourceLogo source="github" className="h-3.5 w-3.5" />
            <span className="ra-label">PR #{release.pr_number}</span>
            <span className="ra-pr-title">{release.pr_title}</span>
            {release.author && <span className="ra-author">by {release.author}</span>}
            {release.match_type === 'sha_exact' ? (
              <span className="ra-match-badge ra-match-sha" title="Sentry version matched to PR merge commit SHA">
                <Link2 className="h-3 w-3" /> SHA match
              </span>
            ) : (
              <span className="ra-match-badge ra-match-time" title="Matched by time window: last PR merged within 6h before release">
                <Clock className="h-3 w-3" /> ~6h window
              </span>
            )}
          </div>
        ) : (
          <div className="ra-source-col ra-no-pr">
            <GitMerge className="h-3.5 w-3.5" />
            <span>No GitHub PR matched via SHA or 6h time window</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ReleaseAttribution() {
  const queryClient = useQueryClient()
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['release-attribution'],
    queryFn: () => fetchReleaseAttribution(),
    staleTime: 5 * 60_000,
  })

  const releases: any[] = data?.releases || []
  const summary = data?.summary || {}
  const proofs: any[] = data?.proofs || []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="th-header">
        <div className="th-header-left">
          <div className="th-header-badge">
            <DatabaseZap className="h-4 w-4" />
            <span>Sentry × GitHub</span>
          </div>
          <p className="th-header-desc">
            {data?.cross_source_description ||
              'Sentry release versions joined to GitHub PR merges — shows which code change shipped in each release.'}
          </p>
        </div>
        <button
          type="button"
          className="soft-btn"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['release-attribution'] })}
        >
          <RefreshCw className={cx('h-4 w-4', isFetching && 'spin-icon')} />
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="th-summary-row">
        <div className="th-stat-card">
          <Tag className="h-5 w-5" />
          <strong>{summary.total_releases ?? 0}</strong>
          <span>releases tracked</span>
        </div>
        <div className={cx('th-stat-card', (summary.total_new_errors_introduced ?? 0) > 0 && 'th-stat-card-warn')}>
          <AlertTriangle className="h-5 w-5" />
          <strong>{summary.total_new_errors_introduced ?? 0}</strong>
          <span>new errors introduced</span>
        </div>
        <div className="th-stat-card">
          <GitMerge className="h-5 w-5" />
          <strong>{releases.filter((r: any) => r.pr_number).length}</strong>
          <span>releases matched to PRs</span>
        </div>
      </div>

      {/* Source legend */}
      <div className="th-source-legend">
        <div className="th-source-item">
          <SourceLogo source="sentry" className="h-4 w-4" />
          <span>Sentry — release versions with new error group counts</span>
        </div>
        <div className="th-source-dot" />
        <div className="th-source-item">
          <SourceLogo source="github" className="h-4 w-4" />
          <span>GitHub — PRs matched by SHA or merged within 6h before release</span>
        </div>
      </div>

      {/* Zero-ETL callout */}
      <div className="th-zero-etl-strip">
        <Zap className="h-4 w-4" />
        <div>
          <p>Why release attribution requires Coral</p>
          <span>
            Sentry tracks releases and new error counts. GitHub tracks merged PRs.
            Neither knows about the other. Coral joins <code>sentry.releases</code> to{' '}
            <code>github.pulls</code> by timestamp — showing which PR shipped in which release
            and how many new errors that release introduced.
          </span>
        </div>
      </div>

      {/* Release rows */}
      {isLoading ? (
        <div className="th-loading">
          <RefreshCw className="h-5 w-5 spin-icon" />
          <p>Running Sentry × GitHub release attribution join...</p>
          <code>sentry.releases JOIN github.pulls ON sha_exact OR time_window(6h)</code>
        </div>
      ) : error ? (
        <div className="th-error">
          <AlertTriangle className="h-5 w-5" />
          <p>Could not load release data. Check that Sentry and GitHub sources are connected.</p>
        </div>
      ) : releases.length === 0 ? (
        <div className="th-empty">
          <CheckCircle2 className="h-6 w-6" />
          <p>No releases found in the last 60 days — or Sentry releases are not yet configured.</p>
        </div>
      ) : (
        <div className="ra-releases-list">
          {releases.map((release: any, i: number) => (
            <ReleaseRow key={`${release.release_version}-${i}`} release={release} />
          ))}
        </div>
      )}

      {proofs.length > 0 && (
        <CoralProofPanel proofs={proofs} title="Sentry × GitHub release attribution proof" />
      )}
    </div>
  )
}
