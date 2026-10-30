import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { listVersions } from '@orbita/category-config';
import { getDb } from '@orbita/db';
import { Badge, Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@orbita/ui';
import { TabLinks } from '@/components/common/tab-links';
import { timeAgo } from '@/lib/format';
import { VERSION_STATE_TONE, versionStateLabel } from '@/lib/version-state';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Category versions' };

export default async function VersionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requirePermission('read', 'CategoryVersion');
  const sp = await searchParams;
  const tab = sp.tab === 'all' ? 'all' : 'mine';
  const rows = await listVersions(getDb(), session, { mine: tab === 'mine' });
  return (
    <>
      <PageHeader
        eyebrow="Category workbench"
        title="Category versions"
        description="Each listing category is configured as a version: flags, specifications and rules, compiled into the contract sellers list against."
      />
      <TabLinks base="/workbench/versions" current={tab} tabs={[{ key: 'mine', label: 'Assigned to me' }, { key: 'all', label: 'All' }]} />
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={tab === 'mine' ? 'Nothing assigned to you' : 'No versions yet'}
            description="A version is created when a listing category is added to the category tree."
            action={<Link href="/workbench/taxonomy" className="text-sm text-accent hover:underline">Open the category tree</Link>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TH>Listing category</TH>
              <TH>Version</TH>
              <TH className="hidden md:table-cell">Specs · rules</TH>
              <TH>Contract</TH>
              <TH className="hidden lg:table-cell">Assigned to</TH>
              <TH className="hidden lg:table-cell">Updated</TH>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/workbench/versions/${r.id}`} className="font-medium hover:underline">{r.node.name}</Link>
                    <div className="text-xs text-mute truncate max-w-[340px]">{r.path.slice(0, -1).join(' › ')}</div>
                  </TD>
                  <TD><Badge tone={VERSION_STATE_TONE[r.state] ?? 'neutral'}>v{r.number} · {versionStateLabel(r.state)}</Badge></TD>
                  <TD className="hidden md:table-cell text-mute">{r.specCount} · {r.ruleCount}</TD>
                  <TD>
                    {r.compiled === null ? (
                      <span className="inline-flex items-center gap-1 text-xs text-mute"><CircleDashed size={14} /> Not compiled</span>
                    ) : r.compiled ? (
                      <span className="inline-flex items-center gap-1 text-xs text-ok"><CheckCircle2 size={14} /> <code>{r.hash?.slice(0, 8)}</code></span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-bad"><XCircle size={14} /> Has problems</span>
                    )}
                  </TD>
                  <TD className="hidden lg:table-cell text-mute">{r.assignee ?? '—'}</TD>
                  <TD className="hidden lg:table-cell text-mute">{timeAgo(r.updatedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
