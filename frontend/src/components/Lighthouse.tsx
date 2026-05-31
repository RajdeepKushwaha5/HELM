import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Anchor,
  Briefcase,
  Code2,
  Copy,
  ExternalLink,
  Flame,
  MessageSquareWarning,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { fetchLighthouse, generateOutreach } from '../api'
import { CoralProofPanel } from './CoralProof'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function tierClass(tier: string) {
  return `lh-tier-${tier}`
}

function TierBadge({ tier, score }: Readonly<{ tier: string; score: number }>) {
  const label = tier === 'hot' ? 'Hot lead' : tier === 'warm' ? 'Warm' : 'Cool'
  return (
    <span className={cx('lh-tier-badge', tierClass(tier))}>
      {tier === 'hot' && <Flame className="h-3 w-3" />}
      {label} · {score}
    </span>
  )
}

function ScoreBar({ label, value, max, kind }: Readonly<{ label: string; value: number; max: number; kind: string }>) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="lh-bar-row">
      <span className="lh-bar-label">{label}</span>
      <div className="lh-bar-track">
        <div className={cx('lh-bar-fill', `lh-bar-${kind}`, `lh-w-${Math.min(100, Math.round(pct / 5) * 5)}`)} />
      </div>
      <span className="lh-bar-val">{value}/{max}</span>
    </div>
  )
}

interface Prospect {
  company: string
  region: string
  icp: { score: number; tier: string; breakdown: { hiring: number; pain: number; build: number } }
  open_data_roles: number
  sample_roles: string[]
  pain_signal: { title: string; points: number; url: string; keyword: string }
  build_signal: { github_org: string; public_repos: number; primary_language: string }
  evidence_sources: string[]
}

function ProspectCard({ prospect }: Readonly<{ prospect: Prospect }>) {
  const [outreach, setOutreach] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    try {
      const res = await generateOutreach({
        company: prospect.company,
        open_data_roles: prospect.open_data_roles,
        sample_roles: prospect.sample_roles,
        pain_title: prospect.pain_signal?.title || '',
        pain_points: prospect.pain_signal?.points || 0,
        primary_language: prospect.build_signal?.primary_language || '',
        public_repos: prospect.build_signal?.public_repos || 0,
      })
      setOutreach(res.outreach)
    } catch {
      setOutreach('Could not generate outreach — check the backend / Gemini key.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(outreach)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={cx('lh-card', tierClass(prospect.icp.tier))}>
      <div className="lh-card-head">
        <div className="lh-card-title">
          <span className="lh-company">{prospect.company}</span>
          <span className="lh-region">{prospect.region}</span>
        </div>
        <TierBadge tier={prospect.icp.tier} score={prospect.icp.score} />
      </div>

      <div className="lh-signals">
        <div className="lh-signal">
          <Briefcase className="h-3.5 w-3.5 lh-sig-hiring" />
          <div>
            <span className="lh-sig-value">{prospect.open_data_roles} open data roles</span>
            <span className="lh-sig-sub">{prospect.sample_roles.slice(0, 2).join(' · ')}</span>
            <span className="lh-sig-src">adzuna</span>
          </div>
        </div>

        <div className="lh-signal">
          <MessageSquareWarning className="h-3.5 w-3.5 lh-sig-pain" />
          <div>
            <span className="lh-sig-value">
              {prospect.pain_signal?.points ? `${prospect.pain_signal.points} pts` : 'No major thread'} public pain
            </span>
            <span className="lh-sig-sub" title={prospect.pain_signal?.title}>
              {prospect.pain_signal?.title
                ? (prospect.pain_signal.title.length > 52
                    ? prospect.pain_signal.title.slice(0, 52) + '…'
                    : prospect.pain_signal.title)
                : '—'}
            </span>
            <span className="lh-sig-src">
              hackernews · LIVE
              {prospect.pain_signal?.url && (
                <a href={prospect.pain_signal.url} target="_blank" rel="noreferrer" className="lh-sig-link">
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </span>
          </div>
        </div>

        <div className="lh-signal">
          <Code2 className="h-3.5 w-3.5 lh-sig-build" />
          <div>
            <span className="lh-sig-value">
              {prospect.build_signal?.primary_language || '—'} org
            </span>
            <span className="lh-sig-sub">{prospect.build_signal?.public_repos || 0} public repos</span>
            <span className="lh-sig-src">github</span>
          </div>
        </div>
      </div>

      <div className="lh-bars">
        <ScoreBar label="Hiring" value={prospect.icp.breakdown.hiring} max={40} kind="hiring" />
        <ScoreBar label="Pain" value={prospect.icp.breakdown.pain} max={35} kind="pain" />
        <ScoreBar label="Build" value={prospect.icp.breakdown.build} max={25} kind="build" />
      </div>

      <div className="lh-outreach">
        {outreach ? (
          <div className="lh-outreach-result">
            <p className="lh-outreach-text">{outreach}</p>
            <button type="button" className="lh-copy-btn" onClick={handleCopy}>
              <Copy className="h-3 w-3" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <button type="button" className="lh-gen-btn" onClick={handleGenerate} disabled={loading}>
            {loading ? <Loader /> : <Sparkles className="h-3.5 w-3.5" />}
            {loading ? 'Writing outreach…' : 'Generate outreach'}
          </button>
        )}
      </div>
    </div>
  )
}

function Loader() {
  return <RefreshCw className="h-3.5 w-3.5 animate-spin" />
}

export default function Lighthouse() {
  const qc = useQueryClient()
  const [showProofs, setShowProofs] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['lighthouse'],
    queryFn: () => fetchLighthouse(),
    retry: false,
    staleTime: 2 * 60_000,
  })

  async function handleRefresh() {
    setRefreshing(true)
    await qc.invalidateQueries({ queryKey: ['lighthouse'] })
    setRefreshing(false)
  }

  const summary = data?.summary
  const prospects: Prospect[] = data?.prospects ?? []
  const proofs: any[] = data?.proofs ?? []
  const demoMode: boolean = data?.demo_mode ?? true

  return (
    <div className="lh-shell">
      <div className="lh-header">
        <div className="lh-header-left">
          <div className="lh-eyebrow">
            <Anchor className="h-3.5 w-3.5" />
            <span>Adzuna × HackerNews × GitHub — public-signal prospecting</span>
            {demoMode && <span className="lh-demo-pill">DEMO COHORT · LIVE HN PAIN</span>}
          </div>
          <h1 className="lh-title">Lighthouse</h1>
          <p className="lh-subtitle">
            Finds companies that would want Coral by joining who is <strong>hiring</strong> data engineers,
            who is <strong>publicly complaining</strong> about pipeline pain, and who is <strong>actively
            building</strong> — in one Coral SQL plan. Then it writes the outreach.
          </p>
        </div>
        <button type="button" className="lh-refresh-btn" onClick={handleRefresh} disabled={isLoading || refreshing}>
          <RefreshCw className={cx('h-3.5 w-3.5', (isLoading || refreshing) && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="lh-loading">
          <Zap className="h-5 w-5 animate-pulse" />
          Joining Adzuna × HackerNews × GitHub through Coral…
        </div>
      )}
      {error && (
        <div className="lh-error">Could not load prospects: {String(error)}</div>
      )}

      {data && (
        <>
          <div className="lh-kpis">
            <div className="lh-kpi">
              <Target className="h-4 w-4 lh-kpi-icon" />
              <span className="lh-kpi-val">{summary?.total_prospects ?? 0}</span>
              <span className="lh-kpi-label">Prospects found</span>
            </div>
            <div className="lh-kpi lh-kpi-hot">
              <Flame className="h-4 w-4 lh-kpi-icon" />
              <span className="lh-kpi-val">{summary?.hot ?? 0}</span>
              <span className="lh-kpi-label">Hot leads</span>
            </div>
            <div className="lh-kpi">
              <TrendingUp className="h-4 w-4 lh-kpi-icon" />
              <span className="lh-kpi-val">{summary?.avg_icp ?? 0}</span>
              <span className="lh-kpi-label">Avg ICP score</span>
            </div>
            <div className="lh-kpi">
              <Anchor className="h-4 w-4 lh-kpi-icon" />
              <span className="lh-kpi-val">3</span>
              <span className="lh-kpi-label">Live sources joined</span>
            </div>
          </div>

          <div className="lh-coral-banner">
            <span className="lh-cb-sources">Adzuna × HackerNews × GitHub</span>
            <span className="lh-cb-sep">—</span>
            <span>3 public APIs · 1 SQL plan · local-first prospect list</span>
            <span className="lh-cb-dot" />
            <span className="lh-cb-impossible">Impossible without Coral</span>
          </div>

          <div className="lh-grid">
            {prospects.map((p) => (
              <ProspectCard key={p.company} prospect={p} />
            ))}
          </div>

          <div className="lh-proof-toggle">
            <button type="button" className="lh-proof-btn" onClick={() => setShowProofs((s) => !s)}>
              {showProofs ? 'Hide' : 'Show'} Coral SQL proofs ({proofs.length})
            </button>
          </div>
          {showProofs && proofs.length > 0 && (
            <CoralProofPanel proofs={proofs} title="Lighthouse — Coral SQL proofs" />
          )}

          <div className="lh-note">
            {demoMode
              ? '⚓ Demo cohort with LIVE HackerNews pain signals. Set ADZUNA_APP_ID + ADZUNA_APP_KEY in .env to pull the hiring cohort live from Adzuna too.'
              : '⚓ Live — hiring cohort from Adzuna, pain from HackerNews, build from GitHub, joined by Coral.'}
          </div>
        </>
      )}
    </div>
  )
}
