import { Zap, XCircle, CheckCircle } from 'lucide-react'

const BENCHMARK = {
  mcp: { calls: 14, tokens: 313000, latencyS: 99 },
  coral: { calls: 1, tokens: 112000, latencyS: 21 },
}

const tokenSavingPct = Math.round(
  (1 - BENCHMARK.coral.tokens / BENCHMARK.mcp.tokens) * 100
)
const latencySavingPct = Math.round(
  (1 - BENCHMARK.coral.latencyS / BENCHMARK.mcp.latencyS) * 100
)

export default function CoralExplainerPanel() {
  return (
    <section className="coral-explainer">
      <div className="coral-explainer-header">
        <Zap className="h-4 w-4 coral-explainer-zap" />
        <h3>Why Coral beats standard MCP tool loops</h3>
        <span className="coral-explainer-source">
          Benchmark: April 2026, n=51 complex tasks, Claude Opus 4.6
        </span>
      </div>

      <div className="coral-explainer-grid">
        {/* ── Left: Traditional MCP ── */}
        <div className="coral-explainer-col coral-explainer-bad">
          <div className="coral-explainer-col-header">
            <XCircle className="h-4 w-4" />
            <span>Traditional MCP tool loop</span>
          </div>
          <ul className="coral-explainer-list">
            <li>
              <span className="coral-explainer-label">API calls</span>
              <span className="coral-explainer-val bad">{BENCHMARK.mcp.calls} sequential</span>
            </li>
            <li>
              <span className="coral-explainer-label">Token cost</span>
              <span className="coral-explainer-val bad">{(BENCHMARK.mcp.tokens / 1000).toFixed(0)}k tokens</span>
            </li>
            <li>
              <span className="coral-explainer-label">Latency</span>
              <span className="coral-explainer-val bad">{BENCHMARK.mcp.latencyS}s median</span>
            </li>
            <li>
              <span className="coral-explainer-label">Join logic</span>
              <span className="coral-explainer-val bad">Python-side stitching</span>
            </li>
            <li>
              <span className="coral-explainer-label">Pagination</span>
              <span className="coral-explainer-val bad">Client-side loops per source</span>
            </li>
          </ul>
          <div className="coral-explainer-detail">
            GET /repos/../pulls → GET /issues (N pages) → GET /incidents (N pages) → GET /conversations.history + 8 follow-up calls for pagination
          </div>
        </div>

        {/* ── Right: Coral SQL ── */}
        <div className="coral-explainer-col coral-explainer-good">
          <div className="coral-explainer-col-header">
            <CheckCircle className="h-4 w-4" />
            <span>Coral federated SQL</span>
          </div>
          <ul className="coral-explainer-list">
            <li>
              <span className="coral-explainer-label">API calls</span>
              <span className="coral-explainer-val good">{BENCHMARK.coral.calls} SQL query</span>
            </li>
            <li>
              <span className="coral-explainer-label">Token cost</span>
              <span className="coral-explainer-val good">
                {(BENCHMARK.coral.tokens / 1000).toFixed(0)}k tokens
                <span className="coral-explainer-delta">-{tokenSavingPct}%</span>
              </span>
            </li>
            <li>
              <span className="coral-explainer-label">Latency</span>
              <span className="coral-explainer-val good">
                {BENCHMARK.coral.latencyS}s median
                <span className="coral-explainer-delta">-{latencySavingPct}%</span>
              </span>
            </li>
            <li>
              <span className="coral-explainer-label">Join logic</span>
              <span className="coral-explainer-val good">Apache DataFusion (Rust)</span>
            </li>
            <li>
              <span className="coral-explainer-label">Pagination</span>
              <span className="coral-explainer-val good">Pushed to Coral runtime</span>
            </li>
          </ul>
          <div className="coral-explainer-detail good">
            1 SQL query executes across GitHub × Sentry × PagerDuty × Slack in one DataFusion plan — aggregation, filtering, and joins resolved locally
          </div>
        </div>
      </div>

      {/* ── Accuracy callout ── */}
      <div className="coral-explainer-accuracy">
        <span className="coral-explainer-accuracy-num">+31%</span>
        <span className="coral-explainer-accuracy-label">accuracy on complex multi-source tasks</span>
        <span className="coral-explainer-accuracy-sep">·</span>
        <span className="coral-explainer-accuracy-num">-70%</span>
        <span className="coral-explainer-accuracy-label">token cost</span>
        <span className="coral-explainer-accuracy-sep">·</span>
        <span className="coral-explainer-accuracy-num">-55%</span>
        <span className="coral-explainer-accuracy-label">latency</span>
        <span className="coral-explainer-accuracy-note">vs direct provider MCP servers</span>
      </div>
    </section>
  )
}
