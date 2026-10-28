import type { Metadata } from 'next';
import { getDb } from '@orbita/db';
import { standardsStatus } from '@orbita/standards';
import { PageHeader } from '@orbita/ui';
import { StandardsView } from '@/components/taxonomy/standards-view';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Standard taxonomies' };

export default async function StandardsPage() {
  const session = await requirePermission('create', 'StandardTaxonomy');
  const status = await standardsStatus(getDb(), session.ability);
  return (
    <>
      <PageHeader
        eyebrow="Admin console"
        title="Standard taxonomies"
        description="Load Shopify's product taxonomy and the UNSPSC codeset as read-only references. Category managers then adopt what the marketplace needs instead of typing every level."
      />
      <StandardsView status={JSON.parse(JSON.stringify(status))} />
    </>
  );
}
