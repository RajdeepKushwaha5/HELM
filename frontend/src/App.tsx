import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Anchor,
  AlertTriangle,
  AlertOctagon,
  ArrowUpRight,
  Bell,
  Blocks,
  Bot,
  CheckCircle2,
  ClipboardList,
  Command,
  DatabaseZap,
  GitMerge,
  GitPullRequest,
  Gauge,
  HelpCircle,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mail,
  Network,
  Copy,
  Download,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  Workflow,
  XCircle,
  HeartPulse,
  Orbit,
  Wrench,
  PackagePlus,
  Info,
  Zap,
} from 'lucide-react'
import AskHelm from './components/AskHelm'
import TeamHealth from './components/TeamHealth'
import IncidentConstellation from './components/IncidentConstellation'
import SelfHealWorkflow from './components/SelfHealWorkflow'
import DeployTrend from './components/DeployTrend'
import TicketVsErrors from './components/TicketVsErrors'
import ReleaseAttribution from './components/ReleaseAttribution'
import PRReviewAgent from './components/PRReviewAgent'
import SourceReadinessMatrix from './components/SourceReadinessMatrix'
import ConstellationHero from './components/ConstellationHero'
import HandoverBrief from './components/HandoverBrief'
import CircleCIPanel from './components/CircleCIPanel'
import TicketThreadTracker from './components/TicketThreadTracker'
import ReviewDebtAging from './components/ReviewDebtAging'
import TokenROI from './components/TokenROI'
import Lighthouse from './components/Lighthouse'
import {
  fetchActions,
  fetchAutopilot,
  fetchCoralHealth,
  fetchCoralReadiness,
  fetchConstellation,
  fetchDemoMoment,
  fetchDeployErrors,
  fetchEngineers,
  fetchMTTRAttribution,
  fetchCascade,
  fetchRiskScorecard,
  fetchOverview,
  fetchRootCause,
  fetchServices,
  runGuidedDemo,
  sandboxQuery,
  executeAction,
  fetchReviewDebt,
  fetchTicketThreadTracker,
  fetchReviewDebtAging,
  fetchCircleCIHealth,
  fetchTokenROI,
} from './api'
import { ApprovalDraftPanel, CoralProofPanel, type DraftAction } from './components/CoralProof'
import { SourceLogo } from './components/BrandMarks'
import { BurnoutBarChart, ServiceStabilityChart, PRErrorTimeline, EvidenceScoreChart } from './components/InsightCharts'
import CoralFlowDiagram from './components/CoralFlowDiagram'
import SqlSandbox from './components/SqlSandbox'
import CoralExplainerPanel from './components/CoralExplainerPanel'

type NavId =
  | 'live'
  | 'dashboard'
  | 'engineers'
  | 'services'
  | 'deployments'
  | 'rootcause'
  | 'actions'
  | 'ask'
  | 'mttr'
  | 'cascade'
  | 'scorecard'
  | 'sandbox'
  | 'architecture'
  | 'source-setup'
  | 'sql-proofs'
  | 'teamhealth'
  | 'constellation'
  | 'selfheal'
  | 'deploytrend'
  | 'ticketteams'
  | 'releaseattrib'
  | 'prreview'
  | 'handover'
  | 'circleci'
  | 'tickettracker'
  | 'reviewdebtaging'
  | 'tokenroi'
  | 'lighthouse'

type NavItem = {
  id: NavId
  label: string
  title: string
  eyebrow: string
  description: string
  icon: React.ElementType
  count?: string
  keywords: string[]
}

const navItems: NavItem[] = [
  // ── Core (always visible) ─────────────────────────────────────────────────
  {
    id: 'dashboard',
    label: 'Mission Control',
    title: 'Mission Control',
    eyebrow: 'Coral command surface',
    description: 'One command surface for live source health, incident causality, delivery risk, and AI-ready SQL evidence.',
    icon: LayoutDashboard,
    keywords: ['dashboard', 'home', 'overview', 'health'],
  },
  {
    id: 'live',
    label: 'Live Monitor',
    title: 'Zero-ETL Live Monitor',
    eyebrow: 'Federated incident causality',
    description: 'Resolve which PR broke production by joining GitHub and Sentry through Coral SQL. No ETL, no warehouse, no copied JSON.',
    icon: Activity,
    keywords: ['live', 'monitor', 'signal', 'real-time', 'stream', 'evidence', 'watch'],
  },
  {
    id: 'rootcause',
    label: 'Root Cause',
    title: 'Causality Constellation',
    eyebrow: 'Four-source causal graph',
    description: 'Join GitHub, Sentry, PagerDuty, and Slack in one Coral SQL execution plan with proof attached.',
    icon: Network,
    keywords: ['root cause', 'causality', 'incident', 'slack'],
  },
  {
    id: 'prreview',
    label: 'PR Review Agent',
    title: 'PR Review Agent',
    eyebrow: 'GitHub × Sentry × PagerDuty × Linear',
    description: 'Paste a PR URL. The agent queries Coral across 4 live sources and writes a data-backed review: service incident history, deploy error chains, author workload — then posts it to GitHub.',
    icon: GitPullRequest,
    keywords: ['pr', 'review', 'pull request', 'agent', 'github', 'sentry', 'pagerduty', 'linear'],
  },
  {
    id: 'ask',
    label: 'Ask Helm',
    title: 'Ask Helm',
    eyebrow: 'Conversational analyst',
    description: 'Ask natural language questions that resolve through optimized Coral SQL instead of direct API tool loops.',
    icon: Bot,
    keywords: ['ask', 'chat', 'helm', 'question'],
  },
  // ── Incident Chain (group in "More") ──────────────────────────────────────
  {
    id: 'constellation',
    label: 'Constellation',
    title: 'Incident Constellation',
    eyebrow: '4-source causal chain visual',
    description: 'Visual node graph of GitHub PR → Sentry error → PagerDuty incident → Slack response. Each edge is a SQL JOIN condition. Self-healing draft actions included.',
    icon: Orbit,
    keywords: ['constellation', 'incident', 'visual', 'graph', 'causal', 'chain'],
  },
  {
    id: 'cascade',
    label: 'Cascade Warning',
    title: 'Cascade Early Warning',
    eyebrow: '3-source converging signal detector',
    description: 'Detects GitHub → Sentry → PagerDuty cascade chains: 24h deploy→error window, 4h error→incident window — 3-source Coral JOIN, predictive not reactive.',
    icon: AlertOctagon,
    keywords: ['cascade', 'warning', 'alert', 'signal', 'predict', 'incident'],
  },
  // ── Attribution (group in "More") ─────────────────────────────────────────
  {
    id: 'mttr',
    label: 'MTTR Attribution',
    title: 'MTTR Attribution',
    eyebrow: 'Causal time-to-error by author',
    description: 'Per-author and per-service mean time to production error — computed live via a Coral GitHub × Sentry GROUP BY JOIN. No data team required.',
    icon: Timer,
    keywords: ['mttr', 'attribution', 'author', 'time', 'performance', 'speed'],
  },
  {
    id: 'deployments',
    label: 'Release Impact',
    title: 'Release Impact',
    eyebrow: 'Deployments to errors',
    description: 'Find which merged PR windows line up with first-seen production errors.',
    icon: GitMerge,
    keywords: ['deployments', 'release', 'github', 'sentry', 'errors'],
  },
  {
    id: 'releaseattrib',
    label: 'Release Attribution',
    title: 'Release Attribution',
    eyebrow: 'Sentry releases × GitHub PRs',
    description: 'Sentry release versions joined to GitHub PR merges by timestamp — which PR shipped in which release and how many new errors that release introduced.',
    icon: GitMerge,
    keywords: ['release', 'sentry', 'github', 'version', 'attribution', 'deploy'],
  },
  {
    id: 'deploytrend',
    label: 'Deploy Trend',
    title: 'Deploy vs Error Trend',
    eyebrow: 'GitHub × Sentry monthly aggregate',
    description: 'Monthly deploy cadence vs Sentry error introduction rate — two independent live time series joined in one DataFusion plan. Impossible without Coral.',
    icon: TrendingUp,
    keywords: ['deploy', 'trend', 'monthly', 'error', 'rate', 'cadence', 'github', 'sentry'],
  },
  // ── Team Intelligence (group in "More") ───────────────────────────────────
  {
    id: 'teamhealth',
    label: 'Team Health',
    title: 'Team Health Pulse',
    eyebrow: 'GitHub × Linear × Sentry burnout model',
    description: 'Three live sources joined per engineer: GitHub PR timing, Linear ticket pressure, and Sentry error ownership. Burnout signals impossible without Coral.',
    icon: HeartPulse,
    keywords: ['team', 'health', 'burnout', 'wellbeing', 'engineers', 'overtime', 'late night'],
  },
  {
    id: 'engineers',
    label: 'Workload Risk',
    title: 'Workload Risk',
    eyebrow: 'People and delivery',
    description: 'See burnout, ticket pressure, PR load, and error ownership from GitHub, Linear, and Sentry.',
    icon: Users,
    keywords: ['engineers', 'people', 'burnout', 'linear', 'github'],
  },
  {
    id: 'ticketteams',
    label: 'Ticket Pressure',
    title: 'Ticket vs Error Load',
    eyebrow: 'Linear × Sentry team pressure',
    description: 'Linear ticket load joined to Sentry error volume per team — shows which teams are overloaded with P0 tickets and production errors simultaneously.',
    icon: ClipboardList,
    keywords: ['ticket', 'linear', 'sentry', 'team', 'pressure', 'overload', 'priority'],
  },
  {
    id: 'services',
    label: 'Service Health',
    title: 'Service Health',
    eyebrow: 'Production stability',
    description: 'Track unstable services by joining Sentry issue volume with PagerDuty incident signals.',
    icon: Blocks,
    keywords: ['services', 'sentry', 'pagerduty', 'stability'],
  },
  // ── AI & Actions (group in "More") ────────────────────────────────────────
  {
    id: 'selfheal',
    label: 'Self-Heal',
    title: 'Self-Healing Workflow',
    eyebrow: 'Detect → Score → Draft → Approve',
    description: 'Full remediation workflow: Coral SQL detects the incident chain, scores the evidence, pre-fills Slack/Linear/GitHub drafts, and waits for human approval before anything is sent.',
    icon: Wrench,
    keywords: ['self-heal', 'remediation', 'fix', 'workflow', 'incident', 'approval'],
  },
  {
    id: 'scorecard',
    label: 'Risk Scorecard',
    title: 'Engineering Risk Scorecard',
    eyebrow: 'SOC2-ready compliance audit trail',
    description: 'Every deployment, its errors, triggered incidents, Linear follow-ups, and Slack response noise — risk-scored from one Coral SQL plan. Zero warehouse, zero ETL.',
    icon: ClipboardList,
    keywords: ['scorecard', 'compliance', 'audit', 'risk', 'soc2', 'security'],
  },
  {
    id: 'actions',
    label: 'Approval Queue',
    title: 'Approval Queue',
    eyebrow: 'Human-gated actions',
    description: 'Review suggested Slack, Linear, and incident follow-up drafts before anything is copied or sent.',
    icon: ShieldCheck,
    keywords: ['actions', 'approvals', 'drafts', 'guardrails'],
  },
  {
    id: 'handover',
    label: 'Handover Brief',
    title: 'Developer Handover Brief',
    eyebrow: 'GitHub × Linear × Sentry — knowledge transfer',
    description: 'Enter a GitHub username and get a complete developer knowledge handover in seconds: PR history, open tickets, live error ownership, and an AI-synthesised brief.',
    icon: PackagePlus,
    keywords: ['handover', 'handoff', 'offboarding', 'relay', 'brief', 'developer', 'transition', 'exit', 'knowledge'],
  },
  {
    id: 'circleci',
    label: 'CI Health',
    title: 'CircleCI × GitHub × Sentry',
    eyebrow: 'GitHub × CircleCI × Sentry — 3-source CI correlation',
    description: 'PRs that passed CI but still introduced production errors. Joins GitHub merge history, CircleCI pipeline coverage, and Sentry error first_seen in one Coral SQL plan.',
    icon: PlayCircle,
    keywords: ['circleci', 'ci', 'pipeline', 'build', 'test', 'workflow', 'github', 'sentry'],
  },
  {
    id: 'tickettracker',
    label: 'Ticket Thread Tracker',
    title: 'Ticket Thread Tracker',
    eyebrow: 'Linear × Slack — silent backlog noise',
    description: 'High-priority Linear tickets generating Slack thread chaos. Joins open tickets to channel messages by identifier mention — backlog pressure that spills into chat.',
    icon: ClipboardList,
    keywords: ['ticket', 'linear', 'slack', 'thread', 'tracker', 'backlog', 'noise', 'mentions'],
  },
  {
    id: 'reviewdebtaging',
    label: 'Review Debt Aging',
    title: 'Review Debt Aging',
    eyebrow: 'GitHub × Sentry — open PRs vs live errors',
    description: 'Open PRs stalled in review while related Sentry errors are actively firing. The worst combination: fixes are ready but blocked in code review.',
    icon: GitPullRequest,
    keywords: ['review debt', 'aging', 'open prs', 'stalled', 'github', 'sentry', 'blocked', 'code review'],
  },
  {
    id: 'tokenroi',
    label: 'Token ROI',
    title: 'Token ROI Score',
    eyebrow: 'Langfuse × Linear × Sentry — AI spend attribution',
    description: 'Every dollar your team spends on AI tokens — attributed to a shipped feature, an open ticket, or flagged as waste. Detects loop waste, orphan spend, and model mismatches. Impossible without Coral.',
    icon: TrendingDown,
    keywords: ['token', 'roi', 'langfuse', 'ai cost', 'spend', 'attribution', 'waste', 'loop', 'orphan', 'model', 'llm'],
  },
  {
    id: 'lighthouse',
    label: 'Lighthouse',
    title: 'Lighthouse — GTM Prospecting',
    eyebrow: 'Adzuna × HackerNews × GitHub — public-signal prospecting',
    description: 'Finds companies that would want Coral by joining who is hiring data engineers, who is publicly complaining about pipeline pain, and who is actively building — in one Coral SQL plan. Then it writes the outreach. Impossible without Coral.',
    icon: Anchor,
    keywords: ['lighthouse', 'gtm', 'prospect', 'sales', 'leads', 'hiring', 'adzuna', 'hackernews', 'outreach', 'icp', 'prospecting'],
  },
]

const workspaceItems: NavItem[] = [
  {
    id: 'architecture',
    label: 'How Helm Works',
    title: 'How Helm Works',
    eyebrow: 'Product architecture',
    description: 'See how Helm connects live sources, Coral SQL, evidence scoring, AI synthesis, and approval-gated remediation.',
    icon: Workflow,
    keywords: ['architecture', 'how', 'flow', 'coral', 'diagram', 'system'],
  },
  {
    id: 'sandbox',
    label: 'SQL Sandbox',
    title: 'SQL Sandbox',
    eyebrow: 'Live Coral query terminal',
    description: 'Run any SELECT query across live GitHub, Sentry, PagerDuty, Linear, and Slack sources. Type it, run it, watch Coral join them in one federated plan.',
    icon: Terminal,
    keywords: ['sql', 'sandbox', 'query', 'terminal', 'live', 'coral', 'run', 'join'],
  },
  {
    id: 'source-setup',
    label: 'Source setup',
    title: 'Source Setup',
    eyebrow: 'Workspace readiness',
    description: 'Inspect installed Coral providers, required inputs, table coverage, and source metadata before operating Helm.',
    icon: Settings,
    keywords: ['source', 'setup', 'providers', 'inputs', 'metadata', 'workspace'],
  },
  {
    id: 'sql-proofs',
    label: 'SQL proofs',
    title: 'SQL Proofs',
    eyebrow: 'Audit trail',
    description: 'Review every Coral query proof currently powering Helm: sources, joins, rows, columns, and runtime.',
    icon: HelpCircle,
    keywords: ['sql', 'proofs', 'audit', 'queries', 'runtime', 'rows'],
  },
]

function getNavMeta(id: NavId) {
  const operation = navItems.find(item => item.id === id)
  const workspace = workspaceItems.find(item => item.id === id)
  return operation || workspace || navItems[0]
}

const PANEL_SOURCES: Partial<Record<NavId, string[]>> = {
  live:          ['github', 'sentry'],
  rootcause:     ['github', 'sentry', 'pagerduty', 'slack'],
  cascade:       ['github', 'sentry', 'pagerduty'],
  deployments:   ['github', 'sentry'],
  mttr:          ['github', 'sentry'],
  services:      ['sentry', 'pagerduty'],
  engineers:     ['github', 'linear', 'sentry'],
  scorecard:     ['github', 'sentry', 'pagerduty', 'linear', 'slack'],
  teamhealth:    ['github', 'linear', 'sentry'],
  constellation: ['github', 'sentry', 'pagerduty', 'slack'],
  selfheal:      ['github', 'sentry', 'pagerduty', 'linear'],
  deploytrend:   ['github', 'sentry'],
  ticketteams:   ['linear', 'sentry'],
  releaseattrib: ['sentry', 'github'],
  prreview:         ['github', 'sentry', 'pagerduty', 'linear'],
  handover:         ['github', 'linear', 'sentry'],
  circleci:         ['github', 'circleci', 'sentry'],
  tickettracker:    ['linear', 'slack'],
  reviewdebtaging:  ['github', 'sentry'],
  tokenroi:         ['langfuse', 'linear', 'sentry'],
  lighthouse:       ['adzuna', 'hackernews', 'github'],
  ask:           ['github', 'sentry', 'pagerduty', 'linear', 'slack'],
  actions:       ['github', 'sentry'],
}

const WORKFLOW_LABELS: Partial<Record<NavId, string>> = {
  live:          'PR → Error Correlation',
  rootcause:     'GitHub → Sentry → PagerDuty → Slack',
  prreview:      'PR Safety Review',
  cascade:       'Cascade Early Warning',
  mttr:          'MTTR Attribution',
  teamhealth:    'Burnout Risk Detection',
  engineers:     'Workload Risk Scan',
  scorecard:     'SOC2 Audit Trail',
  selfheal:      'Detect → Score → Draft → Approve',
  constellation: 'Incident Causality Graph',
  deploytrend:   'Deploy vs Error Trend',
  ticketteams:   'Ticket Pressure Overlay',
  releaseattrib: 'Release Error Attribution',
  handover:         'Developer Knowledge Transfer',
  circleci:         'GitHub × CircleCI × Sentry',
  tickettracker:    'Linear ticket × Slack thread',
  reviewdebtaging:  'Open PRs vs live Sentry errors',
  tokenroi:         'Langfuse × Linear × Sentry — AI spend attribution',
  lighthouse:       'Adzuna × HackerNews × GitHub — prospect scoring + outreach',
  ask:           'NL → Coral SQL → Proof',
}

function WorkflowBadge({ panelId }: { panelId: NavId }) {
  const label = WORKFLOW_LABELS[panelId]
  if (!label) return null
  return (
    <div className="workflow-badge">
      <Workflow className="h-3 w-3" />
      <span>Workflow: {label}</span>
    </div>
  )
}

function CoralImpossibleBadge({ panelId }: { panelId: NavId }) {
  const sources = PANEL_SOURCES[panelId]
  if (!sources || sources.length < 2) return null
  const joined = sources.map(s => SOURCE_DISPLAY_NAMES[s] ?? s).join(' × ')
  return (
    <div className="coral-impossible-badge">
      <span className="cib-sources">[{joined}]</span>
      <span className="cib-sep">—</span>
      <span className="cib-stat">{sources.length} live APIs</span>
      <span className="cib-dot" />
      <span className="cib-stat">1 SQL plan</span>
      <span className="cib-dot" />
      <span className="cib-impossible">Impossible without Coral</span>
    </div>
  )
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function riskTone(risk?: string) {
  if (risk === 'high') return 'danger'
  if (risk === 'medium') return 'warn'
  return 'ok'
}

function sourceKey(source: string) {
  return source.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  github: 'GitHub',
  sentry: 'Sentry',
  pagerduty: 'PagerDuty',
  linear: 'Linear',
  slack: 'Slack',
  circleci: 'CircleCI',
  langfuse: 'Langfuse',
  adzuna: 'Adzuna',
  hackernews: 'HackerNews',
}

function displaySource(name: string) {
  return SOURCE_DISPLAY_NAMES[name.toLowerCase()] ?? name
}

function formatWriteStatus(status: string) {
  if (!status) return ''
  if (status === 'blocked_until_human_approval') return 'Pending approval'
  return status.replace(/_/g, ' ')
}

function LoadingCard({ className = '' }: { className?: string }) {
  return <div className={cx('surface shimmer min-h-36', className)} />
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <Sparkles className="h-5 w-5" />
      <div>
        <p>{title}</p>
        <span>{detail}</span>
      </div>
    </div>
  )
}

function HelmLogo() {
  return (
    <svg className="brand-logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path className="brand-logo-stem" d="M10 8v16M22 8v16M10 16h12" />
      <path className="brand-logo-link" d="M5.5 11.5H10M22 20.5h4.5" />
      <circle className="brand-logo-node" cx="5.5" cy="11.5" r="2" />
      <circle className="brand-logo-node" cx="26.5" cy="20.5" r="2" />
      <circle className="brand-logo-dot" cx="16" cy="16" r="1.8" />
    </svg>
  )
}

function navReadinessDot(sources: string[] | undefined, readiness?: any): 'green' | 'amber' | 'red' | null {
  if (!readiness?.sources || !sources?.length) return null
  const statuses = sources.map(s => readiness.sources[s]?.status).filter(Boolean)
  if (!statuses.length) return null
  if (statuses.some((s: string) => s === 'blocked')) return 'red'
  if (statuses.some((s: string) => s === 'degraded')) return 'amber'
  if (statuses.every((s: string) => s === 'ready')) return 'green'
  return null
}

// Core = the headline demo flow. Lighthouse (GTM) and Token ROI (AI cost) are
// the differentiators, so they sit right under Mission Control, always visible.
const CORE_NAV_IDS: NavId[] = ['dashboard', 'lighthouse', 'tokenroi', 'live', 'ask', 'rootcause']
const CORE_WORKSPACE_IDS: NavId[] = []

const MORE_NAV_GROUPS: { label: string; ids: NavId[] }[] = [
  { label: 'Incident Chain',   ids: ['constellation', 'cascade'] },
  { label: 'Attribution',      ids: ['mttr', 'deployments', 'releaseattrib', 'deploytrend'] },
  { label: 'Team',             ids: ['teamhealth', 'engineers', 'ticketteams', 'services'] },
  { label: 'CI & Review',      ids: ['circleci', 'reviewdebtaging', 'tickettracker'] },
  { label: 'Agents & Actions', ids: ['prreview', 'selfheal', 'scorecard', 'actions', 'handover'] },
]
// Single consolidated Workspace group, rendered once at the bottom.
const MORE_WORKSPACE_IDS: NavId[] = ['sandbox', 'source-setup', 'architecture', 'sql-proofs']

function Sidebar({ active, setActive, readiness }: { active: NavId; setActive: (id: NavId) => void; readiness?: any }) {
  const coreNav = navItems.filter(i => CORE_NAV_IDS.includes(i.id))
  const coreWorkspace = workspaceItems.filter(i => CORE_WORKSPACE_IDS.includes(i.id))
  const moreWorkspace = workspaceItems.filter(i => MORE_WORKSPACE_IDS.includes(i.id as NavId))

  function NavBtn({ item, muted }: { item: NavItem; muted?: boolean }) {
    const Icon = item.icon
    const isLive = item.id === 'live'
    const dot = navReadinessDot(PANEL_SOURCES[item.id], readiness)
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => setActive(item.id)}
        className={cx('nav-item', muted && 'muted', active === item.id && 'active')}
      >
        <Icon className="h-4 w-4" />
        <span>{item.label}</span>
        {isLive && <span className="live-pulse-dot" />}
        {!isLive && dot && <span className={`nav-readiness-dot nav-dot-${dot}`} />}
      </button>
    )
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><HelmLogo /></div>
        <div className="brand-copy">
          <div className="brand-title-row">
            <p>Helm</p>
            <span className="brand-live-pill">Live</span>
          </div>
          <span>Coral Ops Intelligence</span>
        </div>
      </div>

      <div className="nav-group">
        {coreNav.map(item => <NavBtn key={item.id} item={item} />)}
      </div>

      {coreWorkspace.length > 0 && (
        <div className="nav-group">
          <p className="nav-label">Workspace</p>
          {coreWorkspace.map(item => <NavBtn key={item.id} item={item} muted />)}
        </div>
      )}

      <div className="nav-group">
        {MORE_NAV_GROUPS.map(group => {
          const items = group.ids.map(id => navItems.find(i => i.id === id)).filter(Boolean) as NavItem[]
          return (
            <div key={group.label} className="nav-more-group">
              <p className="nav-group-label">{group.label}</p>
              {items.map(item => <NavBtn key={item.id} item={item} muted />)}
            </div>
          )
        })}
        {moreWorkspace.length > 0 && (
          <div className="nav-more-group">
            <p className="nav-group-label">Workspace</p>
            {moreWorkspace.map(item => <NavBtn key={item.id} item={item} muted />)}
          </div>
        )}
      </div>

      <div className="sidebar-card">
        <p>8 live sources · 1 SQL layer</p>
        <span>GitHub · Sentry · PagerDuty · Linear · Slack · Adzuna · HackerNews · Langfuse — joined by Coral, no ETL.</span>
      </div>
    </aside>
  )
}

function Topbar({
  active,
  setActive,
  proofBadge,
}: {
  active: NavId
  setActive: (id: NavId) => void
  proofBadge: { queries: number; crossSource: number; totalRows: number; mcpSaved: number }
}) {
  const [query, setQuery] = useState('')

  function submitSearch() {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return
    const match = [...navItems, ...workspaceItems].find(item =>
      item.label.toLowerCase().includes(normalized) ||
      item.title.toLowerCase().includes(normalized) ||
      item.keywords.some(keyword => keyword.includes(normalized) || normalized.includes(keyword))
    )
    if (match) setActive(match.id)
  }

  return (
    <header className="topbar">
      <label className="search-box">
        <Search className="h-5 w-5" />
        <input
          placeholder="Search incidents, releases, services"
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => event.key === 'Enter' && submitSearch()}
        />
        <kbd>
          <Command className="h-3.5 w-3.5" />K
        </kbd>
      </label>
      <div className="top-actions">
        <div className="proof-safety-strip" title="Session safety budget: reads only, no writes">
          <ShieldCheck className="h-3 w-3" />
          <span className="proof-safety-writes">0 writes</span>
          {proofBadge.queries > 0 && (
            <>
              <span className="proof-safety-sep">·</span>
              <span className="proof-safety-stat"><b>{proofBadge.queries}</b> quer{proofBadge.queries === 1 ? 'y' : 'ies'}</span>
              {proofBadge.totalRows > 0 && (
                <>
                  <span className="proof-safety-sep">·</span>
                  <span className="proof-safety-stat"><b>{proofBadge.totalRows.toLocaleString()}</b> rows</span>
                </>
              )}
            </>
          )}
          <span className="proof-safety-badge">safe</span>
        </div>
        {proofBadge.queries > 0 && (
          <div
            className="proof-counter-badge"
            title={`Coral replaced ~${proofBadge.mcpSaved} direct MCP tool calls this session (+31% accuracy, -70% token cost)`}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span className="proof-counter-primary">
              <b>{proofBadge.queries}</b> SQL quer{proofBadge.queries === 1 ? 'y' : 'ies'}
            </span>
            {proofBadge.crossSource > 0 && (
              <span className="proof-counter-cross">
                <b>{proofBadge.crossSource}</b> cross-source
              </span>
            )}
            <span className="proof-counter-saved" title="Estimated MCP tool calls avoided (sources × 3 base calls + join overhead)">
              ~{proofBadge.mcpSaved}x MCP saved
            </span>
          </div>
        )}
        <button type="button" className="icon-btn" title="Inbox">
          <Mail className="h-5 w-5" />
        </button>
        <button type="button" className="icon-btn alert-dot" title="Notifications">
          <Bell className="h-5 w-5" />
        </button>
        <div className="profile">
          <div className="avatar">RJ</div>
          <div>
            <p>Rajdeep</p>
            <span>{getNavMeta(active).label}</span>
          </div>
        </div>
      </div>
    </header>
  )
}

function MetricCard({
  title,
  value,
  detail,
  active,
  icon: Icon,
  delay = 0,
  onClick,
}: {
  title: string
  value: string | number
  detail: string
  active?: boolean
  icon: React.ElementType
  delay?: number
  onClick?: () => void
}) {
  return (
    <section className={cx('metric-card reveal-card', active && 'primary')} style={{ animationDelay: `${delay}ms` }}>
      <div className="metric-head">
        <span>{title}</span>
        <button type="button" className="round-link" title={`Open ${title}`} onClick={onClick}>
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
      <strong>{value}</strong>
      <p>
        <Icon className="h-4 w-4" />
        {detail}
      </p>
    </section>
  )
}

function SourceHealthStrip({ health }: { health?: any }) {
  const sources: any[] = health?.sources?.length
    ? health.sources
    : ['github', 'sentry', 'pagerduty', 'linear', 'slack'].map(name => ({ name, status: 'loading', table_count: 0 }))

  const okCount = sources.filter((s: any) => s.status === 'ok').length

  return (
    <div className="sh-bar">
      <span className="sh-bar-label">
        <ShieldCheck className="h-3.5 w-3.5" />
        {health ? `${okCount}/${sources.length} online` : 'Checking…'}
      </span>
      <div className="sh-bar-chips">
        {sources.map((source: any) => {
          const ok = source.status === 'ok'
          const loading = source.status === 'loading'
          return (
            <div key={source.name} className={cx('sh-chip', ok && 'sh-chip-ok', !ok && !loading && 'sh-chip-err')}>
              <SourceLogo source={source.name} className="h-3 w-3" />
              <span className="sh-chip-name">{displaySource(source.name)}</span>
              {source.table_count > 0 && <span className="sh-chip-tables">{source.table_count}t</span>}
              <span className={cx('sh-chip-dot', ok ? 'sh-dot-ok' : loading ? 'sh-dot-loading' : 'sh-dot-err')} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AnalyticsCard({ health }: { health?: any }) {
  const sourceBars = (health?.sources || []).slice(0, 5)
  const tableMax = Math.max(...sourceBars.map((s: any) => num(s.table_count)), 1)

  return (
    <section className="surface analytics-card">
      <div className="section-title">
        <div>
          <p>Provider Analytics</p>
          <span>Table coverage by connected source</span>
        </div>
        <div className="legend"><i /> Live Activity</div>
      </div>
      <div className="chart-wrap">
        {sourceBars.length ? sourceBars.map((item: any, index: number) => {
          const source = item.name || item.label
          const value = item.table_count ? Math.max(18, (num(item.table_count) / tableMax) * 92) : item.value
          return (
            <div className="bar-col" key={`${source}-${index}`}>
              <div className="bar-track">
                <div
                  className={cx('bar', item.tone || (index % 2 ? 'deep' : 'fresh'))}
                  style={{ height: `${value}%`, animationDelay: `${index * 90}ms` }}
                />
              </div>
              <span className={cx('chart-logo', `source-${sourceKey(source)}`)} title={source}>
                <SourceLogo source={source} className="h-5 w-5" />
              </span>
              <small>{String(source).replace(/_/g, ' ')}</small>
            </div>
          )
        }) : (
          <div className="chart-loading">
            <DatabaseZap className="h-6 w-6" />
            <p>Waiting for live Coral source metadata</p>
          </div>
        )}
      </div>
      <div className="chart-footer">
        <span>Average: <b>{sourceBars.length ? Math.round(sourceBars.reduce((a: number, s: any) => a + num(s.table_count), 0) / sourceBars.length) : 'syncing'}</b></span>
        <span>Peak: <b>{sourceBars.length ? tableMax : 'syncing'}</b></span>
      </div>
    </section>
  )
}

function ProgressCard({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(score, 100))
  return (
    <section className="surface progress-card">
      <div className="section-title compact">
        <div>
          <p>System Progress</p>
          <span>Operational readiness</span>
        </div>
      </div>
      <div className="ring-wrap" style={{ '--score': pct } as React.CSSProperties}>
        <div className="ring">
          <div className="ring-inner">
            <strong>{Math.round(pct)}%</strong>
            <span>Ready</span>
          </div>
        </div>
      </div>
      <div className="ring-legend">
        <span><i className="green" /> Connected</span>
        <span><i className="dark" /> In Progress</span>
        <span><i className="stripe" /> Pending</span>
      </div>
    </section>
  )
}

function ReminderCard({ overview, rootCause, setActive }: { overview?: any; rootCause?: any; setActive: (id: NavId) => void }) {
  const incident = overview?.proofs?.find((proof: any) => proof.name?.includes('Incident'))?.sample_rows?.[0]
  const rootRows = rootCause?.root_causes || []
  const reminderTitle = incident
    ? 'PagerDuty incident is still open'
    : rootRows.length
      ? 'Root-cause signals need review'
      : 'No urgent service reminder'
  const reminderDetail = incident
    ? `${incident.service || 'Service'} · ${incident.urgency || 'unknown'} urgency`
    : rootRows.length
      ? `${rootRows.length} root-cause ${rootRows.length === 1 ? 'chain needs' : 'chains need'} review`
      : 'Cross-source checks are quiet right now'

  return (
    <section className="surface reminders-card">
      <div className="section-title compact">
        <div>
          <p>Reminders</p>
          <span>Signals that need eyes</span>
        </div>
      </div>
      <div className="reminder-box">
        <p>{reminderTitle}</p>
        <span>{reminderDetail}</span>
        <button type="button" onClick={() => setActive('rootcause')}>
          <Activity className="h-4 w-4" />
          Review Signals
        </button>
      </div>
    </section>
  )
}

function TeamCard({ engineers, setActive }: { engineers?: any; setActive: (id: NavId) => void }) {
  const rows = (engineers?.engineers || []).slice(0, 4)

  return (
    <section className="surface team-card">
      <div className="section-title">
        <div>
          <p>Team Collaboration</p>
          <span>Workload and risk from Linear plus GitHub</span>
        </div>
        <button type="button" className="soft-btn" onClick={() => setActive('engineers')}>
          <Plus className="h-4 w-4" /> View All
        </button>
      </div>
      <div className="team-list">
        {rows.length ? rows.map((person: any, index: number) => {
          const risk = riskTone(person.risk_level)
          return (
            <div className="person-row" key={`${person.name}-${index}`}>
              <div className={cx('person-avatar', risk)}>{String(person.name || 'H').slice(0, 2).toUpperCase()}</div>
              <div>
                <p>{person.name}</p>
                <span>
                  {person.detail ||
                    `${person.open_tickets || 0} tickets · ${person.pr_count || 0} PRs · ${person.error_count || 0} errors`}
                </span>
              </div>
              <b className={cx('state-pill', risk)}>{person.risk_level || 'low'}</b>
            </div>
          )
        }) : (
          <EmptyState title="No workload rows yet" detail="Helm is waiting for assigned Linear issues, PRs, or Sentry ownership data." />
        )}
      </div>
    </section>
  )
}

function ProjectCard({ engineers, rootCause, setActive }: { engineers?: any; rootCause?: any; setActive: (id: NavId) => void }) {
  const setupTaskTitles = new Set(['Connect your tools', 'Set up your teams', 'Get familiar with Linear', 'Import your data'])
  const linearRows =
    engineers?.proofs
      ?.find((proof: any) => proof.name === 'Open Linear issues')
      ?.sample_rows?.filter((item: any) => !setupTaskTitles.has(item.title))
      ?.slice(0, 5) || []
  const rootRows = (rootCause?.root_causes || []).slice(0, 4)
  const rows = linearRows.length
    ? linearRows.map((item: any) => ({
        title: item.title,
        detail: `${item.identifier || 'Linear'} · ${item.state_name || 'Todo'}`,
      }))
    : rootRows.map((item: any) => ({
        title: `PR #${item.pr_number} triggered ${item.level || 'error'} evidence`,
        detail: `${item.sentry_project || 'Sentry'} · ${item.error_title || 'production signal'}`,
      }))

  return (
    <section className="surface project-card">
      <div className="section-title">
        <div>
          <p>Project</p>
          <span>Open work queue</span>
        </div>
        <button type="button" className="soft-btn" onClick={() => setActive('rootcause')}>
          <Plus className="h-4 w-4" /> Investigate
        </button>
      </div>
      <div className="project-list">
        {rows.length ? rows.map((item: any, index: number) => {
          return (
            <div className="project-row" key={`${item.title}-${index}`}>
              <div className={cx('project-icon', `tone-${(index % 5) + 1}`)}>
                <Workflow className="h-5 w-5" />
              </div>
              <div>
                <p>{item.title}</p>
                <span>{item.detail}</span>
              </div>
            </div>
          )
        }) : (
          <EmptyState title="No project signals available" detail="Helm will populate this from live Linear work or Coral root-cause evidence." />
        )}
      </div>
    </section>
  )
}

function IncidentActionCard({ overview, rootCause, setActive }: { overview?: any; rootCause?: any; setActive: (id: NavId) => void }) {
  const incident = overview?.proofs?.find((proof: any) => proof.name?.includes('Incident'))?.sample_rows?.[0]
  const rootRows = rootCause?.root_causes || []
  const title = incident ? 'Open PagerDuty incident' : rootRows.length ? 'Root-cause evidence ready' : 'No active incident correlation'
  const detail = incident
    ? `${incident.service || 'Service'} · ${incident.urgency || 'unknown urgency'} · ${incident.incident_status || 'open'}`
    : rootRows.length
      ? `${rootRows.length} cross-source evidence ${rootRows.length === 1 ? 'chain is' : 'chains are'} ready for review. PagerDuty and Slack can enrich the same graph when seeded.`
      : 'Use this panel to jump into the live evidence graph or approval queue when signals appear.'

  return (
    <section className="dark-card mobile-card">
      <div className="phone-icon" />
      <h3>{title}</h3>
      <p>{detail}</p>
      <button type="button" onClick={() => setActive('rootcause')}><Sparkles className="h-4 w-4" /> Review Evidence Graph</button>
      <button type="button" onClick={() => setActive('actions')}><DatabaseZap className="h-4 w-4" /> Open Approval Queue</button>
      <div className="wave one" />
      <div className="wave two" />
    </section>
  )
}

function QueryPerformanceCard({ overview, health }: { overview?: any; health?: any }) {
  const overviewProofs = overview?.proofs || []
  const healthProofs = health?.sources || []
  const durations = overviewProofs.map((proof: any) => num(proof.duration_ms)).filter(Boolean)
  const slowest = durations.length ? Math.max(...durations) : 0
  const okProofs = overviewProofs.filter((proof: any) => proof.status === 'ok').length
  const okSources = healthProofs.filter((source: any) => source.status === 'ok').length

  return (
    <section className="dark-card query-card">
      <div className="wave-grid" />
      <p>Live Query Runtime</p>
      <strong>{slowest ? `${slowest}ms` : 'syncing'}</strong>
      <div className="query-stats">
        <span>{okProofs}/{overviewProofs.length || 0} proofs ok</span>
        <span>{okSources}/{healthProofs.length || 0} sources online</span>
      </div>
    </section>
  )
}

function formatTime(value?: string) {
  if (!value) return 'time unknown'
  return String(value).replace('T', ' ').slice(0, 19)
}

type FixStepState = 'pending' | 'running' | 'done' | 'error'

type FixStep = {
  id: string
  label: string
  detail: string
  state: FixStepState
  icon: React.ElementType
}

type FixLogTone = 'stage' | 'success' | 'info' | 'warn' | 'error'

type FixLogRow = {
  tone: FixLogTone
  title: string
  detail?: string
  chip?: string
}

function hasOutput(output: string, pattern: RegExp) {
  return pattern.test(output || '')
}

function getFixSteps(status: 'idle' | 'running' | 'done' | 'error', output: string, result: any, mergeMode: boolean): FixStep[] {
  const failed = status === 'error'

  const state = (done: boolean, running: boolean): FixStepState => {
    if (failed && running) return 'error'
    if (done) return 'done'
    if (running) return 'running'
    return 'pending'
  }

  const steps: FixStep[] = [
    {
      id: 'evidence',
      label: 'Verify live evidence',
      detail: 'Require the GitHub PR × Sentry error join before touching code.',
      state: state(status !== 'idle', status === 'running'),
      icon: DatabaseZap,
    },
    {
      id: 'branch',
      label: 'Prepare remediation branch',
      detail: hasOutput(output, /preparing remediation branch/i) || result ? 'Create a timestamped fix branch from the verified evidence.' : 'Waiting for evidence gate.',
      state: state(hasOutput(output, /preparing remediation branch|already contains the remediation|Fix PR #|existing repair pr/i) || Boolean(result), status === 'running' && hasOutput(output, /preparing remediation branch/i)),
      icon: Terminal,
    },
    {
      id: 'test',
      label: 'Run smoke test',
      detail: 'Validate the checkout guard before opening the PR.',
      state: state(hasOutput(output, /smoke ok|smoke test.*pass/i) || Boolean(result?.already_fixed), status === 'running' && hasOutput(output, /running smoke test/i)),
      icon: ShieldCheck,
    },
    {
      id: 'pr',
      label: mergeMode ? 'Open and merge fix PR' : 'Open fix PR',
      detail: mergeMode ? 'Create PR and merge only when explicitly requested.' : 'Create a pull request for human review.',
      state: failed ? 'error' : result ? 'done' : status === 'running' ? 'running' : 'pending',
      icon: CheckCircle2,
    },
  ]

  return steps
}

function getFixLogRows(output: string): FixLogRow[] {
  const normalized = String(output || '').replace(/\s+==>\s+/g, '\n==> ')
  const seen = new Set<string>()

  const rows = normalized
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line): FixLogRow | null => {
      const clean = line.replace(/^==>\s*/, '')

      if (/^>\s+/.test(clean) && !/smoke ok/i.test(clean)) return null
      if (/^https:\/\/github\.com\/.+\/pull\/\d+$/i.test(clean)) return null
      if (/^Review and merge when ready:/i.test(clean)) return null
      if (/^Or rerun with .*Merge/i.test(clean)) return null

      if (/checking helm evidence endpoint/i.test(clean)) {
        return {
          tone: 'stage',
          title: 'Checking live evidence',
          detail: 'Confirming Helm can join GitHub PR evidence to the Sentry production error.',
          chip: 'Coral SQL',
        }
      }

      if (/checking for existing repair pr/i.test(clean)) {
        return {
          tone: 'stage',
          title: 'Checking for existing repair PR',
          detail: 'Avoiding duplicate remediation work if the fix already exists.',
          chip: 'GitHub',
        }
      }

      if (/existing repair pr already open/i.test(clean)) {
        return {
          tone: 'success',
          title: 'Repair PR is already open',
          detail: clean,
          chip: 'existing',
        }
      }

      if (/^Evidence:/i.test(clean)) {
        const pr = clean.match(/PR\s*#?(\d+)/i)?.[1]
        return {
          tone: 'success',
          title: pr ? `Evidence found for PR #${pr}` : 'Evidence chain found',
          detail: clean.replace(/^Evidence:\s*/i, ''),
          chip: 'live match',
        }
      }

      if (/^Joined rows:/i.test(clean)) {
        const count = clean.match(/Joined rows:\s*(\d+)/i)?.[1] || '0'
        return {
          tone: Number(count) > 0 ? 'success' : 'warn',
          title: `${count} joined row${count === '1' ? '' : 's'} confirmed`,
          detail: 'The fix starts only after the live join returns evidence.',
        }
      }

      if (/preparing remediation branch/i.test(clean)) {
        return {
          tone: 'stage',
          title: 'Preparing remediation branch',
          detail: 'Creating the checkout null-cart protection branch.',
          chip: 'git',
        }
      }

      if (/already up to date/i.test(clean) || /branch is up to date/i.test(clean)) {
        return {
          tone: 'info',
          title: 'Repository is current',
          detail: 'Main is already synced with origin.',
        }
      }

      if (/checkout\.js already contains the remediation/i.test(clean)) {
        return {
          tone: 'success',
          title: 'Checkout guard already present',
          detail: 'No code change is needed because the remediation is already in place.',
          chip: 'no PR needed',
        }
      }

      if (/running smoke test/i.test(clean)) {
        return {
          tone: 'stage',
          title: 'Running smoke test',
          detail: 'Verifying the checkout guard handles a null cart safely.',
        }
      }

      if (/smoke ok|smoke test.*pass/i.test(clean)) {
        return {
          tone: 'success',
          title: 'Smoke test passed',
          detail: 'The checkout guard passed the focused validation.',
        }
      }

      if (/\[fix\/checkout-null-cart-.+\]\s+Restore checkout null-cart protection/i.test(clean)) {
        const commit = clean.match(/\]\s+([a-f0-9]{7,})\s+/i)?.[1]
        return {
          tone: 'success',
          title: 'Fix committed',
          detail: 'Restore checkout null-cart protection committed to the remediation branch.',
          chip: commit || 'commit',
        }
      }

      if (/pushing remediation branch/i.test(clean)) {
        return {
          tone: 'stage',
          title: 'Pushing remediation branch',
          detail: 'Publishing the fix branch to GitHub.',
        }
      }

      if (/branch 'fix\/checkout-null-cart-.+' set up to track/i.test(clean)) {
        return {
          tone: 'success',
          title: 'Remote branch ready',
          detail: 'The remediation branch is tracking origin.',
        }
      }

      if (/opening github pr/i.test(clean)) {
        return {
          tone: 'stage',
          title: 'Opening GitHub PR',
          detail: 'Creating the reviewable remediation pull request.',
        }
      }

      if (/Fix PR #/i.test(clean)) {
        const pr = clean.match(/Fix PR #(\d+)/i)?.[1]
        const url = clean.match(/https:\/\/github\.com\/\S+/i)?.[0]
        return {
          tone: 'success',
          title: pr ? `Fix PR #${pr} is ready` : 'Fix PR is ready',
          detail: url || 'Open the PR to review the remediation.',
          chip: 'PR Ready',
        }
      }

      if (/merged:\s*true/i.test(clean)) {
        return {
          tone: 'success',
          title: 'Repair merged',
          detail: 'The remediation PR was merged after the explicit merge request.',
        }
      }

      if (/no pr created/i.test(clean)) {
        return {
          tone: 'info',
          title: 'No pull request created',
          detail: clean,
        }
      }

      if (/error|failed|fatal/i.test(clean)) {
        return {
          tone: 'error',
          title: 'Needs attention',
          detail: clean,
        }
      }

      return {
        tone: 'info',
        title: clean,
      }
    })
    .filter((row): row is FixLogRow => Boolean(row))
    .filter(row => {
      const key = `${row.tone}:${row.title}:${row.detail || ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  return rows
}

function CoralThesisStrip({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  return (
    <div className={cx('coral-thesis-strip', variant === 'light' && 'coral-thesis-strip-light')}>
      <div>
        <DatabaseZap className="h-4 w-4" />
        <p>Zero ETL</p>
        <span>No sync jobs or warehouse</span>
      </div>
      <div>
        <Terminal className="h-4 w-4" />
        <p>Federated SQL</p>
        <span>Live SaaS APIs joined locally</span>
      </div>
      <div>
        <ShieldCheck className="h-4 w-4" />
        <p>Read-only retrieval</p>
        <span>Writes stay human-gated</span>
      </div>
    </div>
  )
}

function DemoMoment({ data, error, isLoading, onOpen }: {
  data?: any
  error?: unknown
  isLoading?: boolean
  onOpen: () => void
}) {
  const highlight = data?.highlight
  const metrics = data?.metrics || {}
  const proofError = data?.proofs?.find((proof: any) => proof.status === 'error')?.error
  const rows = data?.deployment_errors || []

  return (
    <section className="demo-moment">
      <div className="demo-copy">
        <p className="eyebrow">Live production evidence</p>
        <h2>{isLoading ? 'Joining PRs to production errors...' : data?.headline || 'PR to production error JOIN'}</h2>
        <span>
          {data?.subhead ||
            'Helm runs the real GitHub × Sentry Coral SQL join and shows the exact evidence chain.'}
        </span>
        <CoralThesisStrip />
        <div className="demo-actions">
          <button type="button" className="primary-btn" onClick={onOpen}>
            <GitMerge className="h-4 w-4" />
            Open release impact
          </button>
          <div className="demo-real-badge">
            <ShieldCheck className="h-4 w-4" />
            {data?.real_data ? 'Real Coral data' : 'Waiting on live rows'}
          </div>
        </div>
      </div>

      <div className="demo-stage-card">
        {isLoading ? (
          <div className="demo-loading shimmer" />
        ) : error || proofError ? (
          <div className="warning-box">
            <AlertTriangle className="h-5 w-5" />
            <div>
              <p>Live join needs source access</p>
              <span>{proofError || 'The live evidence endpoint returned an error.'}</span>
            </div>
          </div>
        ) : highlight ? (
          <>
            <div className="join-chain">
              <div className="join-node">
                <span className="source-logo-wrap source-github">
                  <SourceLogo source="github" className="h-5 w-5" />
                </span>
                <div>
                  <p>PR #{highlight.pr_number}</p>
                  <span>{highlight.pr_title}</span>
                  <small>{formatTime(highlight.merged_at)}</small>
                </div>
              </div>
              <div className="join-bridge">
                <i />
                <b>{metrics.minutes_to_error ?? '?'} min</b>
                <i />
              </div>
              <div className="join-node danger-node">
                <span className="source-logo-wrap source-sentry">
                  <SourceLogo source="sentry" className="h-5 w-5" />
                </span>
                <div>
                  <p>{highlight.error_title}</p>
                  <span>{highlight.sentry_project || 'Sentry'} · {highlight.level}</span>
                  <small>{formatTime(highlight.first_seen)}</small>
                </div>
              </div>
            </div>
            <div className="demo-stat-row">
              <div>
                <p>{metrics.events_seen || 0}</p>
                <span>events seen</span>
              </div>
              <div>
                <p>{metrics.users_affected || 0}</p>
                <span>users affected</span>
              </div>
              <div>
                <p>{metrics.join_rows || rows.length}</p>
                <span>joined rows</span>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title="No joined PR/error rows yet"
            detail="This is still real data: the Coral query ran, but GitHub and Sentry did not return a matching 24-hour window."
          />
        )}
        <CoralProofPanel proofs={data?.proofs || []} title="Killer JOIN proof" />
      </div>
    </section>
  )
}

function LiveMonitorPanel({ data, error, isLoading, isFetching, updatedAt, onRefresh, health }: {
  data?: any
  error?: unknown
  isLoading?: boolean
  isFetching?: boolean
  updatedAt?: number
  onRefresh: () => void | Promise<void>
  health?: any
}) {
  const highlight = data?.highlight
  const proof = data?.proofs?.[0]
  const links = data?.links || {}
  const sourceList = health?.sources || []
  const missingOptionalSources = ['pagerduty', 'slack'].filter(s => {
    const found = sourceList.find((item: any) => String(item.name || '').toLowerCase() === s)
    return !found || found.status !== 'ok'
  })
  const lastUpdated = updatedAt ? new Date(updatedAt).toLocaleTimeString() : '—'
  const minutesDelta = data?.metrics?.minutes_to_error
  const liveEvents = [
    {
      source: 'github',
      label: `PR #${highlight?.pr_number || '…'} merged`,
      detail: highlight?.pr_title || 'Waiting for merged PR',
      time: formatTime(highlight?.merged_at),
      ok: Boolean(highlight?.pr_number),
    },
    {
      source: 'coral',
      label: 'Coral SQL JOIN executed',
      detail: `github.pulls JOIN sentry.issues — ${proof?.row_count ?? 0} rows · ${proof?.duration_ms ?? '…'}ms`,
      time: proof?.duration_ms ? `${proof.duration_ms}ms` : '…',
      ok: proof?.status === 'ok',
    },
    {
      source: 'sentry',
      label: highlight?.sentry_project || 'Sentry project',
      detail: highlight?.error_title || 'Waiting for production error',
      time: formatTime(highlight?.first_seen),
      ok: Boolean(highlight?.error_title),
    },
  ]

  return (
    <section className="lm-page">
      {/* Header */}
      <div className="lm-header">
        <div className="lm-header-left">
          <div className={cx('lm-live-dot', isFetching && 'lm-live-dot-busy')} />
          <span className="lm-page-title">Live Monitor</span>
          <div className="lm-source-tags">
            <span className="lm-source-tag">
              <SourceLogo source="github" className="h-3 w-3" />
              github.pulls
            </span>
            <span className="lm-source-sep">×</span>
            <span className="lm-source-tag">
              <SourceLogo source="sentry" className="h-3 w-3" />
              sentry.issues
            </span>
          </div>
        </div>
        <div className="lm-header-right">
          <span className="lm-updated">{isFetching ? 'Refreshing…' : `Updated ${lastUpdated}`}</span>
          <button type="button" className="lm-refresh-btn" onClick={onRefresh}>
            <RefreshCw className={cx('h-3.5 w-3.5', isFetching && 'spin-icon')} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* SQL terminal */}
      <div className={cx('lm-terminal', isFetching && 'lm-terminal-running')}>
        <div className="lm-terminal-bar">
          <div className="lm-terminal-dots">
            <span className="lm-dot lm-dot-r" />
            <span className="lm-dot lm-dot-y" />
            <span className="lm-dot lm-dot-g" />
          </div>
          <DatabaseZap className="h-3.5 w-3.5 lm-terminal-icon" />
          <span className="lm-terminal-name">incident_join.sql</span>
          <div className="lm-terminal-meta">
            <span className={cx('lm-query-status', proof?.status === 'ok' ? 'lm-qs-ok' : 'lm-qs-pending')}>
              {proof?.status ?? 'running'}
            </span>
            {proof?.row_count != null && <span className="lm-query-rows">{proof.row_count} rows</span>}
            {proof?.duration_ms != null && <span className="lm-query-time">{proof.duration_ms}ms</span>}
          </div>
        </div>
        <code className="lm-terminal-code">
          <span className="lm-line"><span className="sql-kw">WITH</span> recent_pulls <span className="sql-kw">AS</span> {'('}</span>
          <span className="lm-line">{'  '}<span className="sql-kw">SELECT</span></span>
          <span className="lm-line">{'    '}pr_number,</span>
          <span className="lm-line">{'    '}pr_title,</span>
          <span className="lm-line">{'    '}author,</span>
          <span className="lm-line">{'    '}merged_at</span>
          <span className="lm-line">{'  '}<span className="sql-kw">FROM</span> <span className="sql-tbl">github.pulls</span></span>
          <span className="lm-line">{'  '}<span className="sql-kw">WHERE</span>{' merged_at >= '}<span className="sql-fn">NOW</span>{'() - '}<span className="sql-kw">INTERVAL</span>{' '}<span className="sql-str">&#39;7 days&#39;</span></span>
          <span className="lm-line">{'),'}</span>
          <span className="lm-line">recent_errors <span className="sql-kw">AS</span> {'('}</span>
          <span className="lm-line">{'  '}<span className="sql-kw">SELECT</span></span>
          <span className="lm-line">{'    '}title,</span>
          <span className="lm-line">{'    '}project,</span>
          <span className="lm-line">{'    '}level,</span>
          <span className="lm-line">{'    '}times_seen,</span>
          <span className="lm-line">{'    '}first_seen</span>
          <span className="lm-line">{'  '}<span className="sql-kw">FROM</span> <span className="sql-tbl">sentry.issues</span></span>
          <span className="lm-line">{'  '}<span className="sql-kw">WHERE</span>{' first_seen >= '}<span className="sql-fn">NOW</span>{'() - '}<span className="sql-kw">INTERVAL</span>{' '}<span className="sql-str">&#39;7 days&#39;</span></span>
          <span className="lm-line">{')'}</span>
          <span className="lm-line"><span className="sql-kw">SELECT</span></span>
          <span className="lm-line">{'  '}p.pr_number,</span>
          <span className="lm-line">{'  '}p.pr_title,</span>
          <span className="lm-line">{'  '}e.title      <span className="sql-kw">AS</span> <span className="sql-alias">error_title</span>,</span>
          <span className="lm-line">{'  '}e.times_seen,</span>
          <span className="lm-line">{'  '}e.level,</span>
          <span className="lm-line">{'  '}e.first_seen</span>
          <span className="lm-line"><span className="sql-kw">FROM</span>{' recent_pulls p'}</span>
          <span className="lm-line"><span className="sql-kw">JOIN</span>{' recent_errors e'}</span>
          <span className="lm-line">{'  '}<span className="sql-kw">ON</span>{' e.first_seen '}<span className="sql-kw">BETWEEN</span>{' p.merged_at'}</span>
          <span className="lm-line">{'     '}<span className="sql-kw">AND</span>{' p.merged_at + '}<span className="sql-kw">INTERVAL</span>{' '}<span className="sql-str">&#39;2 hours&#39;</span></span>
          <span className="lm-line"><span className="sql-kw">ORDER BY</span>{' e.times_seen '}<span className="sql-kw">DESC</span></span>
        </code>
      </div>

      {error ? (
        <EmptyState title="Live signal unavailable" detail="The live Coral join did not respond. Check source connections." />
      ) : (
        <>
          {missingOptionalSources.length > 0 && (
            <div className="degrade-banner">
              <AlertTriangle className="h-4 w-4" />
              <span>{missingOptionalSources.map(displaySource).join(' and ')} not connected — showing GitHub × Sentry only. Connect PagerDuty and Slack for the full 4-source JOIN.</span>
            </div>
          )}

          {/* PR → Error chain */}
          <div className="lm-chain">
            <div className="lm-chain-card">
              <div className="lm-chain-card-head">
                <span className="source-logo-wrap source-github"><SourceLogo source="github" className="h-4 w-4" /></span>
                <span className="lm-chain-source-label">GitHub</span>
                <span className="lm-chain-time">{formatTime(highlight?.merged_at)}</span>
              </div>
              <p className="lm-chain-title">{highlight?.pr_title || (isLoading ? 'Loading…' : 'No PR detected')}</p>
              <div className="lm-chain-meta">
                <span>PR #{highlight?.pr_number || '—'}</span>
                {highlight?.author && <span>@{highlight.author}</span>}
                {links.pull_request && <a href={links.pull_request} target="_blank" rel="noreferrer">Open <ArrowUpRight className="h-3 w-3" /></a>}
              </div>
            </div>

            <div className="lm-chain-connector">
              <div className="lm-chain-line" />
              <div className="lm-chain-badge">
                <DatabaseZap className="h-3.5 w-3.5" />
                <span>{minutesDelta != null ? `${minutesDelta}m` : '…'}</span>
              </div>
              <div className="lm-chain-line" />
            </div>

            <div className="lm-chain-card lm-chain-card-danger">
              <div className="lm-chain-card-head">
                <span className="source-logo-wrap source-sentry"><SourceLogo source="sentry" className="h-4 w-4" /></span>
                <span className="lm-chain-source-label">Sentry</span>
                <span className="lm-chain-time">{formatTime(highlight?.first_seen)}</span>
              </div>
              <p className="lm-chain-title">{highlight?.error_title || (isLoading ? 'Loading…' : 'No error correlated')}</p>
              <div className="lm-chain-meta">
                <span>{highlight?.sentry_project || '—'}</span>
                <span className="lm-chain-level">{highlight?.level || 'error'}</span>
                {data?.metrics?.events_seen > 0 && (
                  <span>
                    {data.metrics.events_seen} {data.metrics.events_seen === 1 ? 'event' : 'events'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 2-col: live events + proof stats */}
          <div className="lm-grid">
            <div className="lm-card">
              <div className="lm-card-title">
                <Activity className="h-4 w-4" />
                Event trace
              </div>
              <div className="lm-events">
                {liveEvents.map(ev => (
                  <div key={ev.source} className={cx('lm-event', ev.ok && 'lm-event-ok')}>
                    <span className={cx('source-logo-wrap', `source-${ev.source}`)}>
                      {ev.source === 'coral' ? <DatabaseZap className="h-4 w-4" /> : <SourceLogo source={ev.source} className="h-4 w-4" />}
                    </span>
                    <div className="lm-event-body">
                      <p>{ev.label}</p>
                      <small>{ev.detail}</small>
                    </div>
                    <span className="lm-event-time">{ev.time}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lm-card">
              <div className="lm-card-title">
                <ShieldCheck className="h-4 w-4" />
                Query evidence
              </div>
              <div className="lm-proof-stats">
                <div className="lm-proof-stat">
                  <span className="lm-proof-val">{proof?.status ?? '—'}</span>
                  <span className="lm-proof-key">status</span>
                </div>
                <div className="lm-proof-stat">
                  <span className="lm-proof-val">{proof?.row_count ?? '—'}</span>
                  <span className="lm-proof-key">rows matched</span>
                </div>
                <div className="lm-proof-stat">
                  <span className="lm-proof-val">{proof?.duration_ms != null ? `${proof.duration_ms}ms` : '—'}</span>
                  <span className="lm-proof-key">runtime</span>
                </div>
                <div className="lm-proof-stat">
                  <span className="lm-proof-val">{data?.metrics?.events_seen ?? '—'}</span>
                  <span className="lm-proof-key">Sentry events</span>
                </div>
              </div>
              {(links.repo || links.pull_request) && (
                <div className="lm-links">
                  {links.pull_request && <a href={links.pull_request} target="_blank" rel="noreferrer">PR #{highlight?.pr_number} <ArrowUpRight className="h-3 w-3" /></a>}
                  {links.repo && <a href={links.repo} target="_blank" rel="noreferrer">Repository <ArrowUpRight className="h-3 w-3" /></a>}
                </div>
              )}
            </div>
          </div>

          <CoralProofPanel proofs={data?.proofs || []} title="Coral SQL proof — github.pulls JOIN sentry.issues" />
        </>
      )}
    </section>
  )
}

function DeploymentPanel({ data, error, isLoading }: { data?: any; error?: unknown; isLoading?: boolean }) {
  const rows = data?.deployment_errors || []
  const groupedRows = Object.values(rows.reduce((acc: Record<string, any>, row: any) => {
    const key = `${row.pr_number}-${row.pr_title}`
    if (!acc[key]) {
      acc[key] = {
        ...row,
        matched_errors: new Set<string>(),
        total_events: 0,
      }
    }
    acc[key].matched_errors.add(row.error_title)
    acc[key].total_events += num(row.times_seen)
    return acc
  }, {})).map((row: any) => ({
    ...row,
    matched_error_count: row.matched_errors.size,
  }))

  return (
    <section className="surface detail-panel">
      <div className="section-title">
        <div>
          <p>Deployment Watch</p>
          <span>Causal matches only · each Sentry issue is assigned to its nearest preceding merged PR</span>
        </div>
        <GitMerge className="h-5 w-5" />
      </div>
      {isLoading ? (
        <div className="ops-skeleton-grid">
          {[1, 2, 3].map(item => <div key={item} className="ops-skeleton shimmer" />)}
        </div>
      ) : error ? (
        <EmptyState title="Deployment query unavailable" detail="Backend returned an error for this endpoint." />
      ) : groupedRows.length ? (
        <div className="compact-list">
          {groupedRows.slice(0, 4).map((row: any, index: number) => (
            <div key={`${row.pr_number}-${index}`} className="compact-row release-row">
              <div>
                <p>PR #{row.pr_number}: {row.pr_title}</p>
                <span>
                  {row.matched_error_count} matched {row.matched_error_count === 1 ? 'Sentry issue' : 'Sentry issues'} · {row.total_events || 0} total events
                </span>
              </div>
              <b>{String(row.merged_at || '').slice(0, 10)}</b>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No deployment-correlated errors" detail="Recent merges have not produced matching Sentry errors." />
      )}
      <PRErrorTimeline rows={rows} />
      <CoralProofPanel proofs={data?.proofs || []} title="Deployment proof" />
    </section>
  )
}

function EngineerOpsPanel({ data, error, isLoading }: { data?: any; error?: unknown; isLoading?: boolean }) {
  const rows = data?.engineers || []
  const maxBurnout = Math.max(...rows.map((row: any) => num(row.burnout_score)), 1)

  return (
    <section className="surface detail-panel">
      <div className="section-title">
        <div>
          <p>Workload Command Board</p>
          <span>GitHub activity, Linear backlog, and Sentry ownership in one read</span>
        </div>
        <Users className="h-5 w-5" />
      </div>
      {isLoading ? (
        <div className="ops-skeleton-grid">
          {[1, 2, 3].map(item => <div key={item} className="ops-skeleton shimmer" />)}
        </div>
      ) : error ? (
        <EmptyState title="Engineer signal unavailable" detail="The backend could not return workload data." />
      ) : rows.length ? (
        <div className="ops-table">
          <div className="ops-table-head">
            <span>Engineer</span>
            <span>Burnout</span>
            <span>Open work</span>
            <span>Signal</span>
          </div>
          {rows.map((row: any, index: number) => {
            const risk = riskTone(row.risk_level)
            const pct = Math.min((num(row.burnout_score) / maxBurnout) * 100, 100)
            return (
              <div key={`${row.name}-${index}`} className="ops-table-row">
                <div className="ops-person">
                  <span className={cx('person-avatar', risk)}>{String(row.name || 'UN').slice(0, 2).toUpperCase()}</span>
                  <div>
                    <p>{row.name || 'Unassigned'}</p>
                    <span>{row.pr_count || 0} PRs · {row.error_count || 0} Sentry errors</span>
                  </div>
                </div>
                <div className="ops-meter">
                  <i style={{ width: `${pct}%` }} />
                  <b>{row.burnout_score || 0}</b>
                </div>
                <span>{row.open_tickets || 0} Linear issues</span>
                <b className={cx('state-pill', risk)}>{row.risk_level || 'low'}</b>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState title="No engineer workload rows yet" detail="Linear is connected, but there is not enough assignment data for a risk table." />
      )}
      <BurnoutBarChart engineers={rows} />
      <CoralProofPanel proofs={data?.proofs || []} title="Workload proof" />
    </section>
  )
}

function ServicesPanel({ data, error, isLoading }: { data?: any; error?: unknown; isLoading?: boolean }) {
  const rows = data?.services || []
  const proofError = data?.proofs?.find((proof: any) => proof.status === 'error')?.error

  return (
    <section className="surface detail-panel">
      <div className="section-title">
        <div>
          <p>Service Stability</p>
          <span>Sentry issues joined to PagerDuty incidents</span>
        </div>
        <Gauge className="h-5 w-5" />
      </div>
      {isLoading ? (
        <div className="ops-skeleton-grid">
          {[1, 2, 3].map(item => <div key={item} className="ops-skeleton shimmer" />)}
        </div>
      ) : error || proofError ? (
        <div className="warning-box">
          <AlertTriangle className="h-5 w-5" />
          <div>
            <p>Sentry issue query is slow</p>
            <span>{proofError || 'The services endpoint returned an error.'}</span>
          </div>
        </div>
      ) : rows.length ? (
        <div className="compact-list">
          {rows.slice(0, 5).map((row: any) => (
            <div key={row.service_name} className="compact-row">
              <p>{row.service_name}</p>
              <span>{row.error_count} errors · {row.incident_count} incidents</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No service instability detected" detail="Sentry authenticated, but no issue rows are visible yet." />
      )}
      <ServiceStabilityChart services={rows} />
      <CoralProofPanel proofs={data?.proofs || []} title="Service proof" />
    </section>
  )
}

function RootCausePanel({ data, error, isLoading }: { data?: any; error?: unknown; isLoading?: boolean }) {
  const rows = data?.root_causes || []
  const chainRows = Object.values(rows.reduce((acc: Record<string, any>, row: any) => {
    const key = `${row.pr_number || 'unknown'}-${row.pr_title || row.error_title || 'chain'}`
    if (!acc[key]) {
      acc[key] = {
        ...row,
        matched_errors: new Set<string>(),
        total_events: 0,
        total_slack_messages: 0,
        incident_count: 0,
        evidence_score: num(row.evidence_score),
      }
    }
    if (row.error_title) acc[key].matched_errors.add(row.error_title)
    acc[key].total_events += num(row.times_seen)
    acc[key].total_slack_messages += num(row.slack_messages)
    if (row.incident_id) acc[key].incident_count += 1
    acc[key].evidence_score = Math.max(num(acc[key].evidence_score), num(row.evidence_score))
    return acc
  }, {})).map((row: any) => ({
    ...row,
    matched_error_count: row.matched_errors.size,
  }))
  const missing = data?.missing
  const sources = missing
    ? ['github', 'sentry']
    : ['github', 'sentry', 'pagerduty', 'slack']
  return (
    <section className="rc-page">
      {/* Header */}
      <div className="rc-header">
        <div className="rc-header-left">
          <Network className="h-4 w-4 rc-header-icon" />
          <span className="rc-header-title">Root Cause Analysis</span>
          <div className="rc-source-tags">
            {sources.map(s => (
              <span key={s} className="rc-source-tag">
                <SourceLogo source={s} className="h-3 w-3" />
              </span>
            ))}
          </div>
        </div>
        <div className="rc-header-right">
          {chainRows.length > 0 && <span className="rc-meta-pill">{chainRows.length} chains</span>}
          <span className="rc-meta-pill">{sources.length}-source JOIN</span>
        </div>
      </div>

      {isLoading ? (
        <div className="rc-skeletons">
          {[0,1,2].map(i => <div key={i} className="rc-skeleton ch-shimmer" style={{ animationDelay: `${i*100}ms` }} />)}
        </div>
      ) : error ? (
        <EmptyState title="Root cause graph unavailable" detail="The backend could not resolve the current evidence chain." />
      ) : (
        <>
          {missing && (
            <div className="degrade-banner">
              <AlertTriangle className="h-4 w-4" />
              <span>{missing} — showing GitHub × Sentry only. Connect PagerDuty and Slack for the full 4-source JOIN.</span>
            </div>
          )}
          {chainRows.length ? (
            <div className="rc-chains">
              {chainRows.slice(0, 6).map((row: any, index: number) => {
                const score = num(row.evidence_score)
                const scoreClass = score >= 70 ? 'rc-score-high' : score >= 40 ? 'rc-score-med' : 'rc-score-low'
                return (
                  <div key={`${row.pr_number || index}-${index}`} className="rc-chain">
                    <div className="rc-chain-score-col">
                      <span className={cx('rc-score', scoreClass)}>{score}</span>
                      <span className="rc-score-label">score</span>
                    </div>
                    <div className="rc-chain-body">
                      <div className="rc-chain-pr">
                        <span className="rc-chain-pr-num">PR #{row.pr_number}</span>
                        <span className="rc-chain-pr-title">{row.pr_title || row.error_title || `Evidence chain ${index + 1}`}</span>
                      </div>
                      <div className="rc-chain-stats">
                        <span className="rc-stat">{row.matched_error_count} Sentry {row.matched_error_count === 1 ? 'issue' : 'issues'}</span>
                        <span className="rc-stat">{row.total_events || 0} events</span>
                        {row.incident_count > 0 && <span className="rc-stat rc-stat-warn">{row.incident_count} PagerDuty incident{row.incident_count !== 1 ? 's' : ''}</span>}
                        {row.total_slack_messages > 0 && <span className="rc-stat">{row.total_slack_messages} Slack msgs</span>}
                        {(row.service || row.sentry_project) && (
                          <span className="rc-stat rc-stat-service">{row.service || row.sentry_project}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState title="No high-confidence chain found" detail="No matching PR → error chain found in the last 30 days." />
          )}
        </>
      )}
      <EvidenceScoreChart rows={rows} />
      <CoralProofPanel proofs={data?.proofs || []} title="Causality SQL proof" />
    </section>
  )
}

function ActionApprovalCard({ action }: { action: any }) {
  const [approvalState, setApprovalState] = useState<'idle' | 'approved' | 'error'>('idle')

  async function approveDraft() {
    try {
      await navigator.clipboard?.writeText(action.body || '')
      setApprovalState('approved')
      window.setTimeout(() => setApprovalState('idle'), 2200)
    } catch {
      setApprovalState('error')
      window.setTimeout(() => setApprovalState('idle'), 2400)
    }
  }

  return (
    <div className="action-card">
      <div className="action-card-header">
        <p>{action.title}</p>
        <span className={cx('state-pill', action.risk_level === 'high' ? 'danger' : 'warn')}>
          {action.risk_level || 'medium'}
        </span>
      </div>
      <div className="action-meta">
        <span className="action-target">{action.target}</span>
        <span className="action-status">
          {approvalState === 'approved'
            ? 'Approved draft copied'
            : approvalState === 'error'
            ? 'Approval copy failed'
            : formatWriteStatus(action.write_status)}
        </span>
      </div>
      <div className="action-guardrail">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>Clipboard only · no external write executed</span>
      </div>
      {action.body && (
        <p className="action-body-preview">{String(action.body).slice(0, 140)}{action.body.length > 140 ? '...' : ''}</p>
      )}
      <button
        type="button"
        className={cx('action-copy-btn', approvalState === 'approved' && 'approved')}
        onClick={approveDraft}
      >
        {approvalState === 'approved' ? (
          <><CheckCircle2 className="h-3.5 w-3.5" /> Approved · copied</>
        ) : approvalState === 'error' ? (
          'Copy failed'
        ) : (
          'Approve and Copy Draft'
        )}
      </button>
    </div>
  )
}

function ActionsPanel({ data, error, isLoading }: { data?: any; error?: unknown; isLoading?: boolean }) {
  const actions = data?.actions || []
  return (
    <section className="surface detail-panel">
      <div className="section-title">
        <div>
          <p>Approval Center</p>
          <span>Drafted actions remain gated by human review</span>
        </div>
        <ShieldCheck className="h-5 w-5" />
      </div>
      {isLoading ? (
        <div className="ops-skeleton-grid">
          {[1, 2].map(item => <div key={item} className="ops-skeleton shimmer" />)}
        </div>
      ) : error ? (
        <EmptyState title="Approval queue unavailable" detail="The actions endpoint could not return draft recommendations." />
      ) : actions.length ? (
        <div className="action-grid">
          {actions.slice(0, 4).map((action: any) => (
            <ActionApprovalCard key={action.approval_id || action.title} action={action} />
          ))}
        </div>
      ) : (
        <EmptyState title="No action drafts queued" detail="Helm will draft, never write, until you approve." />
      )}
      <CoralProofPanel proofs={data?.proofs || []} title="Action proof" />
    </section>
  )
}

function ReadinessStatusPill({ status }: { status: string }) {
  if (status === 'ready')    return <span className="readiness-pill ready">✓ Ready</span>
  if (status === 'degraded') return <span className="readiness-pill degraded">⚠ Degraded</span>
  return <span className="readiness-pill blocked">✗ Blocked</span>
}

function SourceSetupPanel({ health, error, isLoading, readiness, readinessLoading }: {
  health?: any; error?: unknown; isLoading?: boolean; readiness?: any; readinessLoading?: boolean
}) {
  const sources = health?.sources || []
  const okSources = sources.filter((source: any) => source.status === 'ok').length
  const discoverableSources: string[] = health?.discoverable_sources || []
  const installedNames = new Set(sources.map((s: any) => s.name))
  const notInstalled = discoverableSources.filter(s => !installedNames.has(s))
  const describeExtended: Record<string, any[]> = health?.describe_extended || {}

  const readySources = readiness
    ? Object.values(readiness.sources as Record<string, any>).filter(s => s.status === 'ready').length
    : null
  const totalContractSources = readiness ? Object.keys(readiness.sources).length : 5

  return (
    <section className="surface detail-panel">
      <div className="section-title">
        <div>
          <p>Coral Source Setup</p>
          <span>Installed providers, required inputs, and live table visibility from Coral.</span>
        </div>
        <Settings className="h-5 w-5" />
      </div>
      {isLoading ? (
        <div className="ops-skeleton-grid">
          {[1, 2, 3].map(item => <div key={item} className="ops-skeleton shimmer" />)}
        </div>
      ) : error ? (
        <EmptyState title="Source setup unavailable" detail="Helm could not inspect Coral source metadata." />
      ) : (
        <>
          <div className="workspace-summary-grid">
            <div><p>{okSources}/{sources.length || 0}</p><span>sources healthy</span></div>
            <div><p>{sources.reduce((sum: number, source: any) => sum + num(source.table_count), 0)}</p><span>tables visible</span></div>
            <div><p>{notInstalled.length}</p><span>available to add</span></div>
          </div>

          {/* ── Contract Readiness ── */}
          <div className="readiness-panel">
            <div className="setup-schema-header readiness-header">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>
                Contract Readiness ·{' '}
                <code>coral.tables · coral.columns · coral.filters · coral.table_functions · coral.inputs</code>
              </span>
              {readiness && (
                <span className={cx('readiness-overall', readiness.ready ? 'ok' : 'fail')}>
                  {readiness.ready
                    ? `${readySources}/${totalContractSources} sources ready`
                    : `${readySources}/${totalContractSources} ready — action needed`}
                </span>
              )}
            </div>

            {readinessLoading && !readiness ? (
              <div className="readiness-loading">
                <div className="ops-skeleton shimmer readiness-skeleton" />
              </div>
            ) : readiness?.sources ? (
              <>
                <div className="readiness-source-list">
                  {(Object.entries(readiness.sources) as [string, any][]).map(([name, src]) => (
                    <div key={name} className={cx('readiness-source-row', `readiness-${src.status}`)}>
                      <div className="readiness-source-head">
                        <span className={cx('source-logo-wrap', src.status === 'ready' ? 'ok' : 'bad', `source-${sourceKey(name)}`)}>
                          <SourceLogo source={name} className="h-4 w-4" />
                        </span>
                        <p>{displaySource(name)}</p>
                        <ReadinessStatusPill status={src.status} />
                      </div>

                      <div className="readiness-checks">
                        {/* Present tables */}
                        {(src.tables_present as string[]).map(t => (
                          <span key={t} className="readiness-check ok">✓ {t}</span>
                        ))}
                        {/* Present functions with args */}
                        {(src.functions_present as any[]).map((f: any) => (
                          <span key={f.name} className="readiness-check ok fn">
                            ✓ {f.name}({(f.args as string[]).join(', ')})
                          </span>
                        ))}
                        {/* Missing tables */}
                        {(src.missing_tables as string[]).map(t => (
                          <span key={t} className="readiness-check fail">✗ {t} table missing</span>
                        ))}
                        {/* Missing functions */}
                        {(src.missing_functions as string[]).map(f => (
                          <span key={f} className="readiness-check fail">✗ {f}() function missing</span>
                        ))}
                        {/* Missing columns */}
                        {(Object.entries(src.missing_columns) as [string, string[]][]).map(([tbl, cols]) => (
                          <span key={tbl} className="readiness-check warn">
                            ⚠ {tbl}: missing {cols.join(', ')}
                          </span>
                        ))}
                        {/* Missing filters */}
                        {(Object.entries(src.missing_filters) as [string, string[]][]).map(([tbl, filters]) => (
                          <span key={tbl} className="readiness-check warn">
                            ⚠ {tbl}: missing filters {filters.join(', ')}
                          </span>
                        ))}
                        {/* Missing function args */}
                        {(Object.entries(src.missing_function_args) as [string, string[]][]).map(([fn, args]) => (
                          <span key={fn} className="readiness-check warn">
                            ⚠ {fn}(): missing args {args.join(', ')}
                          </span>
                        ))}
                        {/* Missing credentials */}
                        {(src.missing_credentials as string[]).length > 0 && (
                          <span className="readiness-check fail">
                            ✗ credentials not set: {(src.missing_credentials as string[]).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* SQL proof accordion */}
                <details className="readiness-sql-accordion">
                  <summary>
                    <DatabaseZap className="h-3 w-3" />
                    SQL used for validation · {Object.keys(readiness.sql_proofs).length} queries ·{' '}
                    {readiness.duration_ms}ms
                  </summary>
                  <div className="readiness-sql-rows">
                    {(Object.entries(readiness.sql_proofs) as [string, string][]).map(([key, sql]) => (
                      <div key={key} className="readiness-sql-row">
                        <span className="readiness-sql-key">{key}</span>
                        <code>{sql}</code>
                      </div>
                    ))}
                  </div>
                </details>

                {readiness.errors?.length > 0 && (
                  <div className="readiness-errors">
                    {(readiness.errors as string[]).map((e: string, i: number) => (
                      <div key={i} className="readiness-error-row">{e}</div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* coral.columns live introspection */}
          {sources.length > 0 && (
            <div className="setup-schema-panel">
              <div className="setup-schema-header">
                <DatabaseZap className="h-3.5 w-3.5" />
                <span>Live schema introspection · <code>SELECT schema_name, COUNT(DISTINCT table_name), COUNT(*) FROM coral.columns GROUP BY 1</code></span>
              </div>
              <div className="setup-schema-table">
                <div className="setup-schema-head">
                  <span>Source</span>
                  <span>Tables</span>
                  <span>Columns</span>
                  <span>Avg cols/table</span>
                </div>
                {sources.map((source: any) => (
                  <div key={source.name} className="setup-schema-row">
                    <span>{displaySource(source.name)}</span>
                    <b>{source.table_count || 0}</b>
                    <b>{source.column_count || 0}</b>
                    <span>{source.table_count > 0 ? Math.round((source.column_count || 0) / source.table_count) : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DESCRIBE EXTENDED — planner metadata per installed source */}
          {Object.keys(describeExtended).length > 0 && (
            <div className="setup-schema-panel">
              <div className="setup-schema-header">
                <Info className="h-3.5 w-3.5" />
                <span>DESCRIBE EXTENDED — planner metadata · recommended JOINs, query count, cache hit rate</span>
              </div>
              {Object.entries(describeExtended).map(([src, rows]) => (
                rows.length > 0 && (
                  <div key={src} className="setup-describe-block">
                    <p className="setup-describe-source">{displaySource(src)}</p>
                    <div className="setup-describe-rows">
                      {rows.map((row: any, i: number) => (
                        <div key={i} className="setup-describe-row">
                          {Object.entries(row).map(([k, v]) => (
                            <span key={k}><b>{k}:</b> {String(v ?? '—')}</span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              ))}
            </div>
          )}

          {/* Discoverable sources — available to install via coral source add */}
          {notInstalled.length > 0 && (
            <div className="setup-discoverable-panel">
              <div className="setup-schema-header">
                <PackagePlus className="h-3.5 w-3.5" />
                <span>{notInstalled.length} more source{notInstalled.length !== 1 ? 's' : ''} available · <code>coral source add --interactive &lt;name&gt;</code></span>
              </div>
              <div className="setup-discoverable-chips">
                {notInstalled.map(s => (
                  <span key={s} className="setup-discoverable-chip">{s}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function SqlProofsWorkspacePanel({ proofGroups }: { proofGroups: any[] }) {
  const proofs = proofGroups.flatMap(group => group?.data?.proofs || [])
  const okProofs = proofs.filter((proof: any) => proof.status === 'ok').length
  const crossSource = proofs.filter((proof: any) => proof.cross_source).length
  const stillLoading = proofGroups.some(group => group?.isLoading)

  return (
    <section className="surface detail-panel">
      <div className="section-title">
        <div>
          <p>SQL Proof Workspace</p>
          <span>Every visible result in Helm is backed by an inspectable Coral SQL proof.</span>
        </div>
        <HelpCircle className="h-5 w-5" />
      </div>
      <div className="workspace-summary-grid">
        <div><p>{stillLoading ? '...' : `${okProofs}/${proofs.length}`}</p><span>proofs ok</span></div>
        <div><p>{stillLoading ? '...' : crossSource}</p><span>cross-source joins</span></div>
        <div><p>{stillLoading ? '...' : proofs.reduce((sum: number, proof: any) => sum + num(proof.row_count), 0)}</p><span>rows returned</span></div>
      </div>
      {stillLoading && !proofs.length ? (
        <div className="ops-skeleton-grid">
          {[1, 2, 3].map(item => <div key={item} className="ops-skeleton shimmer" />)}
        </div>
      ) : proofs.length ? (
        <CoralProofPanel proofs={proofs} title="Workspace SQL proof pack" />
      ) : (
        <EmptyState title="No proofs loaded yet" detail="Open a Helm feature or refresh this workspace to collect Coral query proofs." />
      )}
    </section>
  )
}

function SafeDraftsPanel({ data, error, isLoading }: { data?: any; error?: unknown; isLoading?: boolean }) {
  const actions = data?.actions || []

  return (
    <section className="surface detail-panel">
      <div className="section-title">
        <div>
          <p>Safe Drafts Center</p>
          <span>Human approval stays between Helm intelligence and every external write.</span>
        </div>
        <ShieldCheck className="h-5 w-5" />
      </div>
      {isLoading ? (
        <div className="ops-skeleton-grid">
          {[1, 2].map(item => <div key={item} className="ops-skeleton shimmer" />)}
        </div>
      ) : error ? (
        <EmptyState title="Safe drafts unavailable" detail="The actions endpoint could not return draft recommendations." />
      ) : actions.length ? (
        <div className="action-grid">
          {actions.map((action: any) => (
            <ActionApprovalCard key={action.approval_id || action.title} action={action} />
          ))}
        </div>
      ) : (
        <EmptyState title="No safe drafts queued" detail="Helm will draft, never write, until you approve." />
      )}
      <CoralProofPanel proofs={data?.proofs || []} title="Safe draft source proof" />
    </section>
  )
}


function MTTRPanel({ data, error, isLoading }: { data?: any; error?: unknown; isLoading?: boolean }) {
  const authors: any[] = data?.authors || []
  const services: any[] = data?.services || []
  const summary = data?.summary || {}
  const maxMTTR = Math.max(...authors.map((a: any) => a.avg_minutes_to_error ?? 0), 1)

  return (
    <section className="surface detail-panel mttr-panel">
      <div className="section-title">
        <div>
          <p>MTTR Causal Attribution</p>
          <span>Per-author mean time to production error — live Coral GitHub × Sentry JOIN · no data team required</span>
        </div>
        <span className="section-title-icon">
          <Timer className="h-5 w-5" />
        </span>
      </div>

      <div className="mttr-summary-grid">
        <div className="mttr-summary-card primary">
          <strong>{summary.avg_minutes_to_error != null ? `${summary.avg_minutes_to_error}m` : '—'}</strong>
          <span>avg MTTR across all authors</span>
        </div>
        <div className="mttr-summary-card">
          <strong>{summary.total_authors_with_errors ?? 0}</strong>
          <span>authors with production errors</span>
        </div>
        <div className="mttr-summary-card">
          <strong>{summary.total_pr_error_chains ?? 0}</strong>
          <span>PR → error chains (30d)</span>
        </div>
      </div>

      {summary.worst_author && (
        <div className="mttr-callout">
          <AlertOctagon className="h-4 w-4" />
          <p>
            <strong>{summary.worst_author}</strong> has the fastest path to production errors.
            {summary.safest_author && <> <strong>{summary.safest_author}</strong> is the safest deployer.</>}
          </p>
        </div>
      )}

      <div className="section-title compact mttr-section-gap">
        <div>
          <p>Author Attribution Ranking</p>
          <span>Lowest MTTR = fastest error onset = highest deployment risk</span>
        </div>
      </div>

      {isLoading ? (
        <div className="ops-skeleton-grid">{[1, 2, 3].map(i => <div key={i} className="ops-skeleton shimmer" />)}</div>
      ) : error ? (
        <EmptyState title="MTTR query unavailable" detail="Check that GitHub and Sentry are connected." />
      ) : authors.length ? (
        <div className="mttr-author-list">
          {authors.slice(0, 10).map((author: any) => {
            const pct = author.avg_minutes_to_error != null
              ? Math.max(8, Math.round((author.avg_minutes_to_error / maxMTTR) * 100))
              : 0
            const tone = riskTone(author.risk_level)
            return (
              <div key={author.author} className="mttr-author-row">
                <div className={cx('person-avatar', tone)}>{String(author.author || 'UN').slice(0, 2).toUpperCase()}</div>
                <div className="mttr-author-info">
                  <p>{author.author}</p>
                  <span>{author.total_prs} PRs · {author.total_errors} errors{author.fatal_count > 0 ? ` · ${author.fatal_count} fatal` : ''} · {author.worst_service || 'unknown service'}</span>
                </div>
                <div className="mttr-bar-wrap">
                  <div className="mttr-bar-track">
                    <div className={cx('mttr-bar', tone)} style={{ '--mttr-pct': `${pct}%` } as React.CSSProperties} />
                  </div>
                  <b className="mttr-bar-label">{author.avg_minutes_to_error != null ? `${author.avg_minutes_to_error}m` : '—'}</b>
                </div>
                <span className={cx('state-pill', tone)}>{author.risk_level}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState title="No MTTR data yet" detail="Helm needs GitHub PRs and matching Sentry errors within a 24h window to compute attribution." />
      )}

      {services.length > 0 && (
        <>
          <div className="section-title compact mttr-section-gap">
            <div><p>Service Breakdown</p><span>Which services break fastest after a deployment</span></div>
          </div>
          <div className="mttr-service-grid">
            {services.slice(0, 6).map((svc: any) => (
              <div key={svc.service} className="mttr-service-card">
                <p>{svc.service}</p>
                <strong>{svc.avg_minutes_to_error != null ? `${svc.avg_minutes_to_error}m` : '—'}</strong>
                <span>{svc.total_errors} errors · {svc.affected_author_count} author{svc.affected_author_count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <CoralProofPanel proofs={data?.proofs || []} title="MTTR Attribution SQL proof" />
    </section>
  )
}

function CascadePanel({ data, error, isLoading }: { data?: any; error?: unknown; isLoading?: boolean }) {
  const riskScore: number = data?.risk_score ?? 0
  const riskLevel: string = data?.risk_level ?? 'low'
  const riskLabel: string = data?.risk_label ?? 'MONITORING'
  const signals: any[] = data?.signals || []
  const summary = data?.summary || {}
  const chains: any[] = data?.chains || []

  const gaugeClass = riskLevel === 'critical' ? 'danger' : riskLevel === 'high' ? 'warn' : riskLevel === 'medium' ? 'caution' : 'ok'

  return (
    <section className="surface detail-panel">
      <div className="section-title">
        <div>
          <p>Cascade Early Warning</p>
          <span>GitHub → Sentry → PagerDuty · 24h deploy→error, 4h error→incident · 3-source Coral JOIN · predictive, not reactive</span>
        </div>
        <AlertOctagon className="h-5 w-5" />
      </div>

      {isLoading ? (
        <div className="ops-skeleton-grid">{[1, 2, 3].map(i => <div key={i} className="ops-skeleton shimmer" />)}</div>
      ) : (
        <>
          <div className={cx('cascade-gauge', `cascade-gauge-${gaugeClass}`)}>
            <div className="cascade-score-wrap">
              <div className="cascade-score">{riskScore}</div>
              <div className="cascade-score-label">/ 100</div>
            </div>
            <div className="cascade-label-wrap">
              <p className="cascade-risk-label">{riskLabel}</p>
              <div className="cascade-source-pills">
                {summary.has_github && (
                  <span className="cascade-source-pill">
                    <SourceLogo source="github" className="h-3.5 w-3.5" /> GitHub
                  </span>
                )}
                {summary.has_sentry && (
                  <span className="cascade-source-pill">
                    <SourceLogo source="sentry" className="h-3.5 w-3.5" /> Sentry
                  </span>
                )}
                {summary.has_pagerduty && (
                  <span className="cascade-source-pill">
                    <SourceLogo source="pagerduty" className="h-3.5 w-3.5" /> PagerDuty
                  </span>
                )}
              </div>
              <div className="cascade-stats-row">
                <span>{summary.total_chains ?? 0} chains</span>
                <span>{(summary.affected_services || []).length} service{(summary.affected_services || []).length !== 1 ? 's' : ''}</span>
                <span>{summary.user_impact ?? 0} users affected</span>
              </div>
            </div>
          </div>

          <div className={cx('cascade-recommendation', `cascade-rec-${gaugeClass}`)}>
            <AlertOctagon className="h-4 w-4" />
            <p>{data?.recommendation || 'No recommendation available.'}</p>
          </div>

          {signals.length > 0 && (
            <>
              <div className="section-title compact mttr-section-gap">
                <div><p>Active Signal Chain</p><span>Live cross-source evidence — each hop is a Coral JOIN</span></div>
              </div>
              <div className="cascade-signal-feed">
                {signals.map((sig: any, i: number) => (
                  <div key={i} className={cx('cascade-signal-row', sig.severity === 'fatal' || sig.urgency === 'high' ? 'cascade-signal-critical' : '')}>
                    <span className={cx('source-logo-wrap ok', `source-${sig.source}`)}>
                      <SourceLogo source={sig.source} className="h-4 w-4" />
                    </span>
                    <div className="cascade-signal-body">
                      <p>{sig.label}</p>
                      <span>{sig.detail}</span>
                    </div>
                    <small className="cascade-signal-time">
                      {sig.time ? String(sig.time).slice(0, 16).replace('T', ' ') : ''}
                    </small>
                  </div>
                ))}
              </div>
            </>
          )}

          {chains.length > 0 && (
            <>
              <div className="section-title compact mttr-section-gap">
                <div><p>Detected Chains</p><span>Deploy → error → incident sequences found in the last 7 days</span></div>
              </div>
              <div className="compact-list">
                {chains.slice(0, 4).map((chain: any, i: number) => (
                  <div key={i} className="compact-row release-row">
                    <div>
                      <p>PR #{chain.pr_number}: {chain.pr_title}</p>
                      <span>{chain.author} · {chain.service} · {chain.level} · {chain.error_events} events</span>
                    </div>
                    <b className={chain.incident_id ? 'state-pill danger' : 'state-pill ok'}>
                      {chain.incident_id ? 'incident' : 'error only'}
                    </b>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <CoralProofPanel proofs={data?.proofs || []} title="Cascade detection SQL proof" />
    </section>
  )
}

function RiskScorecardPanel({ data, error, isLoading }: { data?: any; error?: unknown; isLoading?: boolean }) {
  const scorecard: any[] = data?.scorecard || []
  const summary = data?.summary || {}
  const verdict: string = data?.compliance_verdict || '—'
  const [exportState, setExportState] = useState<'idle' | 'copied'>('idle')

  const exportPayload = {
    generated_at: new Date().toISOString(),
    compliance_verdict: verdict,
    summary,
    scorecard,
    proofs: data?.proofs || [],
  }

  async function copyScorecard() {
    await navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2))
    setExportState('copied')
    window.setTimeout(() => setExportState('idle'), 1800)
  }

  function downloadScorecard() {
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `helm-risk-scorecard-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="surface detail-panel">
      <div className="section-title">
        <div>
          <p>Engineering Risk Scorecard</p>
          <span>
            {summary.sources_joined ?? 3}-source compliance audit · causal PR-to-error chains · SOC2-ready · zero ETL
          </span>
        </div>
        <span className="section-title-icon">
          <ClipboardList className="h-5 w-5" />
        </span>
      </div>

      <div className="scorecard-export-bar">
        <div>
          <p>SOC2-ready evidence pack</p>
          <span>Copy or download the live audit trail with SQL proofs attached.</span>
        </div>
        <div>
          <button type="button" onClick={copyScorecard} disabled={!scorecard.length}>
            <Copy className="h-4 w-4" />
            {exportState === 'copied' ? 'Copied' : 'Copy JSON'}
          </button>
          <button type="button" onClick={downloadScorecard} disabled={!scorecard.length}>
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>
      </div>

      <div className="scorecard-summary-row">
        <div className={cx('scorecard-verdict', verdict === 'CLEAN' ? 'scorecard-verdict-ok' : 'scorecard-verdict-warn')}>
          {verdict === 'CLEAN'
            ? <><CheckCircle2 className="h-4 w-4" /> CLEAN</>
            : <><AlertTriangle className="h-4 w-4" /> NEEDS REVIEW</>}
        </div>
        <div className="scorecard-stat">
          <p>{summary.total_changes_analyzed ?? 0}</p><span>changes audited</span>
        </div>
        <div className="scorecard-stat">
          <p>{summary.total_error_chains ?? 0}</p><span>error chains</span>
        </div>
        <div className="scorecard-stat">
          <p>{summary.changes_with_incidents ?? 0}</p><span>incidents triggered</span>
        </div>
        <div className={cx('scorecard-stat', (summary.high_risk_chains ?? 0) > 0 ? 'scorecard-stat-danger' : '')}>
          <p>{summary.high_risk_chains ?? 0}</p><span>high-risk chains</span>
        </div>
      </div>

      {isLoading ? (
        <div className="ops-skeleton-grid">{[1, 2, 3].map(i => <div key={i} className="ops-skeleton shimmer" />)}</div>
      ) : error ? (
        <EmptyState title="Scorecard query unavailable" detail="Check that GitHub, Sentry, and PagerDuty are connected." />
      ) : scorecard.length ? (
        <div className="scorecard-table">
          <div className="scorecard-table-head">
            <span>Change</span>
            <span>Impact</span>
            <span>Compliance flags</span>
            <span>Score</span>
          </div>
          {scorecard.slice(0, 12).map((row: any, i: number) => (
            <div key={`${row.pr_number}-${i}`} className="scorecard-table-row">
              <div className="scorecard-change-col">
                <p>PR #{row.pr_number}: {row.pr_title}</p>
                <span>{row.author} · {String(row.merged_at || '').slice(0, 10)}</span>
              </div>
              <div className="scorecard-impact-col">
                <p className={row.level === 'fatal' ? 'scorecard-fatal' : ''}>{row.level}: {row.error_events ?? 0} events</p>
                <span>{row.users_affected ?? 0} users · {row.service}</span>
                <span>
                  {row.followup_identifier
                    ? `Linear ${row.followup_identifier}: ${row.followup_state || 'open'}`
                    : 'No Linear follow-up linked'}
                </span>
              </div>
              <div className="scorecard-flags">
                {(row.flags || []).map((flag: string) => (
                  <span key={flag} className="scorecard-flag">{flag}</span>
                ))}
                {(!row.flags || row.flags.length === 0) && <span className="scorecard-flag-none">No flags</span>}
              </div>
              <div className={cx('scorecard-score', `scorecard-score-${row.risk_level ?? 'low'}`)}>
                {row.risk_score ?? 0}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No scorecard data yet" detail="Helm needs GitHub PRs with matching Sentry errors to populate the audit trail." />
      )}

      <CoralProofPanel proofs={data?.proofs || []} title="Risk Scorecard SQL proof" />
    </section>
  )
}

function DescribeExtendedStrip() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['describe-extended'],
    queryFn: () => sandboxQuery('DESCRIBE EXTENDED github.pulls', ['github']),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const rows: Record<string, unknown>[] = data?.rows ?? []

  return (
    <div className="describe-extended-strip">
      <div className="desc-ext-header">
        <Terminal className="h-4 w-4" />
        <span>DESCRIBE EXTENDED github.pulls</span>
        <span className="desc-ext-badge">Coral adaptive metadata</span>
      </div>
      {isLoading && (
        <div className="desc-ext-loading"><Loader2 className="h-4 w-4 animate-spin" /> Running live against Coral…</div>
      )}
      {error && (
        <div className="desc-ext-error">Could not fetch adaptive metadata — check that Coral is running and GitHub source is configured.</div>
      )}
      {rows.length > 0 && (
        <div className="desc-ext-table">
          <table>
            <thead>
              <tr>{Object.keys(rows[0]).map(k => <th key={k}>{k}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((v, j) => (
                    <td key={j}>{String(v ?? '—')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!isLoading && !error && rows.length === 0 && (
        <div className="desc-ext-empty">No adaptive metadata yet — run some Helm queries to populate Coral's query history.</div>
      )}
    </div>
  )
}

function ArchitecturePanel() {
  return (
    <section className="architecture-panel">
      <CoralFlowDiagram />

      <section className="vs-mcp-panel">
        <div className="vmp-header">
          <div>
            <div className="vmp-eyebrow">Architecture decision</div>
            <div className="vmp-title">Why Coral instead of MCP tool loops?</div>
          </div>
          <div className="vmp-badge">+31% accuracy · -70% cost · -55% latency</div>
        </div>
        <div className="vmp-table-wrap">
          <table className="vmp-table">
            <thead>
              <tr>
                <th>Scenario</th>
                <th className="vmp-col-bad">Without Coral (MCP loops)</th>
                <th className="vmp-col-good">With Coral SQL</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Cross-source query</td>
                <td className="vmp-bad">29 sequential tool calls</td>
                <td className="vmp-good">1 SQL query (DataFusion)</td>
              </tr>
              <tr>
                <td>Execution time</td>
                <td className="vmp-bad">~230s — often times out</td>
                <td className="vmp-good">~21s end-to-end</td>
              </tr>
              <tr>
                <td>Answer accuracy</td>
                <td className="vmp-bad">Baseline (hallucinated joins)</td>
                <td className="vmp-good">+31% higher (verified rows)</td>
              </tr>
              <tr>
                <td>Token cost</td>
                <td className="vmp-bad">29× tool-call overhead</td>
                <td className="vmp-good">-70% vs direct MCP</td>
              </tr>
              <tr>
                <td>GitHub × Sentry JOIN</td>
                <td className="vmp-bad">Manual Python stitching</td>
                <td className="vmp-good">Native SQL · 1 execution plan</td>
              </tr>
              <tr>
                <td>4-source JOIN</td>
                <td className="vmp-bad">Not feasible (context overflow)</td>
                <td className="vmp-good">GitHub × Sentry × PD × Slack · done</td>
              </tr>
              <tr>
                <td>Audit trail</td>
                <td className="vmp-bad">No — black-box tool calls</td>
                <td className="vmp-good">Full SQL proof · row count · runtime</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="vmp-footer">
          <span className="vmp-source">Source: Coral benchmark — complex cross-source tasks, n=50 queries. Helm uses Coral as the sole data layer; every table in this UI is backed by a verifiable SQL proof.</span>
        </div>
      </section>

      <DescribeExtendedStrip />
      <div className="architecture-notes">
        <div>
          <p>Source-native by design</p>
          <span>Helm asks Coral for live rows from GitHub, Sentry, PagerDuty, Linear, and Slack. The product does not need a warehouse just to answer operational questions.</span>
        </div>
        <div>
          <p>Evidence before synthesis</p>
          <span>AI explanations are grounded in SQL proof: source list, query text, runtime, and returned rows are visible to the operator.</span>
        </div>
        <div>
          <p>Approval-gated remediation</p>
          <span>Repair PRs and outbound updates are treated as controlled actions, not invisible autonomous writes.</span>
        </div>
      </div>
    </section>
  )
}

function FeatureStage({
  active,
  demoMoment,
  engineers,
  services,
  deployments,
  rootCause,
  actions,
  health,
  overview,
  mttr,
  cascade,
  scorecard,
  readiness,
  constellationData,
  circleciHealthData,
  reviewDebtAgingData,
  ticketTrackerData,
  isLiveRefreshing,
  onLiveRefresh,
}: {
  active: NavId
  demoMoment: any
  engineers: any
  services: any
  deployments: any
  rootCause: any
  actions: any
  health: any
  overview: any
  mttr: any
  cascade: any
  scorecard: any
  readiness: any
  constellationData: any
  circleciHealthData: any
  reviewDebtAgingData: any
  ticketTrackerData: any
  isLiveRefreshing: boolean
  onLiveRefresh: () => void | Promise<void>
}) {
  if (active === 'live') {
    return (
      <LiveMonitorPanel
        data={demoMoment.data}
        error={demoMoment.error}
        isLoading={demoMoment.isLoading}
        isFetching={demoMoment.isFetching || isLiveRefreshing}
        updatedAt={demoMoment.dataUpdatedAt}
        onRefresh={onLiveRefresh}
        health={health.data}
      />
    )
  }
  if (active === 'engineers') return <EngineerOpsPanel data={engineers.data} error={engineers.error} isLoading={engineers.isLoading} />
  if (active === 'services') return <ServicesPanel data={services.data} error={services.error} isLoading={services.isLoading} />
  if (active === 'deployments') return <DeploymentPanel data={deployments.data} error={deployments.error} isLoading={deployments.isLoading} />
  if (active === 'rootcause') return <RootCausePanel data={rootCause.data} error={rootCause.error} isLoading={rootCause.isLoading} />
  if (active === 'actions') return <ActionsPanel data={actions.data} error={actions.error} isLoading={actions.isLoading} />
  if (active === 'ask') return <AskHelm />
  if (active === 'mttr') return <MTTRPanel data={mttr.data} error={mttr.error} isLoading={mttr.isLoading} />
  if (active === 'cascade') return <CascadePanel data={cascade.data} error={cascade.error} isLoading={cascade.isLoading} />
  if (active === 'scorecard') return <RiskScorecardPanel data={scorecard.data} error={scorecard.error} isLoading={scorecard.isLoading} />
  if (active === 'architecture') return <ArchitecturePanel />
  if (active === 'sandbox') return <SqlSandbox />
  if (active === 'source-setup') return <SourceSetupPanel health={health.data} error={health.error} isLoading={health.isLoading} readiness={readiness.data} readinessLoading={readiness.isLoading} />
  if (active === 'sql-proofs') return <SqlProofsWorkspacePanel proofGroups={[overview, engineers, services, deployments, rootCause, actions, constellationData, circleciHealthData, reviewDebtAgingData, ticketTrackerData]} />
  if (active === 'teamhealth') return <TeamHealth />
  if (active === 'constellation') return <IncidentConstellation />
  if (active === 'selfheal') return <SelfHealWorkflow />
  if (active === 'deploytrend') return <DeployTrend />
  if (active === 'ticketteams') return <TicketVsErrors />
  if (active === 'releaseattrib') return <ReleaseAttribution />
  if (active === 'prreview') return <PRReviewAgent />
  if (active === 'handover') return <HandoverBrief />
  if (active === 'circleci') return <CircleCIPanel />
  if (active === 'tickettracker') return <TicketThreadTracker />
  if (active === 'reviewdebtaging') return <ReviewDebtAging />
  if (active === 'tokenroi') return <TokenROI />
  if (active === 'lighthouse') return <Lighthouse />
  return null
}

function FeatureBrief({ active, overview, health }: { active: NavId; overview?: any; health?: any }) {
  const meta = getNavMeta(active)
  const connected = health?.sources?.filter((source: any) => source.status === 'ok').length ?? 0
  const sources = health?.sources?.length ?? 5
  const proofCount = overview?.proofs?.length ?? 0

  const stats: Record<NavId, Array<[string, string]>> = {
    live: [
      ['Join rows', '1'],
      ['Sources', 'GitHub + Sentry'],
      ['Proof', 'Live SQL'],
    ],
    dashboard: [],
    engineers: [
      ['Engineers analyzed', String(overview?.engineer_count ?? '...')],
      ['High-risk people', String(overview?.high_risk_engineers ?? 0)],
      ['Sources', 'GitHub · Linear'],
    ],
    services: [
      ['Services unstable', String(overview?.high_risk_services ?? 0)],
      ['Connected sources', `${connected}/${sources}`],
      ['Signal source', 'Sentry + PD'],
    ],
    deployments: [
      ['Window', '30 days'],
      ['Join path', 'GitHub + Sentry'],
      ['Safety', 'Read only'],
    ],
    rootcause: [
      ['Join sources', '4'],
      ['Query shape', 'PR → error → PagerDuty → Slack'],
      ['Output', 'Evidence score'],
    ],
    actions: [
      ['Write status', 'Draft only'],
      ['Approval', 'Required'],
      ['Audit', 'Visible'],
    ],
    ask: [
      ['Retrieval', 'Coral SQL'],
      ['MCP cost gap', '-70% benchmark'],
      ['Proofs', 'Expandable'],
    ],
    mttr: [
      ['Sources', 'GitHub × Sentry'],
      ['Grouped by', 'Author & Service'],
      ['Output', 'Avg min to error'],
    ],
    cascade: [
      ['Window', '24h/4h windows'],
      ['Sources', '3-source JOIN'],
      ['Output', 'Risk score 0–100'],
    ],
    scorecard: [
      ['Audit window', '30 days'],
      ['Sources', String(3) + '–5 joined'],
      ['Output', 'Compliance flags'],
    ],
    architecture: [
      ['Layers', '5'],
      ['Writes', 'Approval gated'],
      ['Proof', 'SQL lineage'],
    ],
    'source-setup': [
      ['Sources ready', `${connected}/${sources}`],
      ['Metadata', 'Live Coral'],
      ['Inputs', 'Checked'],
    ],
    'sql-proofs': [
      ['Proofs', String(proofCount || 'loading')],
      ['Review', 'Inspectable'],
      ['Mode', 'Read only'],
    ],
    sandbox: [
      ['Sources', '1–5 live'],
      ['Mode', 'SELECT only'],
      ['Proof', 'Auto-attached'],
    ],
    teamhealth: [
      ['Sources joined', '3 (GitHub × Linear × Sentry)'],
      ['Signals', 'Off-hours, overdue, error ownership'],
      ['Output', 'Burnout score per engineer'],
    ],
    constellation: [
      ['Sources', '4-source JOIN'],
      ['Output', 'Visual causal graph'],
      ['Drafts', 'Self-healing actions'],
    ],
    selfheal: [
      ['Detection', 'SQL-grounded evidence'],
      ['Approval', 'Required before any action'],
      ['Workflow', 'Detect → Score → Draft → Approve'],
    ],
    deploytrend: [
      ['Sources', 'GitHub × Sentry'],
      ['Window', '6-month aggregate'],
      ['Output', 'Deploy cadence vs error rate'],
    ],
    ticketteams: [
      ['Sources', 'Linear × Sentry'],
      ['Join', 'team_key ↔ project name'],
      ['Output', 'Pressure score per team'],
    ],
    releaseattrib: [
      ['Sources', 'Sentry × GitHub'],
      ['Join', 'release timestamp ↔ PR merge time'],
      ['Output', 'PR per release with error count'],
    ],
    prreview: [
      ['Sources', 'GitHub × Sentry × PagerDuty × Linear'],
      ['Join', 'PR → service errors → incidents → tickets'],
      ['Output', 'Data-backed review comment'],
    ],
    handover: [
      ['Sources joined', '3 (GitHub × Linear × Sentry)'],
      ['Output', 'Structured markdown brief'],
      ['Powered by', 'Coral SQL · Gemini'],
    ],
    circleci: [
      ['Sources', 'GitHub × CircleCI × Sentry'],
      ['Join key', 'commit SHA'],
      ['Output', 'CI coverage + error correlation'],
    ],
    tickettracker: [
      ['Sources', 'Linear × Slack'],
      ['Join', 'ticket ID in message text'],
      ['Output', 'Slack mention count per ticket'],
    ],
    reviewdebtaging: [
      ['Sources', 'GitHub × Sentry'],
      ['Join', 'PR title ILIKE project name'],
      ['Output', 'Open PRs with live error volume'],
    ],
    tokenroi: [
      ['Sources', 'Langfuse × Linear × Sentry'],
      ['Metric', 'Token ROI Score (0–100)'],
      ['Detects', 'Orphan spend · Loop waste · Model mismatch'],
    ],
    lighthouse: [
      ['Sources', 'Adzuna × HackerNews × GitHub'],
      ['Metric', 'ICP fit score (0–100)'],
      ['Output', 'Ranked prospects + generated outreach'],
    ],
  }

  if (active === 'dashboard' || active === 'sandbox' || active === 'architecture') return null

  const panelSources = PANEL_SOURCES[active]
  const isMultiSource = panelSources && panelSources.length >= 2

  // Panels with their own full layouts — show only the Why Coral badge
  const fullLayoutPanels: NavId[] = ['live', 'mttr', 'cascade', 'scorecard', 'teamhealth', 'constellation', 'selfheal', 'deploytrend', 'ticketteams', 'releaseattrib', 'prreview', 'ask', 'handover', 'circleci', 'tickettracker', 'reviewdebtaging', 'tokenroi', 'lighthouse']
  if (fullLayoutPanels.includes(active)) {
    if (!isMultiSource) return null
    return (
      <section className="feature-brief feature-brief-compact" aria-label={`${meta.title} summary`}>
        <WorkflowBadge panelId={active} />
        <CoralImpossibleBadge panelId={active} />
      </section>
    )
  }

  return (
    <section className="feature-brief feature-brief-compact" aria-label={`${meta.title} summary`}>
      <div className="brief-stat-grid">
        {stats[active].map(([label, value]) => {
          const isFlow = value.includes('→') || value.includes('↔') || value.includes('×')
          const isLong = value.length > 22
          return (
            <div key={label} className={`brief-stat${isFlow ? ' brief-stat-flow-card' : ''}${isLong ? ' brief-stat-long' : ''}`}>
              <span className="brief-stat-label">{label}</span>
              <p className="brief-stat-value">{value}</p>
            </div>
          )
        })}
      </div>
      <WorkflowBadge panelId={active} />
      {isMultiSource && <CoralImpossibleBadge panelId={active} />}
    </section>
  )
}

function AutopilotPanel({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string>('')

  async function runAutopilot() {
    setStatus('running')
    setError('')
    try {
      const data = await fetchAutopilot()
      setResult(data)
      setStatus('done')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (err as { message?: string })?.message || 'Unknown error'
      setError(msg)
      setStatus('error')
    }
  }

  async function handleExecute(action: DraftAction) {
    await executeAction({ action_id: action.id, target: action.target, body: action.body })
  }

  const steps: Array<{ id: string; label: string; status: string }> = result?.steps ?? []
  const draftActions: DraftAction[] = result?.draft_actions ?? []

  return (
    <div className="autopilot-overlay" role="dialog" aria-modal="true">
      <div className="autopilot-panel">
        <div className="autopilot-header">
          <div className="autopilot-title">
            <Zap className="h-5 w-5 text-danger" />
            <span>Incident Autopilot</span>
          </div>
          <button type="button" className="autopilot-close" onClick={onClose}>✕</button>
        </div>

        <p className="autopilot-desc">
          Runs the full agent loop: Coral SQL across all 4 sources → evidence chain → draft remediation. One click, zero hallucination.
        </p>

        {status === 'idle' && (
          <button type="button" className="autopilot-run-btn" onClick={runAutopilot}>
            <Zap className="h-4 w-4" /> Run Autopilot Now
          </button>
        )}

        {status === 'running' && (
          <div className="autopilot-running">
            <Loader2 className="h-5 w-5 animate-spin text-coral-400" />
            <span>Running Coral SQL across all sources…</span>
          </div>
        )}

        {status === 'error' && (
          <div className="autopilot-error">
            <XCircle className="h-4 w-4" /> {error}
          </div>
        )}

        {status === 'done' && result && (
          <>
            <div className="autopilot-steps">
              {steps.map((step: any) => (
                <div key={step.id} className={`autopilot-step autopilot-step-${step.status}`}>
                  {step.status === 'done' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-safe" />
                  ) : step.status === 'pending' ? (
                    <Loader2 className="h-3.5 w-3.5 text-warn" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-danger" />
                  )}
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
            <div className="autopilot-meta">
              <span>{result.chain_count} chains · {result.sources_used?.join(' × ')}</span>
              {result.has_pagerduty && <span className="autopilot-badge autopilot-badge-red">PagerDuty incident</span>}
              {result.has_slack && <span className="autopilot-badge autopilot-badge-purple">Slack signal</span>}
              {result.fatal_count > 0 && <span className="autopilot-badge autopilot-badge-red">{result.fatal_count} fatal</span>}
            </div>
            <ApprovalDraftPanel actions={draftActions} onExecute={handleExecute} />
            {result.proofs?.length > 0 && (
              <CoralProofPanel proofs={result.proofs} title="Autopilot SQL proof" />
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const queryClient = useQueryClient()
  const [active, setActive] = useState<NavId>('live')
  const [manualLiveRefreshing, setManualLiveRefreshing] = useState(false)
  const [showAutopilot, setShowAutopilot] = useState(false)

  const isDashboard = active === 'dashboard'
  const isLive = active === 'live'
  const isSqlProofs = active === 'sql-proofs'
  const showDemoMoment = isDashboard || active === 'deployments'
  const demoMoment = useQuery({
    queryKey: ['demo-moment'],
    queryFn: () => fetchDemoMoment(isLive),
    retry: false,
    enabled: isLive || showDemoMoment,
    refetchInterval: isLive ? 5000 : false,
  })
  const overview = useQuery({ queryKey: ['overview'], queryFn: () => fetchOverview(), retry: false, enabled: !isLive, refetchInterval: isLive ? false : 60_000 })
  const health    = useQuery({ queryKey: ['coral-health'],     queryFn: fetchCoralHealth,    staleTime: 60_000, retry: false, enabled: true })
  const readiness = useQuery({ queryKey: ['coral-readiness'], queryFn: fetchCoralReadiness, staleTime: 60_000, retry: false, enabled: true })
  const engineers = useQuery({ queryKey: ['engineers'], queryFn: () => fetchEngineers(), retry: false, enabled: active === 'engineers' || isDashboard || isSqlProofs, refetchInterval: (active === 'engineers' || isDashboard) ? 90_000 : false })
  const services = useQuery({ queryKey: ['services'], queryFn: () => fetchServices(), retry: false, enabled: active === 'services' || isSqlProofs, refetchInterval: active === 'services' ? 90_000 : false })
  const deployments = useQuery({ queryKey: ['deployErrors'], queryFn: () => fetchDeployErrors(), retry: false, enabled: active === 'deployments' || isSqlProofs })
  const rootCause = useQuery({ queryKey: ['rootCause'], queryFn: () => fetchRootCause(), retry: false, enabled: active === 'rootcause' || isDashboard || isSqlProofs })
  const constellation = useQuery({ queryKey: ['constellation'], queryFn: () => fetchConstellation(), retry: false, staleTime: 60_000, enabled: isDashboard || active === 'constellation' || isSqlProofs })
  const actions   = useQuery({ queryKey: ['actions'],   queryFn: fetchActions,         retry: false, enabled: active === 'actions' || isSqlProofs })
  const mttr      = useQuery({ queryKey: ['mttr'],      queryFn: () => fetchMTTRAttribution(), retry: false, staleTime: 0, refetchOnMount: 'always', enabled: active === 'mttr' || isLive })
  const cascade   = useQuery({ queryKey: ['cascade'],   queryFn: () => fetchCascade(),         retry: false, staleTime: 0, refetchOnMount: 'always', enabled: active === 'cascade' })
  const scorecard   = useQuery({ queryKey: ['scorecard'],    queryFn: () => fetchRiskScorecard(),  retry: false, staleTime: 0, refetchOnMount: 'always', enabled: active === 'scorecard' })
  const reviewDebt  = useQuery({ queryKey: ['review-debt'], queryFn: () => fetchReviewDebt(),    retry: false, staleTime: 0, refetchOnMount: 'always', enabled: isDashboard })
  const circleciHealth  = useQuery({ queryKey: ['circleci-health'],       queryFn: () => fetchCircleCIHealth(),       retry: false, staleTime: 5 * 60_000, enabled: active === 'circleci' || isSqlProofs })
  const reviewDebtAging = useQuery({ queryKey: ['review-debt-aging'],     queryFn: () => fetchReviewDebtAging(),      retry: false, staleTime: 5 * 60_000, enabled: active === 'reviewdebtaging' || isSqlProofs })
  const ticketTracker   = useQuery({ queryKey: ['ticket-thread-tracker'], queryFn: () => fetchTicketThreadTracker(),  retry: false, staleTime: 5 * 60_000, enabled: active === 'tickettracker' || isSqlProofs })

  async function refreshLiveMoment() {
    setManualLiveRefreshing(true)
    try {
      const fresh = await fetchDemoMoment(true)
      queryClient.setQueryData(['demo-moment'], fresh)
    } finally {
      setManualLiveRefreshing(false)
    }
  }

  const overviewData = overview.data
  const activeMeta = getNavMeta(active)
  const score = num(overviewData?.health_score, 0)
  const connectedSources = health.data?.sources?.filter((source: any) => source.status === 'ok').length ?? 0
  const totalSources = health.data?.sources?.length ?? 5
  const serviceIssue = overviewData?.proofs?.some((proof: any) => proof.name === 'Service instability' && proof.status === 'error')
  const overviewDetail = overview.isError
    ? 'Overview query needs retry'
    : overviewData?.burnout_risk
      ? `${overviewData.burnout_risk} burnout risk`
      : 'Syncing overview'

  const proofBadge = (() => {
    const allProofs = [
      ...(overviewData?.proofs || []),
      ...(demoMoment.data?.proofs || []),
      ...(engineers.data?.proofs || []),
      ...(services.data?.proofs || []),
      ...(deployments.data?.proofs || []),
      ...(rootCause.data?.proofs || []),
      ...(actions.data?.proofs || []),
      ...(constellation.data?.proofs || []),
      ...(circleciHealth.data?.proofs || []),
      ...(reviewDebtAging.data?.proofs || []),
      ...(ticketTracker.data?.proofs || []),
    ]
    // Real MCP savings: for each successful proof, calculate how many sequential
    // provider MCP tool calls Coral replaced.
    // Formula: (sources * 3 base calls) + cross-source join overhead ((sources-1) * 4)
    // Benchmarked basis: Coral docs April 2026 — complex 4-source query: 14 MCP calls → 1 SQL
    const mcpSaved = allProofs.reduce((sum: number, p: any) => {
      if (!p || p.status !== 'ok') return sum
      const sourceCount = (p.sources?.length) || 0
      if (sourceCount === 0) return sum
      const baseCalls = sourceCount * 3
      const joinOverhead = p.cross_source ? (sourceCount - 1) * 4 : 0
      return sum + baseCalls + joinOverhead
    }, 0)
    return {
      queries: allProofs.length,
      crossSource: allProofs.filter((p: any) => p.cross_source).length,
      totalRows: allProofs.reduce((sum: number, p: any) => sum + (num(p.row_count)), 0),
      mcpSaved,
    }
  })()

  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={setActive} readiness={readiness.data} />
      <main className="dashboard">
        <Topbar active={active} setActive={setActive} proofBadge={proofBadge} />
        <section className="hero-row">
          <div>
            <p className="eyebrow">{activeMeta.eyebrow}</p>
            <h1>{activeMeta.title}</h1>
            <span>{activeMeta.description}</span>
          </div>
          <div className="hero-actions">
            <button type="button" className="primary-btn" onClick={() => setActive('ask')}><Plus className="h-4 w-4" /> Ask Helm</button>
            <button type="button" className="soft-btn" onClick={() => setActive('rootcause')}>Investigate Signal</button>
          </div>
        </section>

        {showAutopilot && <AutopilotPanel onClose={() => setShowAutopilot(false)} />}

        {isDashboard && (
          <div className="mission-control-page">
            <section className="mc-command-center">
              <div className="mc-command-main">
                <div className="mc-section-head">
                  <div>
                    <span className="mc-section-kicker">Live command graph</span>
                    <h2>Incident causality, source health, and AI-safe actions in one view</h2>
                  </div>
                  <button type="button" className="mc-compact-action" onClick={() => setActive('rootcause')}>
                    Open Graph <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <ConstellationHero
                  data={constellation.data}
                  isLoading={constellation.isLoading}
                  onViewFull={() => setActive('rootcause')}
                />
              </div>

              <aside className="mc-command-rail">
                <div className="mc-rail-card mc-rail-autopilot">
                  <span className="mc-rail-eyebrow">Human-gated remediation</span>
                  <p>Incident Autopilot</p>
                  <small>Detect chains, score evidence, draft Slack, Linear, and GitHub actions, then wait for approval.</small>
                  <button type="button" onClick={() => setShowAutopilot(true)}>
                    <Zap className="h-4 w-4" /> Launch Autopilot
                  </button>
                </div>

                <div className="mc-rail-split">
                  <button type="button" className="mc-rail-link" onClick={() => setActive('live')}>
                    <Activity className="h-4 w-4" />
                    <span>
                      <b>Live Monitor</b>
                      <small>GitHub x Sentry join</small>
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="mc-rail-link" onClick={() => setActive('sandbox')}>
                    <Terminal className="h-4 w-4" />
                    <span>
                      <b>SQL Sandbox</b>
                      <small>Run a federated query</small>
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mc-rail-status">
                  <span>Readiness</span>
                  <strong>{health.data ? `${connectedSources}/${totalSources}` : 'Syncing'}</strong>
                  <small>{overviewDetail}</small>
                </div>
              </aside>
            </section>

            <section className="mc-stats-bar">
              <div className="mc-stat-item mc-stat-accent">
                <span className="mc-stat-num">{constellation.data?.chain_count ?? (constellation.isLoading ? '…' : '—')}</span>
                <div className="mc-stat-info">
                  <span className="mc-stat-name">Incident chains</span>
                  <span className="mc-stat-src">4-source JOIN · 30d</span>
                </div>
              </div>
              <div className="mc-stat-item">
                <span className="mc-stat-num">{health.data ? `${connectedSources}/${totalSources}` : '…'}</span>
                <div className="mc-stat-info">
                  <span className="mc-stat-name">Sources online</span>
                  <span className="mc-stat-src">Coral providers</span>
                </div>
              </div>
              <div className="mc-stat-item">
                <span className="mc-stat-num">{overviewData?.recent_pr_count ?? (overview.isLoading ? '…' : '—')}</span>
                <div className="mc-stat-info">
                  <span className="mc-stat-name">PRs analyzed</span>
                  <span className="mc-stat-src">GitHub · 30d</span>
                </div>
              </div>
              <div className="mc-stat-item">
                <span className="mc-stat-num">{overviewData?.mttr_minutes != null ? `${overviewData.mttr_minutes}m` : '—'}</span>
                <div className="mc-stat-info">
                  <span className="mc-stat-name">Avg MTTR</span>
                  <span className="mc-stat-src">PagerDuty</span>
                </div>
              </div>
              <div className="mc-stat-divider" />
              <SourceHealthStrip health={health.data} />
            </section>

            <section className="mc-action-cards">
              <button type="button" className="mc-action-card mc-card-pr" onClick={() => setActive('prreview')}>
                <div className="mc-action-eyebrow">PR Review Agent</div>
                <div className="mc-action-headline">Review any PR with live incident context</div>
                <div className="mc-action-detail">Paste a URL — agent joins GitHub, Sentry, PagerDuty & Linear in one Coral query and posts an evidence-backed review directly to the PR.</div>
                <div className="mc-action-footer">
                  <span className="mc-action-tag">GitHub × Sentry × PD × Linear</span>
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </button>
              <button type="button" className="mc-action-card mc-card-root" onClick={() => setActive('rootcause')}>
                <div className="mc-action-eyebrow">Root Cause</div>
                <div className="mc-action-headline">Trace the full incident causality chain</div>
                <div className="mc-action-detail">GitHub PR → Sentry error → PagerDuty incident → Slack war-room, all joined in one DataFusion execution plan with SQL proof attached.</div>
                <div className="mc-action-footer">
                  <span className="mc-action-tag">4-source JOIN · evidence_score</span>
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </button>
              <button type="button" className="mc-action-card mc-card-ask" onClick={() => setActive('ask')}>
                <div className="mc-action-eyebrow">Ask Helm</div>
                <div className="mc-action-headline">Ask any engineering question in plain English</div>
                <div className="mc-action-detail">Natural language resolves to optimized Coral SQL across all live sources. No API loops, no hallucinated rows — every answer carries a SQL proof.</div>
                <div className="mc-action-footer">
                  <span className="mc-action-tag">NL → Coral SQL → proof</span>
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </button>
              <button type="button" className="mc-action-card mc-card-handover" onClick={() => setActive('handover')}>
                <div className="mc-action-eyebrow">Handover Brief</div>
                <div className="mc-action-headline">Generate a developer knowledge handover in seconds</div>
                <div className="mc-action-detail">Enter a GitHub username — Helm queries PR history, open Linear tickets, and Sentry error ownership, then synthesises a complete markdown brief.</div>
                <div className="mc-action-footer">
                  <span className="mc-action-tag">GitHub × Linear × Sentry · 3-source</span>
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </button>
              <button type="button" className="mc-action-card mc-card-circleci" onClick={() => setActive('circleci')}>
                <div className="mc-action-eyebrow">CI Health</div>
                <div className="mc-action-headline">PRs that passed CI but still broke production</div>
                <div className="mc-action-detail">The only insight that requires three live APIs at once: GitHub merge history, CircleCI pipeline coverage, and Sentry error first_seen — joined on commit SHA in one Coral SQL plan.</div>
                <div className="mc-action-footer">
                  <span className="mc-action-tag">GitHub × CircleCI × Sentry · 3-source</span>
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </button>
            </section>

            <CoralExplainerPanel />

            <section className="whiplash-banner">
              <div className="wb-header">
                <AlertTriangle className="wb-icon" />
                <div>
                  <div className="wb-title">AI coding acceleration is outpacing incident response</div>
                  <div className="wb-sub">Your team ships faster with AI assist — and breaks more. The signal is in the data.</div>
                </div>
              </div>
              <div className="wb-stats">
                <div className="wb-stat">
                  <span className="wb-stat-num wb-stat-red">+242.7%</span>
                  <span className="wb-stat-label">incidents per PR<br/>since AI coding adoption</span>
                </div>
                <div className="wb-stat-div" />
                <div className="wb-stat">
                  <span className="wb-stat-num wb-stat-amber">4×</span>
                  <span className="wb-stat-label">faster merge velocity<br/>same team, more risk</span>
                </div>
                <div className="wb-stat-div" />
                <div className="wb-stat">
                  <span className="wb-stat-num wb-stat-green">1 SQL</span>
                  <span className="wb-stat-label">Coral query traces<br/>every PR to every incident</span>
                </div>
              </div>
              <div className="wb-footer">
                <span className="wb-footnote">HELM traces every merged PR to downstream Sentry errors and PagerDuty incidents via Coral SQL — no manual correlation, no guesswork.</span>
                <button type="button" className="wb-cta" onClick={() => setActive('scorecard')}>View Risk Scorecard <ArrowUpRight className="h-3.5 w-3.5" /></button>
              </div>
            </section>

            <section className="rd-widget">
              <div className="rd-header">
                <AlertTriangle className="h-4 w-4 rd-header-icon" />
                <div className="rd-header-copy">
                  <p>Review Debt Alert</p>
                  <span>Unreviewed or self-merged PRs that triggered Sentry errors · GitHub × Sentry</span>
                </div>
                <div className="rd-drill-group">
                  <button type="button" className="rd-drill" onClick={() => setActive('reviewdebtaging')}>
                    Open PRs stalled <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="rd-drill rd-drill-muted" onClick={() => setActive('scorecard')}>
                    Scorecard <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="rd-stats">
                <div className="rd-stat">
                  <span className={`rd-num ${(reviewDebt.data?.total_prs_with_debt ?? 0) > 0 ? 'rd-num-red' : 'rd-num-ok'}`}>
                    {reviewDebt.isLoading ? '…' : (reviewDebt.data?.total_prs_with_debt ?? '—')}
                  </span>
                  <span className="rd-label">PRs with review debt</span>
                </div>
                <div className="rd-div" />
                <div className="rd-stat">
                  <span className={`rd-num ${(reviewDebt.data?.self_merged_count ?? 0) > 0 ? 'rd-num-amber' : 'rd-num-ok'}`}>
                    {reviewDebt.isLoading ? '…' : (reviewDebt.data?.self_merged_count ?? '—')}
                  </span>
                  <span className="rd-label">self-merged to production</span>
                </div>
                <div className="rd-div" />
                <div className="rd-stat">
                  <span className={`rd-num ${(reviewDebt.data?.no_review_count ?? 0) > 0 ? 'rd-num-amber' : 'rd-num-ok'}`}>
                    {reviewDebt.isLoading ? '…' : (reviewDebt.data?.no_review_count ?? '—')}
                  </span>
                  <span className="rd-label">merged with 0 reviews</span>
                </div>
                <div className="rd-div" />
                <div className="rd-stat">
                  <span className="rd-num">
                    {reviewDebt.isLoading ? '…' : (reviewDebt.data?.total_error_events ?? '—')}
                  </span>
                  <span className="rd-label">Sentry events attributed</span>
                </div>
              </div>
              {reviewDebt.data?.top_offender && (
                <div className="rd-offender">
                  <span>Top offender:</span>
                  <b>PR #{reviewDebt.data.top_offender.pr_number}</b>
                  <span className="rd-offender-title">{reviewDebt.data.top_offender.pr_title}</span>
                  <span className={`rd-type-badge rd-type-${String(reviewDebt.data.top_offender.debt_type || '').replace('-', '')}`}>
                    {reviewDebt.data.top_offender.debt_type}
                  </span>
                </div>
              )}
              {reviewDebt.error && (
                <div className="rd-error">
                  <XCircle className="h-3.5 w-3.5" />
                  <span>Review debt query needs GitHub + Sentry access</span>
                </div>
              )}
            </section>

          </div>
        )}

        {!isDashboard && (
          <>
            <FeatureBrief active={active} overview={overviewData} health={health.data} />
            <section className="feature-stage">
              <FeatureStage
                active={active}
                demoMoment={demoMoment}
                engineers={engineers}
                services={services}
                deployments={deployments}
                rootCause={rootCause}
                actions={actions}
                health={health}
                overview={overview}
                mttr={mttr}
                cascade={cascade}
                scorecard={scorecard}
                readiness={readiness}
                constellationData={constellation}
                circleciHealthData={circleciHealth}
                reviewDebtAgingData={reviewDebtAging}
                ticketTrackerData={ticketTracker}
                isLiveRefreshing={manualLiveRefreshing}
                onLiveRefresh={refreshLiveMoment}
              />
            </section>
          </>
        )}
      </main>
    </div>
  )
}
