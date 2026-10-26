'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, EmptyState } from '@orbita/ui';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div className="min-h-[60vh] grid place-items-center px-4">
      <EmptyState
        icon={<AlertTriangle size={22} />}
        title="Something went wrong"
        description={
          <>
            We have been notified. Try again, or quote reference <code className="text-ink">{error.digest ?? 'n/a'}</code>{' '}
            when reporting it.
          </>
        }
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
