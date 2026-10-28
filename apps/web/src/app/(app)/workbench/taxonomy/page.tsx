import type { Metadata } from 'next';
import { Suspense } from 'react';
import { subject } from '@orbita/authz';
import { getDb } from '@orbita/db';
import { MAX_DEPTH, loadTree } from '@orbita/taxonomy';
import { PageHeader } from '@orbita/ui';
import { TaxonomyExplorer, type ExplorerNode } from '@/components/taxonomy/explorer';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Category tree' };

export default async function TaxonomyPage() {
  const session = await requirePermission('read', 'CategoryNode');
  const { nodes, workgroups } = await loadTree(getDb(), session.ability);
  const a = session.ability;
  const withRights: ExplorerNode[] = nodes.map((n) => {
    const s = subject('CategoryNode', { workgroupId: n.effectiveWorkgroupId });
    return { ...n, canEdit: a.can('update', s), canCreateChild: n.kind === 'group' && n.level < MAX_DEPTH && a.can('create', s) };
  });
  return (
    <>
      <PageHeader
        eyebrow="Category workbench"
        title="Category tree"
        description="Groups organise the tree, up to eight levels deep; sellers list products in listing categories. Build it yourself or adopt categories from Shopify and UNSPSC."
      />
      <Suspense>
        <TaxonomyExplorer
          nodes={JSON.parse(JSON.stringify(withRights))}
          workgroups={workgroups.map((w) => ({ id: w.id, name: w.name }))}
          canCreateRoot={a.can('create', subject('CategoryNode', { workgroupId: null }))}
        />
      </Suspense>
    </>
  );
}
