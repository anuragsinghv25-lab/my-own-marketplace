'use client';

import { useState } from 'react';
import { Check, RotateCcw, Trash2, X } from 'lucide-react';
import { Button, Dialog, Field, Input, Select, Textarea } from '@orbita/ui';
import { addProhibitedAction, removeProhibitedAction } from '@/app/(app)/admin/brand-names/actions';
import { reviveBlockAction, verifyCertificateAction } from '@/app/(app)/reviews/seller-actions';
import { useRunner } from '@/components/common/use-runner';

export function CertificateVerdict({ id }: { id: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const { pending, run } = useRunner();
  return (
    <div className="flex gap-2">
      <Button size="sm" loading={pending} onClick={() => run(() => verifyCertificateAction(id, true, ''))}><Check size={14} /> Verify</Button>
      <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}><X size={14} /> Reject</Button>
      {rejecting ? (
        <Dialog open onOpenChange={setRejecting} title="Reject the certificate" footer={<><Button variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button><Button variant="danger" loading={pending} disabled={note.trim().length < 5} onClick={() => run(() => verifyCertificateAction(id, false, note), () => setRejecting(false))}>Reject</Button></>}>
          <Field label="Why?" htmlFor="cv-note" hint="The seller sees this."><Textarea id="cv-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </Dialog>
      ) : null}
    </div>
  );
}

export function ReviveButton({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const { pending, run } = useRunner();
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><RotateCcw size={14} /> Revive</Button>
      {open ? (
        <Dialog open onOpenChange={setOpen} title={`Revive ${label}`} description="Sellers can ask for this brand in this category again." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} disabled={note.trim().length < 5} onClick={() => run(() => reviveBlockAction(id, note), () => setOpen(false))}>Revive</Button></>}>
          <Field label="Why may it be sold again?" htmlFor="rb-note"><Textarea id="rb-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </Dialog>
      ) : null}
    </>
  );
}

export function AddProhibited() {
  const [f, setF] = useState({ name: '', list: 'prohibited', reason: '' });
  const { pending, run } = useRunner();
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_200px_1fr_auto] items-end">
      <Field label="Name" htmlFor="pn-name"><Input id="pn-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="List" htmlFor="pn-list">
        <Select id="pn-list" value={f.list} onChange={(e) => setF({ ...f, list: e.target.value })}>
          <option value="prohibited">Prohibited</option>
          <option value="negative">Not a brand</option>
          <option value="legally_rejected">Legally rejected</option>
        </Select>
      </Field>
      <Field label="Reason" htmlFor="pn-reason"><Input id="pn-reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      <Button loading={pending} disabled={f.name.trim().length < 2} onClick={() => run(() => addProhibitedAction(f as never), () => setF({ name: '', list: f.list, reason: '' }))}>Add</Button>
    </div>
  );
}

export function RemoveProhibited({ id, name }: { id: string; name: string }) {
  const { pending, run } = useRunner();
  return <Button variant="ghost" size="icon" aria-label={`Remove ${name}`} loading={pending} onClick={() => run(() => removeProhibitedAction(id))}><Trash2 size={15} /></Button>;
}
