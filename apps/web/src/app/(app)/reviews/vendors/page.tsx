import type { Metadata } from 'next';
import { CaseDesk } from '@/components/review/case-desk';

export const metadata: Metadata = { title: 'Vendor assessments' };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <CaseDesk subjectType="vendor_assessment" view={(await searchParams).view} />;
}
