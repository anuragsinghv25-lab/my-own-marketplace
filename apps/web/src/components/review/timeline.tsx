import { CheckCircle2, CornerUpLeft, Send, Trash2, Undo2 } from 'lucide-react';
import { formatDateTime } from '@/lib/format';

interface TaskLike {
  id: string;
  attempt: number;
  createdAt: string;
  stage: string;
}
interface DecisionLike {
  id: string;
  attempt: number;
  decision: string;
  decidedAt: string;
  byName: string | null;
  reasonLabel: string | null;
  note: string;
}

const ICON = { submitted: Send, approve: CheckCircle2, send_back: CornerUpLeft, discard: Trash2, withdraw: Undo2 } as const;
const LABEL: Record<string, string> = { approve: 'Approved', send_back: 'Sent back', discard: 'Discarded', withdraw: 'Withdrawn' };

/** Attempts and decisions in order, newest last. */
export function Timeline({ tasks, decisions, submitterName }: { tasks: TaskLike[]; decisions: DecisionLike[]; submitterName: string | null }) {
  const firstOfAttempt = [...new Map(tasks.map((t) => [t.attempt, t])).values()].map((t) => tasks.find((x) => x.attempt === t.attempt)!);
  const events = [
    ...firstOfAttempt.map((t) => ({ at: t.createdAt, kind: 'submitted' as const, title: t.attempt > 1 ? `Resubmitted (attempt ${t.attempt})` : 'Submitted', who: t.attempt === Math.max(...tasks.map((x) => x.attempt)) ? submitterName : null, detail: null as string | null })),
    ...decisions.map((d) => ({ at: d.decidedAt, kind: d.decision as keyof typeof ICON, title: LABEL[d.decision] ?? d.decision, who: d.byName, detail: [d.reasonLabel, d.note].filter(Boolean).join(' · ') || null })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <ol className="relative px-5 py-4 space-y-4">
      {events.map((e, i) => {
        const Icon = ICON[e.kind] ?? Send;
        return (
          <li key={i} className="flex gap-3">
            <span className="h-8 w-8 shrink-0 rounded-full bg-soft grid place-items-center text-mute">
              <Icon size={15} />
            </span>
            <div className="min-w-0">
              <div className="text-sm">
                <span className="font-medium">{e.title}</span>
                {e.who ? <span className="text-mute"> by {e.who}</span> : null}
              </div>
              <div className="text-xs text-mute">{formatDateTime(e.at)}</div>
              {e.detail ? <p className="text-sm mt-1 whitespace-pre-wrap">{e.detail}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
