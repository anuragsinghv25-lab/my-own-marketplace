'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Dialog, Field, Input, Select, Textarea } from '@orbita/ui';
import { addCertificateAction } from '@/app/(app)/seller/actions';
import { useRunner } from '@/components/common/use-runner';
import { FilePicker, type PickedFile } from './file-picker';

export function AddCertificateButton({ orgId, types }: { orgId: string; types: { id: string; name: string; issuer: string; hasExpiry: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ typeId: types[0]?.id ?? '', number: '', issuer: types[0]?.issuer ?? '', validFrom: '', validUntil: '', scope: '' });
  const [file, setFile] = useState<PickedFile[]>([]);
  const { pending, run } = useRunner();
  const type = types.find((t) => t.id === f.typeId);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(k === 'typeId' ? { ...f, typeId: e.target.value, issuer: types.find((t) => t.id === e.target.value)?.issuer ?? f.issuer } : { ...f, [k]: e.target.value });
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Add certificate</Button>
      {open ? (
        <Dialog
          open
          onOpenChange={setOpen}
          title="Add a certificate"
          description="A reviewer checks it against the issuer’s records. Verified certificates are reused when you list products."
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} disabled={!file.length} onClick={() => run(() => addCertificateAction(orgId, { ...f, validFrom: f.validFrom || null, validUntil: f.validUntil || null, fileId: file[0]!.id }), () => setOpen(false))}>Add</Button></>}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="ce-type" className="sm:col-span-2">
              <Select id="ce-type" value={f.typeId} onChange={set('typeId')}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
            </Field>
            <Field label="Certificate number" htmlFor="ce-num"><Input id="ce-num" value={f.number} onChange={set('number')} /></Field>
            <Field label="Issued by" htmlFor="ce-iss"><Input id="ce-iss" value={f.issuer} onChange={set('issuer')} /></Field>
            <Field label="Valid from" htmlFor="ce-from"><Input id="ce-from" type="date" value={f.validFrom} onChange={set('validFrom')} /></Field>
            <Field label={`Valid until${type?.hasExpiry ? '' : ' (if it expires)'}`} htmlFor="ce-until"><Input id="ce-until" type="date" value={f.validUntil} onChange={set('validUntil')} /></Field>
            <Field label="What it covers" htmlFor="ce-scope" className="sm:col-span-2"><Textarea id="ce-scope" rows={2} value={f.scope} onChange={set('scope')} placeholder="Models, product lines or sites" /></Field>
            <div className="sm:col-span-2"><FilePicker orgId={orgId} value={file} onChange={setFile} label="Attach the certificate" max={1} /></div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
