import type { Metadata } from 'next';
import Link from 'next/link';
import { FileClock, Stamp } from 'lucide-react';
import { deskCounts } from '@orbita/category-publishing';
import { getDb } from '@orbita/db';
import { myOpenDrafts } from '@orbita/taxonomy';
import { Badge, Card, CardHeader } from '@orbita/ui';
import { AreaHome } from '@/components/app/area-home';
import { upcomingFor } from '@/lib/upcoming';
import { requirePermission, roleLabels } from '@/server/session';

export const metadata: Metadata = { title: 'Category workbench' };

export default async function Page() {
  const session = await requirePermission('access', 'Workbench');
  const drafts = await myOpenDrafts(getDb(), session);
  const desk = session.ability.can('approve', 'CategoryVersion') ? await deskCounts(getDb(), session) : null;
  return (
    <AreaHome
      eyebrow="Category workbench"
      title={`Welcome, ${session.actor.fullName.split(' ')[0] || 'there'}`}
      description="Configure categories, their specifications and rules, and move them through review to publication."
      name={session.actor.fullName || session.actor.email}
      roles={roleLabels(session.roles)}
      upcoming={upcomingFor(session.ability, 'Workbench')}
    >
      {desk ? (
        <Card className="mb-4">
          <Link href={desk.mine ? '/reviews?view=mine' : '/reviews?view=queue'} className="flex items-center gap-4 px-5 py-4 hover:bg-soft/60 rounded-2xl">
            <span className="h-11 w-11 rounded-2xl bg-accent/10 text-accent grid place-items-center shrink-0"><Stamp size={20} /></span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold">Category approvals</span>
              <span className="block text-sm text-mute">
                {desk.mine} on your worklist · {desk.queue} waiting in the queue{desk.overdue ? ` · ${desk.overdue} overdue` : ''}
              </span>
            </span>
            {desk.overdue ? <Badge tone="bad">{desk.overdue} overdue</Badge> : null}
          </Link>
        </Card>
      ) : null}
      {session.ability.can('update', 'CategoryVersion') ? (
        <Card className="mb-4">
          <CardHeader title="Assigned to you" description="Category versions waiting for you to configure." />
          {drafts.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {drafts.map((d) => (
                <li key={d.id}>
                  <Link href={`/workbench/versions/${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-soft/60">
                    <FileClock size={18} className="text-warn shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{d.path.split(' › ').at(-1)}</div>
                      <div className="text-xs text-mute truncate">{d.path}</div>
                    </div>
                    <Badge tone={d.state === 'SENT_BACK' ? 'bad' : 'warn'}>{d.state === 'SENT_BACK' ? 'Sent back' : 'Draft'} v{d.version}</Badge>
                    <code className="text-[11px] text-mute">{d.code}</code>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-line px-5 py-4 text-sm text-mute">Nothing assigned to you right now.</p>
          )}
        </Card>
      ) : null}
    </AreaHome>
  );
}
