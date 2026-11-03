'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { ZONES } from '@orbita/sellers/india';
import { Button, Checkbox, Dialog, Field, Input, Textarea } from '@orbita/ui';
import { decideAuthorisationAction, revokeAuthorisationAction } from '@/app/(app)/seller/actions';
import { useRunner } from '@/components/common/use-runner';

export function GrantButtons({ id, resellerName, brandName, categories }: { id: string; resellerName: string; brandName: string; categories: { id: string; name: string }[] }) {
  const [open, setOpen] = useState<null | 'grant' | 'decline'>(null);
  const [cats, setCats] = useState(categories.map((c) => c.id));
  const [zones, setZones] = useState<string[]>([]);
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const { pending, run } = useRunner();
  const toggle = (list: string[], set: (v: string[]) => void, v: string, on: boolean) => set(on ? [...list, v] : list.filter((x) => x !== v));
  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => setOpen('grant')}><Check size={14} /> Grant</Button>
      <Button size="sm" variant="secondary" onClick={() => setOpen('decline')}><X size={14} /> Decline</Button>
      {open === 'grant' ? (
        <Dialog
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={`Authorise ${resellerName} to sell ${brandName}`}
          description="Give only what you are comfortable with. You can revoke it later."
          footer={<><Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button><Button loading={pending} disabled={!cats.length} onClick={() => run(() => decideAuthorisationAction(id, { grant: true, categoryIds: cats, regions: zones as never, validUntil: until || null, note }), () => setOpen(null))}>Grant</Button></>}
        >
          <div className="space-y-4">
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium mb-1">Categories</legend>
              {categories.map((c) => <label key={c.id} className="flex items-center gap-2 text-sm"><Checkbox checked={cats.includes(c.id)} onChange={(e) => toggle(cats, setCats, c.id, e.target.checked)} /> {c.name}</label>)}
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium mb-1">Zones <span className="text-mute font-normal">(none = everywhere)</span></legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {ZONES.map((z) => <label key={z} className="flex items-center gap-2 text-sm"><Checkbox checked={zones.includes(z)} onChange={(e) => toggle(zones, setZones, z, e.target.checked)} /> {z}</label>)}
              </div>
            </fieldset>
            <Field label="Valid until (optional)" htmlFor="gr-until"><Input id="gr-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
            <Field label="Note (optional)" htmlFor="gr-note"><Textarea id="gr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
        </Dialog>
      ) : null}
      {open === 'decline' ? (
        <Dialog
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={`Decline ${resellerName}`}
          footer={<><Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button><Button variant="danger" loading={pending} disabled={note.trim().length < 5} onClick={() => run(() => decideAuthorisationAction(id, { grant: false, note }), () => setOpen(null))}>Decline</Button></>}
        >
          <Field label="Why?" htmlFor="dc-note" hint="The reseller sees this."><Textarea id="dc-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </Dialog>
      ) : null}
    </div>
  );
}

export function RevokeButton({ id, resellerName }: { id: string; resellerName: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const { pending, run } = useRunner();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Revoke</Button>
      {open ? (
        <Dialog open onOpenChange={setOpen} title={`Revoke ${resellerName}`} description="Their approval ends now; listings follow in R5." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" loading={pending} disabled={note.trim().length < 5} onClick={() => run(() => revokeAuthorisationAction(id, note), () => setOpen(false))}>Revoke</Button></>}>
          <Field label="Why?" htmlFor="rv-note"><Textarea id="rv-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </Dialog>
      ) : null}
    </>
  );
}
