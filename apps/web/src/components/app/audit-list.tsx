import { Badge, type Tone } from '@orbita/ui';
import type { AuditEventRow } from '@orbita/db';
import { formatDateTime, timeAgo } from '@/lib/format';

export function actionTone(action: string): Tone {
  if (action.endsWith('revoked') || action.endsWith('deactivated')) return 'bad';
  if (action.endsWith('granted') || action.endsWith('activated') || action.endsWith('reactivated')) return 'ok';
  if (action.startsWith('auth.')) return 'neutral';
  return 'accent';
}

/** Compact feed of audit events (admin overview). */
export function AuditFeed({ items }: { items: AuditEventRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((e) => (
        <li key={e.id} className="flex items-start gap-3 px-5 py-3">
          <Badge tone={actionTone(e.action)} className="mt-0.5 font-mono text-[11px]">
            {e.action}
          </Badge>
          <div className="min-w-0 flex-1 text-sm">{e.summary}</div>
          <time className="shrink-0 text-xs text-mute" dateTime={e.occurredAt.toISOString()} title={formatDateTime(e.occurredAt)}>
            {timeAgo(e.occurredAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
