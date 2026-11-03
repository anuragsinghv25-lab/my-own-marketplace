import { Badge } from '@orbita/ui';
import { formatDateTime } from '@/lib/format';

export const CASE_STATUS: Record<string, { label: string; tone: 'neutral' | 'accent' | 'warn' | 'ok' | 'bad' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'In review', tone: 'accent' },
  info_requested: { label: 'Information needed', tone: 'warn' },
  escalated: { label: 'With a senior reviewer', tone: 'accent' },
  approved: { label: 'Approved', tone: 'ok' },
  partially_approved: { label: 'Partly approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  pending: { label: 'Being verified', tone: 'accent' },
  verified: { label: 'Verified', tone: 'ok' },
  suspended: { label: 'Suspended', tone: 'bad' },
  requested: { label: 'Waiting for the owner', tone: 'accent' },
  granted: { label: 'Granted', tone: 'ok' },
  declined: { label: 'Declined', tone: 'bad' },
  revoked: { label: 'Revoked', tone: 'neutral' },
};

export function CaseBadge({ status }: { status: string }) {
  const s = CASE_STATUS[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const WORDS: Record<string, string> = { approve: 'Approved', reject: 'Rejected', request_info: 'Asked for more information', respond: 'Replied', escalate: 'Escalated to a senior reviewer', withdraw: 'Withdrawn' };

/** What happened in the review, as the seller sees it (no reviewer identities beyond names). */
export function CaseHistory({ submittedAt, decisions }: { submittedAt: string | null; decisions: { id: string; decision: string; byName: string | null; reasonLabel: string | null; note: string; decidedAt: string; fileIds?: string[] }[] }) {
  return (
    <ol className="space-y-3">
      {submittedAt ? (
        <li className="text-sm">
          <span className="font-medium">Submitted</span> <span className="text-mute">· {formatDateTime(submittedAt)}</span>
        </li>
      ) : null}
      {decisions.map((d) => (
        <li key={d.id} className="text-sm">
          <span className="font-medium">{WORDS[d.decision] ?? d.decision}</span>
          {d.byName ? <span className="text-mute"> by {d.byName}</span> : null}
          <span className="text-mute"> · {formatDateTime(d.decidedAt)}</span>
          {d.reasonLabel || d.note ? <p className="mt-0.5 whitespace-pre-wrap">{[d.reasonLabel, d.note].filter(Boolean).join(' · ')}</p> : null}
          {d.fileIds?.length ? <p className="text-xs text-mute">{d.fileIds.length} file{d.fileIds.length === 1 ? '' : 's'} attached</p> : null}
        </li>
      ))}
    </ol>
  );
}
