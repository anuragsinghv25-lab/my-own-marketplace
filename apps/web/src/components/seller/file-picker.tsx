'use client';

import { useRef, useTransition } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { Button, toast } from '@orbita/ui';
import { uploadFileAction } from '@/app/(app)/seller/actions';

export interface PickedFile {
  id: string;
  filename: string;
}

/** Uploads PDFs or images (up to 4 MB each) for the organisation and keeps the list of attached files. */
export function FilePicker({ orgId, value, onChange, label = 'Attach a file', max = 10, disabled }: { orgId: string; value: PickedFile[]; onChange: (v: PickedFile[]) => void; label?: string; max?: number; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    start(async () => {
      const added: PickedFile[] = [];
      for (const f of Array.from(files).slice(0, max - value.length)) {
        const form = new FormData();
        form.set('file', f);
        const s = await uploadFileAction(orgId, form);
        if (s.status === 'ok') added.push(s.data as unknown as PickedFile);
        else if (s.status === 'error') toast.error(`${f.name}: ${s.message}`);
      }
      if (added.length) onChange([...value, ...added]);
      if (input.current) input.current.value = '';
    });
  };
  return (
    <div className="space-y-2">
      {value.length ? (
        <ul className="space-y-1.5">
          {value.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-lg bg-soft/60 px-3 py-1.5 text-sm">
              <FileText size={15} className="text-mute shrink-0" />
              <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="truncate hover:underline">{f.filename}</a>
              {!disabled ? (
                <button type="button" className="ml-auto text-mute hover:text-ink" aria-label={`Remove ${f.filename}`} onClick={() => onChange(value.filter((x) => x.id !== f.id))}>
                  <X size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!disabled && value.length < max ? (
        <>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple={max > 1} className="hidden" aria-label={label} onChange={(e) => upload(e.target.files)} />
          <Button type="button" variant="secondary" size="sm" loading={pending} onClick={() => input.current?.click()}>
            <Paperclip size={14} /> {label}
          </Button>
          <span className="ml-2 text-xs text-mute">PDF, JPG, PNG or WebP, up to 4 MB</span>
        </>
      ) : null}
    </div>
  );
}

/** Links to files already stored (read-only). */
export function FileLinks({ files }: { files: { id: string; filename: string }[] }) {
  if (!files.length) return <span className="text-sm text-mute">None</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {files.map((f) => (
        <li key={f.id}>
          <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-soft px-2.5 py-1 text-sm hover:underline">
            <FileText size={14} className="text-mute" /> {f.filename}
          </a>
        </li>
      ))}
    </ul>
  );
}
