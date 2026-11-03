import type { Metadata } from 'next';
import { hasApprovedVa, listingCategories } from '@orbita/brands';
import { getDb } from '@orbita/db';
import { PageHeader } from '@orbita/ui';
import { BrandJourney } from '@/components/seller/brand-journey';
import { requireSellerOrg } from '@/server/seller';

export const metadata: Metadata = { title: 'Add a brand' };

export default async function NewBrandPage() {
  const { org, orgId } = await requireSellerOrg();
  const db = getDb();
  const [cats, va] = await Promise.all([listingCategories(db), hasApprovedVa(db, orgId)]);
  return (
    <>
      <PageHeader eyebrow="Seller app · Brand Center" title="Add a brand" description="Start with the name: if the brand is already on Orbita you will see who owns it, so nobody files it twice." />
      <BrandJourney
        orgId={orgId}
        categories={cats.map((c) => ({ id: c.id, path: c.path }))}
        verified={org.status === 'verified'}
        hasApprovedVa={va}
        initial={{ id: null, brandName: '', relation: 'owner', brandKind: 'registered', trademark: { markType: 'word', applicationNumber: '', niceClass: null, ownerName: org.legalName, validUntil: '', certificate: [] }, categoryNodeIds: [], ownerNameMatches: null, undertakingAccepted: false, files: [], note: '' }}
      />
    </>
  );
}
