'use client';

import { useMemo, useState, useTransition } from 'react';
import { CheckCircle2, MailCheck } from 'lucide-react';
import { CodeStep } from './register-code';
import { gstinProblem, normalizeGstin, PAN_HOLDER } from '@orbita/sellers/india';
import { Button, Checkbox, Field, Input, Select } from '@orbita/ui';
import { registerSellerAction } from '@/app/(auth)/register/actions';
import type { ActionState } from '@/lib/action-state';
import { Notice } from './auth-frame';

const TYPES = [
  ['private_limited', 'Private limited company'],
  ['public_limited', 'Public limited company'],
  ['llp', 'Limited liability partnership'],
  ['partnership', 'Partnership firm'],
  ['proprietorship', 'Proprietorship'],
  ['other', 'Other'],
] as const;

/** Self sign-up: the business (checked against its GSTIN as you type), you, and the registered office. */
export function RegisterForm({ states }: { states: { code: string; name: string }[] }) {
  const [f, setF] = useState({ legalName: '', tradeName: '', businessType: 'private_limited', gstin: '', contactName: '', email: '', phone: '', line1: '', line2: '', city: '', pincode: '', password: '', confirm: '', acceptTerms: false, website2: '' });
  const [haveCode, setHaveCode] = useState(false);
  const [state, setState] = useState<ActionState>({ status: 'idle' });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });
  const g = normalizeGstin(f.gstin);
  const gstProblem = g.length >= 15 ? gstinProblem(g) : null;
  const gstInfo = useMemo(() => (g.length === 15 && !gstProblem ? { state: states.find((s) => s.code === g.slice(0, 2))?.name, pan: g.slice(2, 12), holder: PAN_HOLDER[g[5]!] } : null), [g, gstProblem, states]);
  const err = (k: string) => (state.status === 'error' ? state.fieldErrors?.[k]?.[0] ?? state.fieldErrors?.[`address.${k}`]?.[0] : undefined);

  if (state.status === 'ok' || haveCode) {
    const email = state.status === 'ok' ? String(state.data?.email ?? f.email) : '';
    return <CodeStep email={email} password={state.status === 'ok' ? f.password : ''} message={state.status === 'ok' ? state.message : undefined} icon={<MailCheck size={22} />} onBack={() => { setHaveCode(false); setState({ status: 'idle' }); }} />;
  }

  const mismatch = f.confirm.length > 0 && f.confirm !== f.password;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password !== f.confirm) return setState({ status: 'error', message: 'The two passwords do not match.' });
    start(async () =>
      setState(
        await registerSellerAction({
          legalName: f.legalName,
          tradeName: f.tradeName,
          businessType: f.businessType as never,
          gstin: f.gstin,
          contactName: f.contactName,
          email: f.email,
          phone: f.phone,
          address: { line1: f.line1, line2: f.line2, city: f.city, pincode: f.pincode },
          password: f.password,
          acceptTerms: f.acceptTerms as true,
          website2: f.website2,
        }),
      ),
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {state.status === 'error' ? <Notice tone="bad">{state.message}</Notice> : null}
      <fieldset className="space-y-3">
        <legend className="text-xs font-medium uppercase tracking-wider text-mute mb-1">Your business</legend>
        <Field label="GSTIN" htmlFor="rg-gstin" required error={gstProblem ?? err('gstin')} hint={gstInfo ? <span className="inline-flex items-center gap-1 text-ok"><CheckCircle2 size={12} /> {gstInfo.state} · PAN {gstInfo.pan}{gstInfo.holder ? ` (${gstInfo.holder})` : ''}</span> : '15 characters, e.g. 27AAPFU0939F1ZV'}>
          <Input id="rg-gstin" value={f.gstin} onChange={set('gstin')} maxLength={18} autoComplete="off" className="font-mono uppercase" />
        </Field>
        <Field label="Legal name" htmlFor="rg-legal" required error={err('legalName')} hint="As on the GST certificate">
          <Input id="rg-legal" value={f.legalName} onChange={set('legalName')} autoComplete="organization" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Trade name" htmlFor="rg-trade">
            <Input id="rg-trade" value={f.tradeName} onChange={set('tradeName')} />
          </Field>
          <Field label="Business type" htmlFor="rg-type">
            <Select id="rg-type" value={f.businessType} onChange={set('businessType')}>
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-xs font-medium uppercase tracking-wider text-mute mb-1">You</legend>
        <Field label="Your name" htmlFor="rg-name" required error={err('contactName')}>
          <Input id="rg-name" value={f.contactName} onChange={set('contactName')} autoComplete="name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Work email" htmlFor="rg-email" required error={err('email')}>
            <Input id="rg-email" type="email" value={f.email} onChange={set('email')} autoComplete="email" />
          </Field>
          <Field label="Mobile" htmlFor="rg-phone" required error={err('phone')}>
            <Input id="rg-phone" type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="98450 12345" />
          </Field>
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-xs font-medium uppercase tracking-wider text-mute mb-1">Registered office</legend>
        <Field label="Address" htmlFor="rg-line1" required error={err('line1')}>
          <Input id="rg-line1" value={f.line1} onChange={set('line1')} autoComplete="address-line1" />
        </Field>
        <Input aria-label="Address line 2" value={f.line2} onChange={set('line2')} autoComplete="address-line2" placeholder="Area, landmark (optional)" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" htmlFor="rg-city" required error={err('city')}>
            <Input id="rg-city" value={f.city} onChange={set('city')} autoComplete="address-level2" />
          </Field>
          <Field label="PIN code" htmlFor="rg-pin" required error={err('pincode')} hint={gstInfo?.state ? `State: ${gstInfo.state} (from GSTIN)` : undefined}>
            <Input id="rg-pin" inputMode="numeric" maxLength={6} value={f.pincode} onChange={set('pincode')} autoComplete="postal-code" />
          </Field>
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-xs font-medium uppercase tracking-wider text-mute mb-1">Password</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Choose a password" htmlFor="rg-pw" required error={err('password')} hint="10+ characters, a letter and a number">
            <Input id="rg-pw" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" />
          </Field>
          <Field label="Repeat it" htmlFor="rg-pw2" required error={mismatch ? 'Does not match' : undefined}>
            <Input id="rg-pw2" type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />
          </Field>
        </div>
      </fieldset>
      {/* real people never see this field */}
      <input type="text" name="website2" value={f.website2} onChange={set('website2') as never} tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={f.acceptTerms} onChange={set('acceptTerms')} className="mt-0.5" />
        <span>I accept the seller terms and confirm the details above are correct.</span>
      </label>
      {err('acceptTerms') ? <p className="text-xs text-bad -mt-2">{err('acceptTerms')}</p> : null}
      <Button type="submit" className="w-full" loading={pending} disabled={!f.acceptTerms || !!gstProblem || mismatch}>
        Register
      </Button>
      <p className="text-center text-sm text-mute">
        Registered already?{' '}
        <button type="button" onClick={() => setHaveCode(true)} className="text-accent hover:underline">I have a code</button>
      </p>
    </form>
  );
}
