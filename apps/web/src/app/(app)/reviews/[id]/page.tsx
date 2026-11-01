import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlarmClock, CalendarClock, ChevronRight, ExternalLink } from 'lucide-react';
import { reviewWorkspace, todayIn } from '@orbita/category-publishing';
import { getDb } from '@orbita/db';
import { isAppError } from '@orbita/domain';
import { Badge, Card, CardHeader, cn } from '@orbita/ui';
import { TabLinks } from '@/components/common/tab-links';
import { ChangeLegend, ChangeList } from '@/components/review/changes';
import { Comments } from '@/components/review/comments';
import { ContractSummary } from '@/components/review/contract-summary';
import { DecisionPanel } from '@/components/review/decision-panel';
import { FormTry } from '@/components/review/form-try';
import { Timeline } from '@/components/review/timeline';
import { formatDateTime, timeAgo } from '@/lib/format';
import { plain } from '@/lib/plain';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Category review' };

const TABS = ['contract', 'changes', 'form', 'timeline'] as const;
type Tab = (typeof TABS)[number];

const STATE: Record<string, { label: string; tone: 'accent' | 'warn' | 'ok' | 'neutral' }> = {
  open: { label: 'Waiting for a decision', tone: 'accent' },
  sent_back: { label: 'Sent back', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  discarded: { label: 'Discarded', tone: 'neutral' },
};

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requirePermission('read', 'ReviewRequest');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'contract';
  let ws: Awaited<ReturnType<typeof reviewWorkspace>>;
  try {
    ws = await reviewWorkspace(getDb(), session, id);
  } catch (e) {
    if (isAppError(e) && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN')) notFound();
    throw e;
  }
  const r = ws.request;
  const base = `/reviews/${id}`;
  const fields = ws.contract
    ? [...ws.contract.fields.map((f) => ({ key: f.key, label: f.label })), { key: '_rules', label: 'Rules' }, { key: '_title', label: 'Product title' }, { key: '_offer', label: 'Offer terms and flags' }]
    : [];
  const commented = new Map<string, number>();
  for (const c of ws.comments) if (c.fieldKey && !c.resolvedAt) commented.set(c.fieldKey, (commented.get(c.fieldKey) ?? 0) + 1);
  const due = ws.openTask?.dueAt;
  const overdue = ws.overdue;
  const changeCount = ws.changes.sincePrevious ? ws.changes.sincePrevious.length : ws.changes.liveNumber !== null ? (ws.changes.sinceLive ?? []).length : 0;
  const stage = ws.definition.stages.find((s) => s.key === ws.openTask?.stage);

  return (
    <>
      <header className="mb-5">
        <nav className="flex flex-wrap items-center gap-1 text-xs text-mute" aria-label="Path">
          <Link href="/reviews" className="hover:text-ink hover:underline">Category approvals</Link>
          {ws.version.node.path.slice(0, -1).map((p) => (
            <span key={p} className="inline-flex items-center gap-1"><ChevronRight size={12} />{p}</span>
          ))}
        </nav>
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] leading-tight font-semibold tracking-tight">
              {ws.version.node.name} <span className="text-mute font-normal">v{ws.version.number}</span>
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={STATE[r.state]?.tone ?? 'neutral'}>{STATE[r.state]?.label ?? r.state}</Badge>
              {r.attempt > 1 ? <Badge>Attempt {r.attempt}</Badge> : null}
              {stage && ws.definition.stages.length > 1 ? <Badge>{stage.label}</Badge> : null}
              {ws.contractHash ? <Badge>Contract <code className="ml-1">{ws.contractHash.slice(0, 8)}</code></Badge> : null}
            </div>
          </div>
          <Link href={`/workbench/versions/${ws.version.id}`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            Open in the studio <ExternalLink size={13} />
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="min-w-0">
          <TabLinks
            base={base}
            current={tab}
            tabs={[
              { key: 'contract', label: 'What sellers get' },
              { key: 'changes', label: 'Changes', count: changeCount || undefined },
              { key: 'form', label: 'Seller form' },
              { key: 'timeline', label: 'Timeline' },
            ]}
          />
          {!ws.contract ? (
            <Card className="p-6 text-sm text-mute">The submitted contract is not available.</Card>
          ) : tab === 'contract' ? (
            <Card>
              <CardHeader title="What sellers get" description="The contract exactly as submitted. Add a comment on any specification from the panel." />
              <div className="border-t border-line">
                <ContractSummary contract={ws.contract} commented={commented} />
              </div>
            </Card>
          ) : tab === 'changes' ? (
            <div className="space-y-4">
              <ChangeLegend />
              {ws.changes.sincePrevious ? (
                <Card>
                  <CardHeader title={`Since attempt ${ws.changes.previousAttempt}`} description="What the category team changed after it was sent back." />
                  <div className="border-t border-line">
                    <ChangeList changes={ws.changes.sincePrevious} empty="Nothing changed since the previous attempt." />
                  </div>
                </Card>
              ) : null}
              <Card>
                <CardHeader
                  title={ws.changes.liveNumber !== null ? `Compared with live v${ws.changes.liveNumber}` : 'Compared with what is live'}
                  description={ws.changes.liveNumber !== null ? 'What sellers will notice when this version replaces the live one.' : 'Nothing is live in this category yet, so everything is new.'}
                />
                <div className="border-t border-line">
                  <ChangeList changes={ws.changes.sinceLive ?? []} empty="Identical to the live version." />
                </div>
              </Card>
            </div>
          ) : tab === 'form' ? (
            <Card className="p-5">
              <FormTry contract={plain(ws.contract) as never} />
            </Card>
          ) : (
            <Card>
              <Timeline tasks={plain(ws.tasks)} decisions={plain(ws.decisions)} submitterName={ws.submittedByName} />
            </Card>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-[76px]">
          <Card className="p-5 space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-mute">Submitted by</dt>
              <dd>{ws.submittedByName} · {timeAgo(r.submittedAt)}</dd>
              <dt className="text-mute">Approver</dt>
              <dd>{r.state === 'open' ? (ws.openTask?.assigneeId ? ws.tasks.find((t) => t.id === ws.openTask!.id)?.assigneeName : <span className="italic text-mute">Not picked up</span>) : (ws.decisions.at(-1)?.byName ?? '—')}</dd>
              {due && r.state === 'open' ? (
                <>
                  <dt className="text-mute">Due</dt>
                  <dd className={cn('inline-flex items-center gap-1', overdue && 'text-bad font-medium')}>
                    {overdue ? <AlarmClock size={14} /> : null}
                    {formatDateTime(due)}
                  </dd>
                </>
              ) : null}
              {ws.schedule ? (
                <>
                  <dt className="text-mute">Go-live</dt>
                  <dd className="inline-flex items-center gap-1">
                    <CalendarClock size={14} className="text-mute" /> Sellers {ws.schedule.sellerGoLive}, buyers {ws.schedule.buyerGoLive}
                  </dd>
                </>
              ) : null}
            </dl>
            {r.state === 'open' ? (
              <DecisionPanel
                versionId={ws.version.id}
                requestId={id}
                canDecide={ws.canDecide}
                whyNot={ws.whyNot}
                canClaim={ws.canClaim}
                canAssign={ws.canAssign}
                assigneeId={ws.openTask?.assigneeId ?? null}
                approvers={ws.approvers}
                reasons={ws.definition.reasonCodes}
                today={todayIn()}
                openComments={ws.comments.filter((c) => !c.resolvedAt).length}
              />
            ) : null}
          </Card>
          <Card className="p-5">
            <Comments requestId={id} versionId={ws.version.id} comments={plain(ws.comments)} fields={fields} canComment={ws.canComment} currentAttempt={r.attempt} compact />
          </Card>
        </aside>
      </div>
    </>
  );
}
