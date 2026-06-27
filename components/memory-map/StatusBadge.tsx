import type { StoryStatus, RiskLevel, PinStatus } from '@/lib/memory-map/types'
import { reviewLevelAdminLabel } from '@/lib/memory-map/review-level'

const STATUS_LABELS: Record<StoryStatus | PinStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending',
  approved: 'Published',
  rejected: 'Rejected',
  hidden: 'Hidden',
  archived: 'Archived',
  deleted: 'Deleted',
  pending: 'Pending',
}

export default function StatusBadge({ status }: { status: StoryStatus | PinStatus }) {
  const tone =
    status === 'approved'
      ? 'bg-emerald-500/20 text-emerald-300'
      : status === 'pending_review' || status === 'pending'
        ? 'bg-amber-500/20 text-amber-200'
        : status === 'rejected'
          ? 'bg-red-500/20 text-red-300'
          : 'bg-white/10 text-white/70'

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tone}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  const tone =
    level === 'high' || level === 'admin_review'
      ? 'bg-red-500/20 text-red-300'
      : level === 'medium'
        ? 'bg-amber-500/20 text-amber-200'
        : 'bg-white/10 text-white/70'

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tone}`}>
      {reviewLevelAdminLabel(level)}
    </span>
  )
}

export function OfficialBadge() {
  return (
    <span className="inline-flex rounded-full mm-bg-accent-20 px-2 py-0.5 text-[10px] font-bold uppercase mm-text-accent">
      Official
    </span>
  )
}

export function AdminCreatedBadge() {
  return (
    <span className="inline-flex rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-200">
      Admin-created
    </span>
  )
}
