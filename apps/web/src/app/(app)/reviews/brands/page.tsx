import type { Metadata } from 'next';
import { CaseDesk } from '@/components/review/case-desk';

export const metadata: Metadata = { title: 'Brand requests' };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <CaseDesk subjectType="brand_request" view={(await searchParams).view} />;
}
