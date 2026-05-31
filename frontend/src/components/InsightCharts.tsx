import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  Legend,
  Cell,
} from 'recharts'

const GREEN = '#006b32'
const GREEN_LIGHT = '#55b983'
const DANGER = '#dc2626'
const WARN = '#ca6a00'
const MUTED = '#72776b'

function riskColor(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0
  if (pct > 0.7) return DANGER
  if (pct > 0.4) return WARN
  return GREEN
}

export function BurnoutBarChart({ engineers }: { engineers?: any[] }) {
  const rows = (engineers || [])
    .filter((r: any) => r.name)
    .slice(0, 10)
    .map((r: any) => ({
      name: String(r.name).split(' ')[0],
      burnout: Number(r.burnout_score) || 0,
      tickets: Number(r.open_tickets) || 0,
      prs: Number(r.pr_count) || 0,
    }))
    .sort((a, b) => b.burnout - a.burnout)

  const maxBurnout = Math.max(...rows.map(r => r.burnout), 1)

  if (!rows.length) return null

  return (
    <div className="chart-section">
      <p className="chart-section-title">Engineer Burnout Pressure</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 26 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dedfd8" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fontSize: 11, fill: MUTED }}
            axisLine={false}
            tickLine={false}
            width={118}
          />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #dedfd8', borderRadius: 6, fontSize: 12 }}
            formatter={(value: any) => [value, 'Burnout score']}
          />
          <Bar dataKey="burnout" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {rows.map((row, index) => (
              <Cell key={index} fill={riskColor(row.burnout, maxBurnout)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ServiceStabilityChart({ services }: { services?: any[] }) {
  const rows = (services || [])
    .filter((r: any) => r.service_name)
    .slice(0, 8)
    .map((r: any) => ({
      name: String(r.service_name).replace(/^nimbus-/, '').replace(/-/g, ' '),
      errors: Number(r.error_count) || 0,
      incidents: Number(r.incident_count) || 0,
      stability: Number(r.stability_pct) || Math.max(0, 100 - (Number(r.error_count) || 0) * 5),
    }))

  if (!rows.length) return null

  return (
    <div className="chart-section">
      <p className="chart-section-title">Service Stability vs Error Volume</p>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={rows} margin={{ top: 4, right: 16, bottom: 24, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dedfd8" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" interval={0} />
          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} domain={[0, 100]} />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #dedfd8', borderRadius: 6, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Bar yAxisId="left" dataKey="errors" name="Errors" fill={DANGER} radius={[3, 3, 0, 0]} maxBarSize={28} opacity={0.85} />
          <Bar yAxisId="left" dataKey="incidents" name="Incidents" fill={WARN} radius={[3, 3, 0, 0]} maxBarSize={28} opacity={0.85} />
          <Line yAxisId="right" type="monotone" dataKey="stability" name="Stability %" stroke={GREEN} strokeWidth={2} dot={{ fill: GREEN, r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function PRErrorTimeline({ rows }: { rows?: any[] }) {
  const buckets: Record<string, { date: string; prs: number; errors: number; users: number }> = {}

  for (const row of rows || []) {
    const raw = row.merged_at || row.first_seen || ''
    const day = String(raw).slice(0, 10)
    if (!day || day === 'null') continue
    if (!buckets[day]) buckets[day] = { date: day, prs: 0, errors: 0, users: 0 }
    buckets[day].prs += 1
    buckets[day].errors += Number(row.times_seen) || 0
    buckets[day].users += Number(row.users_affected) || 0
  }

  const data = Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date)).slice(-14)

  if (!data.length) return null

  return (
    <div className="chart-section">
      <p className="chart-section-title">PR Merges vs Production Errors (14d)</p>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 24, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dedfd8" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} angle={-25} textAnchor="end" interval={0} />
          <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #dedfd8', borderRadius: 6, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Area type="monotone" dataKey="errors" name="Sentry events" fill={`${DANGER}22`} stroke={DANGER} strokeWidth={2} />
          <Bar dataKey="prs" name="PRs merged" fill={GREEN_LIGHT} radius={[3, 3, 0, 0]} maxBarSize={24} opacity={0.9} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function EvidenceScoreChart({ rows }: { rows?: any[] }) {
  const chains = Object.values((rows || []).reduce((acc: Record<string, any>, row: any) => {
    const key = `${row.pr_number || 'chain'}-${row.pr_title || row.error_title || ''}`
    if (!acc[key]) {
      acc[key] = {
        name: row.pr_number ? `PR #${row.pr_number}` : `Chain ${Object.keys(acc).length + 1}`,
        title: row.pr_title || row.error_title || 'Evidence chain',
        score: 0,
        errors: 0,
      }
    }
    acc[key].score = Math.max(Number(acc[key].score) || 0, Number(row.evidence_score) || 0)
    acc[key].errors += Number(row.times_seen) || 0
    return acc
  }, {}))

  const data = chains
    .sort((a: any, b: any) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, 8)

  if (!data.length) return null

  function evidenceColor(score: number) {
    if (score >= 70) return GREEN
    if (score >= 40) return WARN
    return DANGER
  }

  return (
    <div className="chart-section">
      <p className="chart-section-title">Evidence Confidence by PR Chain</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 16, bottom: 24, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dedfd8" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #dedfd8', borderRadius: 6, fontSize: 12 }}
            formatter={(value: any) => [value, 'Evidence score']}
            labelFormatter={(label: any, payload: any[]) => payload?.[0]?.payload?.title || label}
          />
          <Bar dataKey="score" radius={[3, 3, 0, 0]} maxBarSize={32}>
            {data.map((row: any, index) => (
              <Cell key={index} fill={evidenceColor(Number(row.score) || 0)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
