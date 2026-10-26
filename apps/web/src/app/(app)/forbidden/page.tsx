import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Card, EmptyState, buttonClass } from '@orbita/ui';

export default function ForbiddenPage() {
  return (
    <Card>
      <EmptyState
        icon={<Lock size={22} />}
        title="You do not have access to that page"
        description="Your roles do not include this. If you think they should, ask a platform admin."
        action={<Link href="/" className={buttonClass('secondary')}>Go to my home</Link>}
      />
    </Card>
  );
}
