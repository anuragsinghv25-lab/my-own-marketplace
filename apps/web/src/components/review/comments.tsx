'use client';

import { useState } from 'react';
import { CheckCircle2, MessageSquare, RotateCcw } from 'lucide-react';
import { Avatar, Badge, Button, Select, Textarea, cn } from '@orbita/ui';
import { commentAction, resolveCommentAction } from '@/app/(app)/reviews/actions';
import { useRunner } from '@/components/common/use-runner';
import { timeAgo } from '@/lib/format';

export interface CommentView {
  id: string;
  attempt: number;
  fieldKey: string | null;
  fieldLabel: string | null;
  body: string;
  authorName: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
}

export interface FieldOption {
  key: string;
  label: string;
}

/**
 * Feedback on a review: about the whole version or about one specification, rule or section.
 * Several comments may sit on one field; the category team marks them resolved as they fix them.
 */
export function Comments({
  requestId,
  versionId,
  comments,
  fields,
  canComment,
  currentAttempt,
  compact,
}: {
  requestId: string;
  versionId?: string;
  comments: CommentView[];
  fields: FieldOption[];
  canComment: boolean;
  currentAttempt: number;
  compact?: boolean;
}) {
  const [field, setField] = useState('');
  const [body, setBody] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const { pending, run } = useRunner();
  const open = comments.filter((c) => !c.resolvedAt);
  const shown = showResolved ? comments : open;
  const groups = new Map<string, CommentView[]>();
  for (const c of shown) {
    const k = c.fieldKey ? `${c.fieldLabel ?? c.fieldKey}` : 'General';
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const submit = () => {
    const f = fields.find((x) => x.key === field);
    run(
      () => commentAction(requestId, { fieldKey: f?.key ?? null, fieldLabel: f?.label ?? null, body }, versionId),
      () => setBody(''),
    );
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium inline-flex items-center gap-1.5">
          <MessageSquare size={15} className="text-mute" /> Comments
          {open.length ? <Badge tone="warn">{open.length} open</Badge> : null}
        </div>
        {comments.length > open.length ? (
          <button type="button" className="text-xs text-accent hover:underline" onClick={() => setShowResolved(!showResolved)}>
            {showResolved ? 'Hide resolved' : `Show ${comments.length - open.length} resolved`}
          </button>
        ) : null}
      </div>
      {groups.size === 0 ? <p className="text-sm text-mute">{comments.length ? 'All comments are resolved.' : 'No comments yet.'}</p> : null}
      {[...groups].map(([g, list]) => (
        <div key={g} className="rounded-xl border border-line">
          <div className="px-3 py-1.5 text-xs font-medium text-mute border-b border-line bg-soft/40 rounded-t-xl">{g}</div>
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <li key={c.id} className={cn('px-3 py-2.5', c.resolvedAt && 'opacity-60')}>
                <div className="flex items-start gap-2.5">
                  <Avatar name={c.authorName ?? '?'} className="h-7 w-7 text-[11px]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-mute">
                      <span className="font-medium text-ink">{c.authorName}</span>
                      <span>{timeAgo(c.createdAt)}</span>
                      {c.attempt < currentAttempt ? <span>· attempt {c.attempt}</span> : null}
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
                    {c.resolvedAt ? <p className="text-xs text-ok mt-1 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Resolved by {c.resolvedByName}</p> : null}
                  </div>
                  {canComment ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0"
                      aria-label={c.resolvedAt ? 'Reopen comment' : 'Mark comment resolved'}
                      onClick={() => run(() => resolveCommentAction(requestId, c.id, !c.resolvedAt, versionId))}
                    >
                      {c.resolvedAt ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
                      {compact ? null : c.resolvedAt ? 'Reopen' : 'Resolve'}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {canComment ? (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <Select aria-label="Comment on" value={field} onChange={(e) => setField(e.target.value)}>
            <option value="">The whole version</option>
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
          <Textarea aria-label="Comment" rows={3} placeholder="What should change, and why?" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex justify-end">
            <Button size="sm" loading={pending} disabled={body.trim().length < 2} onClick={submit}>
              Add comment
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
