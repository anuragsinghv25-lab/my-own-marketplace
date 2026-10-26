import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Badge } from '@orbita/ui';
import { WelcomeForm } from '@/components/auth/forms';
import { env } from '@/server/env';
import { requireSession, roleLabels } from '@/server/session';

export const metadata: Metadata = { title: 'Welcome' };

export default async function WelcomePage() {
  const session = await requireSession({ allowInvited: true });
  if (session.profile.status !== 'invited') redirect(session.homePath);
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome to {env.marketplaceName()}</h1>
      <p className="text-sm text-mute mt-1">Set your password to finish joining. You have been given:</p>
      <div className="mt-3 mb-6 flex flex-wrap gap-1.5">
        {roleLabels(session.roles).map((r) => (
          <Badge key={r} tone="accent">
            {r}
          </Badge>
        ))}
      </div>
      <WelcomeForm defaultName={session.actor.fullName} />
    </div>
  );
}
