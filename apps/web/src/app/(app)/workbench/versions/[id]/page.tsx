import { createHash } from 'node:crypto';
import type { Metadata } from 'next';
import { acquireLock, assignableManagers, getWorkspace, listVersions, loadVersion, toSpecInput, versionHistory } from '@orbita/category-config';
import { canonicalJson, fieldsFor } from '@orbita/contract';
import { getDb } from '@orbita/db';
import { isAppError } from '@orbita/domain';
import { notFound } from 'next/navigation';
import { TabLinks } from '@/components/common/tab-links';
import { FlagsTab } from '@/components/config/flags-tab';
import { HistoryTab } from '@/components/config/history-tab';
import { OverviewTab } from '@/components/config/overview-tab';
import { PreviewTab } from '@/components/config/preview-tab';
import { RulesTab } from '@/components/config/rules-tab';
import { SpecsTab } from '@/components/config/specs-tab';
import { TestsTab } from '@/components/config/tests-tab';
import { VersionHeader } from '@/components/config/version-header';
import { requirePermission } from '@/server/session';
import { requestMeta } from '@/server/request';
import { plain } from '@/lib/plain';

export const metadata: Metadata = { title: 'Configure category' };

const TABS = ['overview', 'flags', 'specs', 'rules', 'preview', 'tests', 'history'] as const;
type Tab = (typeof TABS)[number];

export default async function VersionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requirePermission('read', 'CategoryVersion');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'overview';
  const db = getDb();
  const ctx = { ...session, meta: await requestMeta() };

  let ws: Awaited<ReturnType<typeof getWorkspace>>;
  let lockedOut: string | null = null;
  try {
    // opening the editor takes the edit lock when it is free, so changes never collide
    const lock = await acquireLock({ db }, ctx, id);
    if (!lock.locked && lock.reason === 'held') lockedOut = lock.by;
    ws = await getWorkspace(db, session, id);
  } catch (e) {
    if (isAppError(e) && (e.code === 'NOT_FOUND' || e.code === 'BAD_REQUEST')) notFound();
    throw e;
  }
  const editable = ws.canEdit && !lockedOut;
  const draftHash = ws.contract ? createHash('sha256').update(canonicalJson(ws.contract)).digest('hex') : null;
  const ref = await loadVersion(db, id);
  const assignees = ws.canAssign ? await assignableManagers(db, ref) : [];
  const others = editable ? (await listVersions(db, session)).filter((v) => v.id !== id) : [];
  const errors = ws.draft.issues.filter((i) => i.severity === 'error');
  const base = `/workbench/versions/${id}`;

  return (
    <>
      <VersionHeader
        ws={plain({ version: ws.version, node: ws.node, canAssign: ws.canAssign, lastCompile: ws.lastCompile, draftOk: ws.draft.ok })}
        editable={editable}
        canEdit={ws.canEdit}
        lockedOut={lockedOut}
        upToDate={!!draftHash && draftHash === ws.lastCompile?.hash}
        errorCount={errors.length}
        assignees={plain(assignees)}
        others={plain(others.map((o) => ({ id: o.id, label: `${o.path.join(' › ')} · v${o.number}` })))}
      />
      <TabLinks
        base={base}
        current={tab}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'flags', label: 'Flags', count: ws.flags.filter((f) => f.source === 'version').length || undefined },
          { key: 'specs', label: 'Specifications', count: ws.specs.length },
          { key: 'rules', label: 'Rules', count: ws.rules.length },
          { key: 'preview', label: 'Preview' },
          { key: 'tests', label: 'Test cases', count: ws.tests.length },
          { key: 'history', label: 'History' },
        ]}
      />
      {tab === 'overview' ? <OverviewTab ws={ws} base={base} upToDate={!!draftHash && draftHash === ws.lastCompile?.hash} /> : null}
      {tab === 'flags' ? <FlagsTab versionId={id} ws={plain({ flags: ws.flags, profiles: ws.profiles, profile: ws.profile })} editable={editable} /> : null}
      {tab === 'specs' ? <SpecsTab versionId={id} ws={plain({ specs: ws.specs, attributeSet: ws.attributeSet, titleTemplate: ws.version.titleTemplate, issues: ws.draft.issues, contract: ws.contract })} editable={editable} /> : null}
      {tab === 'rules' ? <RulesTab versionId={id} ws={plain({ rules: ws.rules, fields: [...fieldsFor(ws.specs.map(toSpecInput)).values()], issues: ws.draft.issues })} editable={editable} /> : null}
      {tab === 'preview' ? <PreviewTab versionId={id} contract={plain(ws.contract)} issues={plain(ws.draft.issues)} editable={editable} base={base} /> : null}
      {tab === 'tests' ? <TestsTab versionId={id} tests={plain(ws.tests) as never} lastCompile={plain(ws.lastCompile)} editable={editable} base={base} /> : null}
      {tab === 'history' ? <HistoryTab events={plain(await versionHistory(db, session.ability, id))} /> : null}
    </>
  );
}
