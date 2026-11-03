'use client';

import { useState } from 'react';
import { Plus, Send, X } from 'lucide-react';
import { Button, Checkbox, Field, Input, Radio, Textarea } from '@orbita/ui';
import { saveAssessmentAction, withdrawAssessmentAction } from '@/app/(app)/seller/actions';
import { useRunner } from '@/components/common/use-runner';
import { FilePicker, type PickedFile } from './file-picker';

const TYPES = [
  { value: 'oem', label: 'OEM', text: 'You design and make the products in your own factory.' },
  { value: 'deemed_oem', label: 'Deemed OEM', text: 'You own the brand and a contract manufacturer makes it for you.' },
  { value: 'oem_fabricator', label: 'OEM fabricator', text: 'You assemble or fabricate from bought-in parts in your own facility.' },
] as const;

/** The vendor assessment draft: what kind of maker, which brands, where, and the evidence. */
export function VaForm({ orgId, initial, addresses, canSubmit }: { orgId: string; initial: { id: string | null; oemType: string; brandNames: string[]; addressIds: string[]; files: PickedFile[]; description: string }; addresses: { id: string; label: string; city: string }[]; canSubmit: boolean }) {
  const [f, setF] = useState(initial);
  const [brand, setBrand] = useState('');
  const { pending, run } = useRunner();
  const save = (submit: boolean) =>
    run(() => saveAssessmentAction(orgId, f.id, { oemType: f.oemType as never, brandNames: f.brandNames, addressIds: f.addressIds, fileIds: f.files.map((x) => x.id), description: f.description }, submit), (s) => setF({ ...f, id: (s.data as { id: string }).id }));
  const addBrand = () => {
    const b = brand.trim();
    if (b && !f.brandNames.includes(b)) setF({ ...f, brandNames: [...f.brandNames, b] });
    setBrand('');
  };
  return (
    <div className="space-y-5">
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="text-sm font-medium mb-2">What kind of manufacturer are you?</legend>
        {TYPES.map((t) => (
          <label key={t.value} className="flex gap-2 rounded-xl border border-line p-3 text-sm cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent/5">
            <Radio name="oemType" checked={f.oemType === t.value} onChange={() => setF({ ...f, oemType: t.value })} className="mt-0.5" />
            <span><span className="font-medium">{t.label}</span><span className="block text-mute text-xs mt-0.5">{t.text}</span></span>
          </label>
        ))}
      </fieldset>
      <Field label="Brands you make" htmlFor="va-brand" hint="Each becomes yours on approval: you then decide who may resell it.">
        <div className="flex gap-2">
          <Input id="va-brand" value={brand} onChange={(e) => setBrand(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBrand(); } }} placeholder="NOVARA" />
          <Button type="button" variant="secondary" onClick={addBrand}><Plus size={14} /> Add</Button>
        </div>
      </Field>
      {f.brandNames.length ? (
        <ul className="flex flex-wrap gap-1.5 -mt-3">
          {f.brandNames.map((b) => (
            <li key={b} className="inline-flex items-center gap-1 rounded-full bg-accent/10 text-accent px-2.5 py-1 text-sm font-medium">
              {b}
              <button type="button" aria-label={`Remove ${b}`} onClick={() => setF({ ...f, brandNames: f.brandNames.filter((x) => x !== b) })}><X size={13} /></button>
            </li>
          ))}
        </ul>
      ) : null}
      <fieldset>
        <legend className="text-sm font-medium mb-1.5">Manufacturing addresses</legend>
        {addresses.length ? (
          <div className="space-y-1.5">
            {addresses.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.addressIds.includes(a.id)} onChange={(e) => setF({ ...f, addressIds: e.target.checked ? [...f.addressIds, a.id] : f.addressIds.filter((x) => x !== a.id) })} /> {a.label || 'Factory'}, {a.city}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-mute">Add a manufacturing address under Organisation → Addresses first.</p>
        )}
      </fieldset>
      <Field label="Evidence" htmlFor="va-files" hint="Factory licence, BIS registration, production photos or raw-material invoices.">
        <FilePicker orgId={orgId} value={f.files} onChange={(files) => setF({ ...f, files })} label="Attach evidence" />
      </Field>
      <Field label="Anything the reviewer should know" htmlFor="va-desc">
        <Textarea id="va-desc" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        {f.id ? <Button variant="ghost" loading={pending} onClick={() => run(() => withdrawAssessmentAction(f.id!))}>Delete draft</Button> : null}
        <Button variant="secondary" loading={pending} onClick={() => save(false)}>Save draft</Button>
        <Button loading={pending} disabled={!canSubmit} onClick={() => save(true)}><Send size={15} /> Submit for assessment</Button>
      </div>
      {!canSubmit ? <p className="text-xs text-mute text-right">You can submit once your organisation is verified.</p> : null}
    </div>
  );
}
