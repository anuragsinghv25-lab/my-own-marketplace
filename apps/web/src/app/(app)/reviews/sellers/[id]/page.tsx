import type { Metadata } from 'next';
import { CaseReview } from '@/components/review/case-review';

export const metadata: Metadata = { title: 'Review' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <CaseReview subjectType="seller_org" requestId={(await params).id} />;
}
