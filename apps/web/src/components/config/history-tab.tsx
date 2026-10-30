import { History } from 'lucide-react';
import { Card, EmptyState } from '@orbita/ui';
import { formatDateTime } from '@/lib/format';

interface Event {
  id: number | string;
  action: string;
  summary: string;
  occurredAt: string;
  before: unknown;
  after: unknown;
}

export function HistoryTab({ events }: { events: Event[] }) {
  if (!events.length)
    return (
      <Card>
        <EmptyState icon={<History size={22} />} title="No changes yet" description="Every change to this version is recorded here with its before and after." />
      </Card>
    );
  return (
    <Card>
      <ol className="divide-y divide-line">
        {events.map((e) => (
          <li key={e.id} className="px-5 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm">{e.summary}</span>
              <span className="text-xs text-mute">{formatDateTime(e.occurredAt)}</span>
            </div>
            {e.before || e.after ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-mute">Before and after</summary>
                <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-soft p-3 text-[11px] leading-relaxed">{JSON.stringify({ before: e.before ?? undefined, after: e.after ?? undefined }, null, 2)}</pre>
              </details>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
