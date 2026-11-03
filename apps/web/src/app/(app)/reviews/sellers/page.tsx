import type { Metadata } from 'next';
import { CaseDesk } from '@/components/review/case-desk';

export const metadata: Metadata = { title: 'Seller verification' };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <CaseDesk subjectType="seller_org" view={(await searchParams).view} />;
}
