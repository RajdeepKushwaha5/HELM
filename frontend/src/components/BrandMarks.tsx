import { CircleDot, RadioTower } from 'lucide-react'
import { SiCircleci, SiGithub, SiLinear, SiPagerduty, SiSentry, SiSlack } from 'react-icons/si'

const sourceStyles: Record<string, string> = {
  github: 'bg-slate-100 text-slate-950',
  sentry: 'bg-violet-100 text-violet-800',
  pagerduty: 'bg-emerald-100 text-emerald-800',
  linear: 'bg-indigo-100 text-indigo-800',
  slack: 'bg-rose-100 text-rose-800',
  circleci: 'bg-gray-100 text-gray-800',
}

export function SourceLogo({ source, className = 'h-4 w-4' }: { source: string; className?: string }) {
  const name = source.toLowerCase()
  if (name.includes('github')) return <SiGithub className={className} />
  if (name.includes('sentry')) return <SiSentry className={className} />
  if (name.includes('pagerduty')) return <SiPagerduty className={className} />
  if (name.includes('linear')) return <SiLinear className={className} />
  if (name.includes('slack')) return <SiSlack className={className} />
  if (name.includes('circleci')) return <SiCircleci className={className} />
  if (name.includes('coral')) return <RadioTower className={className} />
  return <CircleDot className={className} />
}

export function SourceBadge({ source }: { source: string }) {
  const key = source.toLowerCase()
  const style = sourceStyles[key] || 'bg-sky-100 text-sky-800'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ${style}`}>
      <SourceLogo source={source} className="h-3.5 w-3.5" />
      {source.replace(/_/g, ' ')}
    </span>
  )
}
