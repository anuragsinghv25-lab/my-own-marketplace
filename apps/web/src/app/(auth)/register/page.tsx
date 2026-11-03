import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GST_STATES } from '@orbita/sellers';
import { RegisterForm } from '@/components/auth/register-form';
import { getSessionState } from '@/server/session';

export const metadata: Metadata = { title: 'Register as a seller' };

export default async function RegisterPage() {
  const state = await getSessionState();
  if (state.state === 'unconfigured') redirect('/setup');
  if (state.state === 'ok') redirect(state.session.homePath);
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Register as a seller</h1>
      <p className="text-sm text-mute mt-1 mb-6">
        For businesses registered for GST in India. We check your GSTIN before you can list. Already registered?{' '}
        <Link href="/login" className="text-accent hover:underline">Sign in</Link>
      </p>
      <RegisterForm states={Object.entries(GST_STATES).map(([code, name]) => ({ code, name }))} />
    </div>
  );
}
