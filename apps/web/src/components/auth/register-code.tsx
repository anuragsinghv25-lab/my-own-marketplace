'use client';

import { useState, useTransition } from 'react';
import { Button, Field, Input } from '@orbita/ui';
import { resendCodeAction, verifyCodeAction } from '@/app/(auth)/register/actions';
import type { ActionState } from '@/lib/action-state';
import { Notice } from './auth-frame';

/** Step two of registration: the 6-digit code from the email. Same page, so no link and no site address involved. */
export function CodeStep(props: { email: string; password: string; message?: string; icon: React.ReactNode; onBack: () => void }) {
  const [email, setEmail] = useState(props.email);
  const [code, setCode] = useState('');
  const [state, setState] = useState<ActionState>({ status: 'idle' });
  const [info, setInfo] = useState(props.message);
  const [pending, start] = useTransition();
  const [resending, startResend] = useTransition();
  const fixedEmail = !!props.email;

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => setState(await verifyCodeAction({ email, code, password: props.password || undefined })));
  };
  const resend = () =>
    startResend(async () => {
      const r = await resendCodeAction(email);
      if (r.status === 'ok') {
        setInfo(r.message);
        setState({ status: 'idle' });
      } else setState(r);
    });

  return (
    <form onSubmit={verify} className="space-y-4" noValidate>
      <div className="mx-auto h-12 w-12 rounded-2xl bg-ok/10 text-ok grid place-items-center">{props.icon}</div>
      <p className="text-center font-medium">{fixedEmail ? 'Check your email' : 'Enter your code'}</p>
      {info ? <Notice tone="accent">{info}</Notice> : null}
      {state.status === 'error' ? <Notice tone="bad">{state.message}</Notice> : null}
      {fixedEmail ? null : (
        <Field label="Email you registered with" htmlFor="cd-email" required>
          <Input id="cd-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
      )}
      <Field label="6-digit code" htmlFor="cd-code" required hint="It works for 30 minutes">
        <Input
          id="cd-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          className="font-mono text-center text-2xl tracking-[0.5em]"
        />
      </Field>
      <Button type="submit" className="w-full" loading={pending} disabled={code.length !== 6 || !email}>
        Confirm email
      </Button>
      <div className="flex justify-between text-sm">
        <button type="button" onClick={props.onBack} className="text-mute hover:underline">Back</button>
        <button type="button" onClick={resend} disabled={resending || !email} className="text-accent hover:underline disabled:opacity-50">
          {resending ? 'Sending…' : 'Send a new code'}
        </button>
      </div>
      <p className="text-xs text-mute text-center">Then our team verifies your business; you can prepare brand requests meanwhile.</p>
    </form>
  );
}
