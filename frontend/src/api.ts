import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 90_000,
})

function meta(durationMs: number) {
  const fast = durationMs < 250
  return {
    durationMs,
    mode: fast ? 'Coral Cache' : 'Live API',
    description: fast
      ? 'Fast repeat path; Coral may have served source data from local cache.'
      : 'Live Coral query path across provider APIs.',
  }
}

function withRefresh(path: string, refresh = false) {
  if (!refresh) return path
  return `${path}${path.includes('?') ? '&' : '?'}refresh=true`
}

async function getWithMeta(path: string) {
  const start = performance.now()
  const response = await api.get(path)
  const durationMs = Math.max(1, Math.round(performance.now() - start))
  return { ...response.data, __coralMeta: meta(durationMs) }
}

export const fetchOverview    = (refresh = false) => getWithMeta(withRefresh('/overview', refresh))
export const fetchEngineers   = (refresh = false) => getWithMeta(withRefresh('/engineers', refresh))
export const fetchServices    = (refresh = false) => getWithMeta(withRefresh('/services', refresh))
export const fetchDeployErrors= (refresh = false) => getWithMeta(withRefresh('/deployment-errors', refresh))
export const fetchDemoMoment  = (refresh = false) => getWithMeta(withRefresh('/demo-moment', refresh))
export const fetchRootCause   = (refresh = false) => getWithMeta(withRefresh('/root-cause', refresh))
export const fetchCoralHealth    = () => getWithMeta('/coral/health')
export const fetchCoralReadiness = () => getWithMeta('/coral/readiness')
export const fetchActions = () => getWithMeta('/actions')
export const askHelm = (question: string) =>
  api.post('/ask', { question }).then(r => r.data)
export const runGuidedDemo = (mode: 'replay' | 'live' = 'replay') =>
  api.post(`/run-demo?mode=${mode}`).then(r => r.data)

export const fetchMTTRAttribution  = (refresh = false) => getWithMeta(withRefresh('/mttr-attribution', refresh))
export const fetchCascade          = (refresh = false) => getWithMeta(withRefresh('/cascade', refresh))
export const fetchRiskScorecard    = (refresh = false) => getWithMeta(withRefresh('/risk-scorecard', refresh))
export const fetchSandboxTemplates = () => getWithMeta('/sandbox/templates')
export const sandboxQuery          = (sql: string, sources: string[]) =>
  api.post('/sandbox/query', { sql, sources }).then(r => r.data)

export const fetchTeamHealth          = (refresh = false) => getWithMeta(withRefresh('/team-health', refresh))
export const fetchConstellation       = (refresh = false) => getWithMeta(withRefresh('/constellation', refresh))
export const fetchSelfHeal            = (refresh = false) => getWithMeta(withRefresh('/selfheal', refresh))
export const fetchDeployWeekly        = (refresh = false) => getWithMeta(withRefresh('/deploy-weekly', refresh))
export const fetchTicketTeams         = (refresh = false) => getWithMeta(withRefresh('/ticket-teams', refresh))
export const fetchReleaseAttribution  = (refresh = false) => getWithMeta(withRefresh('/release-attribution', refresh))
export const fetchLinearPRLinks       = (refresh = false) => getWithMeta(withRefresh('/linear-pr-links', refresh))
export const fetchLinearSprints       = (refresh = false) => getWithMeta(withRefresh('/linear-sprints', refresh))
export const fetchPagerDutyForensics  = (refresh = false) => getWithMeta(withRefresh('/pagerduty-forensics', refresh))
export const fetchOncallAttribution   = (refresh = false) => getWithMeta(withRefresh('/oncall-attribution', refresh))
export const fetchSlackChannels       = (refresh = false) => getWithMeta(withRefresh('/slack-channels', refresh))
export const fetchSentryDiscover      = (refresh = false) => getWithMeta(withRefresh('/sentry-discover', refresh))

export const executeAction = (payload: { action_id: string; target: string; body: string; channel?: string }) =>
  api.post('/actions/execute', payload).then(r => r.data)

export const fetchAutopilot = () =>
  api.post('/autopilot').then(r => r.data)

export const fetchReviewDebt = (refresh = false) => getWithMeta(withRefresh('/review-debt', refresh))
export const fetchTicketThreadTracker = (refresh = false) => getWithMeta(withRefresh('/ticket-thread-tracker', refresh))
export const fetchReviewDebtAging = (refresh = false) => getWithMeta(withRefresh('/review-debt-aging', refresh))
export const fetchCircleCIHealth = (refresh = false) => getWithMeta(withRefresh('/circleci-health', refresh))
export const fetchTokenROI = (refresh = false) => getWithMeta(withRefresh('/token-roi', refresh))
export const fetchLighthouse = (refresh = false) => getWithMeta(withRefresh('/lighthouse/prospects', refresh))

export async function generateOutreach(prospect: {
  company: string
  open_data_roles: number
  sample_roles: string[]
  pain_title: string
  pain_points: number
  primary_language: string
  public_repos: number
}): Promise<{ company: string; outreach: string }> {
  const response = await api.post('/lighthouse/outreach', prospect)
  return response.data
}

export async function handoverStream(
  username: string,
  onStep: (step: { type: string; id: string; status: string; label: string; sources?: string[]; proof?: unknown }) => void,
): Promise<{
  username: string
  brief_text: string
  summary: { pr_count: number; open_tickets: number; live_errors: number; total_additions: number; total_deletions: number }
  proofs: unknown[]
}> {
  const base = (import.meta.env.VITE_API_BASE_URL || '/api') as string
  const url = base.endsWith('/api') ? base.replace(/\/api$/, '/api/handover-stream') : `${base}/handover-stream`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })
  if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult: any = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const event = JSON.parse(line.slice(6))
        if (event.type === 'brief') {
          finalResult = event
        } else if (event.type === 'step') {
          onStep(event)
        } else if (event.type === 'error') {
          throw new Error(event.message || 'Handover agent error')
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue
        throw e
      }
    }
  }
  if (!finalResult) throw new Error('Stream ended without a brief')
  return finalResult
}

export async function prReviewStream(
  prUrl: string,
  onStep: (step: { type: string; id: string; status: string; label: string; sources?: string[]; proof?: unknown }) => void,
): Promise<{
  pr_number: number
  pr_title: string
  pr_author: string
  pr_url: string
  pr_state: string
  risk_level: string
  service_hints: string[]
  review_text: string
  summary: Record<string, number>
  draft_action: { id: string; title: string; target: string; body: string; pr_ref: string }
  proofs: unknown[]
  owner: string
  repo: string
}> {
  const base = (import.meta.env.VITE_API_BASE_URL || '/api') as string
  const url = base.endsWith('/api') ? base.replace(/\/api$/, '/api/pr-review') : `${base}/pr-review`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pr_url: prUrl }),
  })
  if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult: any = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const event = JSON.parse(line.slice(6))
        if (event.type === 'review') {
          finalResult = event
        } else if (event.type === 'step') {
          onStep(event)
        } else if (event.type === 'error') {
          throw new Error(event.message || 'Agent error')
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue
        throw e
      }
    }
  }
  if (!finalResult) throw new Error('Stream ended without a review')
  return finalResult
}

export interface AskHelmResult {
  answer: string
  proofs: unknown[]
  draft_actions: unknown[]
  data_used: string[]
  session_id: string
  history_turns: number
  optimization_card?: unknown
}

export async function askHelmStream(
  question: string,
  onStep: (step: { type: string; id: string; status: string; label: string; proof?: unknown }) => void,
  sessionId?: string,
): Promise<AskHelmResult> {
  const base = (import.meta.env.VITE_API_BASE_URL || '/api') as string
  const url = base.endsWith('/api') ? base.replace(/\/api$/, '/api/ask-stream') : `${base}/ask-stream`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, session_id: sessionId ?? null }),
  })
  if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalAnswer: AskHelmResult | null = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const event = JSON.parse(line.slice(6))
        if (event.type === 'answer') {
          finalAnswer = event as AskHelmResult
        } else if (event.type === 'step') {
          onStep(event)
        }
      } catch {
        // malformed SSE line — skip
      }
    }
  }
  if (!finalAnswer) throw new Error('Stream ended without an answer event')
  return finalAnswer
}
