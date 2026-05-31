import { SiGithub, SiSentry, SiSlack, SiCircleci } from 'react-icons/si'
import {
  Activity,
  Bot,
  ClipboardCheck,
  DatabaseZap,
  FileCheck2,
  GitMerge,
  LayoutDashboard,
  Network,
  Search,
  ShieldCheck,
  Cpu,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
  GitPullRequest,
  Flame,
} from 'lucide-react'

const SOURCES = [
  { key: 'github', label: 'GitHub', sub: 'pulls · commits · reviews', Icon: SiGithub },
  { key: 'sentry', label: 'Sentry', sub: 'issues · events · releases', Icon: SiSentry },
  { key: 'pagerduty', label: 'PagerDuty', sub: 'incidents · response time', Icon: Zap },
  { key: 'linear', label: 'Linear', sub: 'issues · owners · cycles', Icon: GitMerge },
  { key: 'slack', label: 'Slack', sub: 'messages · incident chatter', Icon: SiSlack },
  { key: 'circleci', label: 'CircleCI', sub: 'pipelines · workflow metrics', Icon: SiCircleci },
  { key: 'langfuse', label: 'Langfuse', sub: 'LLM traces · token costs · generations', Icon: Cpu },
  { key: 'adzuna', label: 'Adzuna', sub: 'job listings · talent demand', Icon: Users },
  { key: 'hackernews', label: 'HackerNews', sub: 'live complain feeds', Icon: Flame },
]

const SIGNALS = [
  { label: 'PR → error causality', Icon: GitMerge },
  { label: 'MTTR attribution', Icon: Timer },
  { label: 'CI coverage gap', Icon: GitPullRequest },
  { label: 'Burnout risk', Icon: Flame },
  { label: 'Workload pressure', Icon: Users },
  { label: 'Compliance flags', Icon: ClipboardCheck },
  { label: 'AI spend attribution', Icon: Cpu },
  { label: 'Runaway agent loops', Icon: Timer },
  { label: 'GTM prospect scoring', Icon: Search },
]

const WORKFLOWS = [
  { label: 'Live Monitor', Icon: Activity, accent: true },
  { label: 'Root Cause', Icon: Search, accent: false },
  { label: 'Risk Scorecard', Icon: FileCheck2, accent: false },
  { label: 'Self-Healing', Icon: ShieldCheck, accent: false },
  { label: 'PR Review Agent', Icon: GitPullRequest, accent: false },
  { label: 'SQL Sandbox', Icon: DatabaseZap, accent: false },
  { label: 'Ask Helm', Icon: Bot, accent: false },
  { label: 'Token ROI', Icon: Cpu, accent: true },
  { label: 'Lighthouse', Icon: Search, accent: true },
]

function FlowConnector({ label }: { label: string }) {
  return (
    <div className="flow-connector" aria-hidden="true">
      <span>{label}</span>
      <i />
    </div>
  )
}

export default function CoralFlowDiagram() {
  return (
    <section className="flow-diagram" aria-label="How Helm Works">
      <div className="flow-head">
        <div>
          <p className="eyebrow">Product architecture</p>
          <h2>How Helm Works</h2>
          <span>
            Helm turns live operational systems into source-native SQL evidence, scores the signal,
            explains it with AI, and keeps every remediation action approval-gated.
          </span>
        </div>
        <div className="flow-head-badge">
          <DatabaseZap className="h-4 w-4" />
          Coral SQL control plane
        </div>
      </div>

      <div className="flow-main flow-main-product">
        <div className="flow-stage flow-stage-sources">
          <p className="flow-col-label">Live operational sources</p>
          <div className="flow-sources">
            {SOURCES.map(source => {
              const Icon = source.Icon as any
              return (
                <div key={source.key} className={`flow-source source-${source.key}`}>
                  <span className={`source-logo-wrap source-${source.key}`}>
                    <Icon size={15} />
                  </span>
                  <div>
                    <p>{source.label}</p>
                    <span>{source.sub}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <FlowConnector label="Source tables" />

        <div className="flow-stage flow-stage-query">
          <p className="flow-col-label">Federated query layer</p>
          <div className="flow-core-card flow-coral-box">
            <DatabaseZap className="h-8 w-8" />
            <p>Coral SQL</p>
            <span>One read-only plan across live SaaS APIs</span>
            <code>{'github.pulls g\nJOIN sentry.issues s ON s.project = g.repo\nLEFT JOIN circleci.pipelines c ON c.vcs_revision = g.head__sha\nLEFT JOIN langfuse.traces t ON t.metadata__linear_id = li.identifier\nLEFT JOIN adzuna.search_jobs aj ON aj.title = \'data engineer\'\nLEFT JOIN hackernews.search hn ON hn.query = aj.company'}</code>
            <div className="flow-coral-badge">No ETL · no copied warehouse · live proofs</div>
          </div>
        </div>

        <FlowConnector label="Evidence rows" />

        <div className="flow-stage flow-stage-intel">
          <p className="flow-col-label">Evidence intelligence</p>
          <div className="flow-signal-grid">
            {SIGNALS.map(signal => {
              const Icon = signal.Icon
              return (
                <div key={signal.label} className="flow-signal-card">
                  <Icon className="h-4 w-4" />
                  <span>{signal.label}</span>
                </div>
              )
            })}
          </div>
          <div className="flow-agent-card">
            <Network className="h-6 w-6" />
            <div>
              <p>Helm reasoning layer</p>
              <span>Scores risk, ranks impact, and asks Gemini to synthesize only after SQL proof exists.</span>
            </div>
          </div>
        </div>

        <FlowConnector label="Actions" />

        <div className="flow-stage flow-stage-workflows">
          <p className="flow-col-label">Product workflows</p>
          <div className="flow-outputs">
            {WORKFLOWS.map(workflow => {
              const Icon = workflow.Icon
              return (
                <div key={workflow.label} className={`flow-output${workflow.accent ? ' flow-output-ai' : ''}`}>
                  <Icon className="h-4 w-4" />
                  <p>{workflow.label}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flow-approval-lane">
        <div className="flow-approval-node">
          <ShieldCheck className="h-5 w-5" />
          <div>
            <p>Read-safe by default</p>
            <span>Helm queries providers through Coral. Writes are generated as drafts until a human approves them.</span>
          </div>
        </div>
        <div className="flow-approval-line" />
        <div className="flow-approval-node">
          <Sparkles className="h-5 w-5" />
          <div>
            <p>Approval queue</p>
            <span>Repair PRs, Slack updates, Linear follow-ups, and incident notes remain reviewable before execution.</span>
          </div>
        </div>
        <div className="flow-approval-line" />
        <div className="flow-approval-node">
          <LayoutDashboard className="h-5 w-5" />
          <div>
            <p>Auditable output</p>
            <span>Every answer can show source list, SQL text, row count, runtime, and proof status.</span>
          </div>
        </div>
      </div>

      <div className="flow-footer">
        <span><DatabaseZap className="h-3.5 w-3.5" /> Live joins over operational systems</span>
        <span><ShieldCheck className="h-3.5 w-3.5" /> Human approval before provider writes</span>
        <span><FileCheck2 className="h-3.5 w-3.5" /> SQL proof attached to every critical claim</span>
      </div>
      <div className="flow-benchmark">
        <span className="flow-bm-label">Compared with direct API tool loops:</span>
        <span className="flow-bm-up"><TrendingUp className="h-3.5 w-3.5" /> +31% accuracy</span>
        <span className="flow-bm-dn"><TrendingDown className="h-3.5 w-3.5" /> -70% token cost</span>
        <span className="flow-bm-dn"><TrendingDown className="h-3.5 w-3.5" /> -55% latency</span>
      </div>
    </section>
  )
}
