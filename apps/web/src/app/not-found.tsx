import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { EmptyState, buttonClass } from '@orbita/ui';

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <EmptyState
        icon={<SearchX size={22} />}
        title="Page not found"
        description="The page you are looking for does not exist or has moved."
        action={
          <Link href="/" className={buttonClass('primary')}>
            Go home
          </Link>
        }
      />
    </div>
  );
}
