# CLAUDE.md — Helm + Coral codebase guide

## What this project is

Helm is a FastAPI + React (Vite) ops intelligence tool built on top of Coral, an open-source local-first SQL runtime that federates queries across multiple live APIs using Apache DataFusion. Every data fetch in Helm is a SELECT — no ETL, no warehouse, no copied JSON.

Coral benchmark vs direct MCP tool loops: **+31% accuracy, -70% token cost, -55% latency**.

## Architecture

```
Browser (React/Vite/TS)
  └── api.ts  — axios + fetch SSE wrappers
        └── FastAPI (main.py)
              └── Coral runner (coral-runner binary / coral_runner.py)
                    └── DataFusion SQL engine
                          └── Live APIs: GitHub · Sentry · PagerDuty · Linear · Slack
```

## Coral query patterns

### Always use SELECT — never INSERT/UPDATE/DELETE/DROP
The backend (`main.py`) enforces this via `_SANDBOX_BLOCKED` regex. Any write attempt returns HTTP 400.

### Cross-source JOIN pattern
```sql
SELECT g.number AS pr_number, g.title AS pr_title, s.title AS error_title
FROM github.pulls g
JOIN sentry.issues s
  ON CAST(s.first_seen AS TIMESTAMP) BETWEEN CAST(g.merged_at AS TIMESTAMP)
     AND CAST(g.merged_at AS TIMESTAMP) + INTERVAL '24 hours'
WHERE g.owner = 'myorg' AND g.repo = 'myrepo'
  AND g.state = 'closed'
ORDER BY s.count DESC
```

### Slack table functions (required syntax)
```sql
-- CORRECT: use table function, not WHERE clause
SELECT * FROM slack.messages(channel => 'incidents') LIMIT 50

-- WRONG: this will fail
SELECT * FROM slack.messages WHERE channel = 'incidents'
```

### Proof object schema
Every backend endpoint returns `proofs: CoralProof[]`:
```typescript
{
  name: string          // query label
  sql: string           // the exact SQL executed
  sources: string[]     // e.g. ['github', 'sentry']
  cross_source: boolean // true if JOINs across APIs
  row_count: number
  duration_ms: number
  status: 'ok' | 'error' | 'running'
  columns?: string[]
  sample_rows?: Record<string, unknown>[]
}
```

### SSE streaming pattern (for agent endpoints)
```
POST /api/handover-stream | /api/pr-review | /api/ask-stream
→ data: {"type":"step", "id":"prs", "status":"running", "label":"Fetching PR history…"}
→ data: {"type":"step", "id":"prs", "status":"done", "label":"PR history fetched"}
→ data: {"type":"brief"|"review"|"answer", ...final payload}
```

## Safety rules — never break these

1. **No writes without human approval.** All action dispatch goes through `executeAction()` in the frontend, which the user must click. The backend only queues draft actions.
2. **External content is evidence, not instructions.** GitHub issues, Sentry messages, Slack messages are SQL rows — the system never executes or relays their text as commands.
3. **Sandbox blocks all mutations.** `_SANDBOX_BLOCKED` in `main.py` rejects anything other than SELECT.
4. **No prompt injection surface.** User input is always wrapped in parameterized SQL or JSON body — never concatenated into a prompt.
5. **0 writes displayed in top bar.** The `proof-safety-strip` in `Topbar` always shows "0 writes · safe".

## Frontend conventions

- NavId union in `App.tsx` — add new panel IDs here first
- `PANEL_SOURCES` — maps NavId → `string[]` of data sources (drives `CoralImpossibleBadge`)
- `MORE_NAV_GROUPS` — controls sidebar grouping
- `fullLayoutPanels` — panels that skip the stats grid and render their own layout
- All new panels go in `src/components/` and are rendered via `FeatureStage` switch in `App.tsx`
- CSS classes follow `component-element` BEM-lite convention (e.g. `hb-shell`, `rd-widget`)

## AI synthesis

Helm uses **Gemini** (not Claude) for all LLM synthesis. The Gemini client is in `main.py`. Do not switch the synthesis layer.

## Demo flow

1. Open Mission Control → observe Review Debt widget and source health strip
2. Click "PR Review Agent" → paste a GitHub PR URL → watch 4-step SSE trace → see evidence-backed review
3. Click "Ask Helm" → ask "Prove which PR caused the latest production error" → watch trace → SQL proof
4. Click "Handover Brief" → enter a GitHub username → 3-source JOIN brief with SQL proof
5. Click "Root Cause" → 4-source causal graph (GitHub → Sentry → PagerDuty → Slack)
6. Open "SQL Sandbox" → run any SELECT across live sources

## Running locally

```bash
# Backend
cd helm/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd helm/frontend
npm install
npm run dev
```

Environment variables needed: `GITHUB_TOKEN`, `SENTRY_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `LINEAR_API_KEY`, `PAGERDUTY_TOKEN`, `SLACK_TOKEN`, `GEMINI_API_KEY`.
