import type { Metadata } from 'next';
import { NewPasswordForm } from '@/components/auth/forms';
import { requireSession } from '@/server/session';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage() {
  const session = await requireSession({ allowInvited: true });
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="text-sm text-mute mt-1 mb-6">For {session.actor.email}</p>
      <NewPasswordForm />
    </div>
  );
}
