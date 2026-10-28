import type { Metadata } from 'next';
import { Suspense } from 'react';
import { subject } from '@orbita/authz';
import { getDb } from '@orbita/db';
import { loadTree } from '@orbita/taxonomy';
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
    return { ...n, canEdit: a.can('update', s), canCreateChild: n.level < 5 && a.can('create', s) };
  });
  return (
    <>
      <PageHeader
        eyebrow="Category workbench"
        title="Category tree"
        description="Segment › Family › Class › Commodity (UNSPSC-style) › Listing category. Sellers list products in listing categories (L5)."
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
