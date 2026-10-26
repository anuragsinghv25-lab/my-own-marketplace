'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Eye, EyeOff, KeyRound, Mail } from 'lucide-react';
import { Button, buttonClass, Checkbox, Field, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@orbita/ui';
import {
  acceptInvite,
  requestPasswordReset,
  runSetup,
  sendSignInLink,
  signInWithPassword,
  updatePassword,
} from '@/app/(auth)/actions';
import { idle, type ActionState } from '@/lib/action-state';
import { Notice } from './auth-frame';

const fieldError = (s: ActionState, name: string) =>
  s.status === 'error' ? s.fieldErrors?.[name]?.[0] : undefined;

function PasswordInput({ name, autoComplete, invalid, id }: { name: string; autoComplete: string; invalid?: boolean; id: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} name={name} type={show ? 'text' : 'password'} autoComplete={autoComplete} required aria-invalid={invalid} className="pr-11" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg grid place-items-center text-mute hover:bg-soft"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function StateNotice({ state }: { state: ActionState }) {
  if (state.status === 'error') return <Notice tone="bad">{state.message}</Notice>;
  if (state.status === 'ok' && state.message) return <Notice tone="ok">{state.message}</Notice>;
  return null;
}

/* ---------------------------------------------------------------- login */

export function LoginForm({ next, emailEnabled }: { next: string; emailEnabled: boolean }) {
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, idle);
  const [linkState, linkAction, linkPending] = useActionState(sendSignInLink, idle);
  return (
    <Tabs defaultValue="password">
      <TabsList className="mb-5 w-full grid grid-cols-2">
        <TabsTrigger value="password">
          <span className="inline-flex items-center gap-1.5"><KeyRound size={14} /> Password</span>
        </TabsTrigger>
        <TabsTrigger value="link">
          <span className="inline-flex items-center gap-1.5"><Mail size={14} /> Email link</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="password">
        <form action={pwAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Work email" htmlFor="email" error={fieldError(pwState, 'email')}>
            <Input id="email" name="email" type="email" autoComplete="username" required autoFocus aria-invalid={!!fieldError(pwState, 'email')} />
          </Field>
          <Field
            label={
              <span className="flex items-center justify-between">
                Password
                <Link href="/forgot-password" className="text-xs font-normal text-accent hover:underline">
                  Forgot password?
                </Link>
              </span>
            }
            htmlFor="password"
            error={fieldError(pwState, 'password')}
          >
            <PasswordInput id="password" name="password" autoComplete="current-password" invalid={!!fieldError(pwState, 'password')} />
          </Field>
          <StateNotice state={pwState} />
          <Button type="submit" size="lg" className="w-full" loading={pwPending}>
            Sign in
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="link">
        <form action={linkAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field
            label="Work email"
            htmlFor="link-email"
            hint={emailEnabled ? 'We email you a one-time sign-in link.' : 'Email sign-in switches on once email sending is connected.'}
            error={fieldError(linkState, 'email')}
          >
            <Input id="link-email" name="email" type="email" autoComplete="username" required disabled={!emailEnabled} />
          </Field>
          <StateNotice state={linkState} />
          <Button type="submit" size="lg" className="w-full" loading={linkPending} disabled={!emailEnabled}>
            Email me a link
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}

/* ---------------------------------------------------------------- forgot / reset */

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, idle);
  return (
    <form action={action} className="space-y-4">
      <Field label="Work email" htmlFor="email" error={fieldError(state, 'email')}>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <StateNotice state={state} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Send reset link
      </Button>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, idle);
  return (
    <form action={action} className="space-y-4">
      <Field label="New password" htmlFor="password" hint="At least 10 characters, with a letter and a number." error={fieldError(state, 'password')}>
        <PasswordInput id="password" name="password" autoComplete="new-password" invalid={!!fieldError(state, 'password')} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={fieldError(state, 'confirm')}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" invalid={!!fieldError(state, 'confirm')} />
      </Field>
      <StateNotice state={state} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Save password
      </Button>
    </form>
  );
}

/* ---------------------------------------------------------------- accept invite */

export function WelcomeForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState(acceptInvite, idle);
  return (
    <form action={action} className="space-y-4">
      <Field label="Your name" htmlFor="fullName" error={fieldError(state, 'fullName')}>
        <Input id="fullName" name="fullName" defaultValue={defaultName} autoComplete="name" required />
      </Field>
      <Field label="Choose a password" htmlFor="password" hint="At least 10 characters, with a letter and a number." error={fieldError(state, 'password')}>
        <PasswordInput id="password" name="password" autoComplete="new-password" invalid={!!fieldError(state, 'password')} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={fieldError(state, 'confirm')}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" invalid={!!fieldError(state, 'confirm')} />
      </Field>
      <StateNotice state={state} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Finish and sign in
      </Button>
    </form>
  );
}

/* ---------------------------------------------------------------- setup */

export function SetupForm() {
  const [state, action, pending] = useActionState(runSetup, idle);
  const [demo, setDemo] = useState(true);

  if (state.status === 'ok') {
    const demoUsers = (state.data?.demoUsers as { email: string; role: string }[] | undefined) ?? [];
    return (
      <div className="space-y-4">
        <Notice tone="ok">Setup complete. Sign in as {String(state.data?.adminEmail)}.</Notice>
        {demoUsers.length ? (
          <div className="rounded-xl bg-soft p-3.5 text-sm">
            <div className="font-semibold mb-1">Demo accounts (all use the demo password)</div>
            <ul className="text-xs text-mute space-y-0.5 max-h-56 overflow-y-auto">
              {demoUsers.map((u) => (
                <li key={u.email}>
                  <code className="text-ink">{u.email}</code> · {u.role}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Link href="/login" className={`${buttonClass('primary', 'lg')} w-full`}>
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Field label="Setup token" htmlFor="token" hint="The SETUP_TOKEN value you set in Vercel." error={fieldError(state, 'token')}>
        <Input id="token" name="token" type="password" autoComplete="off" required />
      </Field>
      <div className="h-px bg-line" />
      <div className="text-sm font-semibold">First platform admin</div>
      <Field label="Name" htmlFor="fullName" error={fieldError(state, 'fullName')}>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </Field>
      <Field label="Email" htmlFor="email" error={fieldError(state, 'email')}>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters, with a letter and a number." error={fieldError(state, 'password')}>
        <PasswordInput id="password" name="password" autoComplete="new-password" />
      </Field>
      <div className="h-px bg-line" />
      <label className="flex items-start gap-2.5 text-sm">
        <Checkbox name="demo" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="mt-0.5" />
        <span>
          <span className="font-medium">Create demo users, one per role</span>
          <span className="block text-xs text-mute">Useful for testing each role&apos;s view. Deactivate them before real use.</span>
        </span>
      </label>
      {demo ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Demo password" htmlFor="demoPassword" error={fieldError(state, 'demoPassword')}>
            <Input id="demoPassword" name="demoPassword" type="text" autoComplete="off" required />
          </Field>
          <Field label="Demo email domain" htmlFor="demoDomain" hint="e.g. category-checker@example.com">
            <Input id="demoDomain" name="demoDomain" defaultValue="example.com" />
          </Field>
        </div>
      ) : null}
      <StateNotice state={state} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Complete setup
      </Button>
    </form>
  );
}
