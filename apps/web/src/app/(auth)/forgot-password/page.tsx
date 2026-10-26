import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ForgotPasswordForm } from '@/components/auth/forms';

export const metadata: Metadata = { title: 'Reset password' };

export default function ForgotPasswordPage() {
  return (
    <div>
      <Link href="/login" className="inline-flex items-center gap-1 text-sm text-mute hover:text-ink mb-6">
        <ArrowLeft size={15} /> Back to sign in
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="text-sm text-mute mt-1 mb-6">Enter your work email and we will send you a link to choose a new password.</p>
      <ForgotPasswordForm />
    </div>
  );
}
