'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Download, FileSpreadsheet, Globe, Hash, RefreshCw, Upload } from 'lucide-react';
import type { StandardStatus } from '@orbita/standards';
import { parseCsv, parseUnspscRows, unspscLevel, type UnspscEntry } from '@orbita/standards/unspsc';
import { Badge, Button, Card, Field, Input, toast } from '@orbita/ui';
import { importUnspscChunkAction, loadShopifyPartAction } from '@/app/(app)/admin/standards/actions';
import { formatDateTime } from '@/lib/format';

const CHUNK = 2000;

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="mt-4" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <div className="flex justify-between text-xs text-mute mb-1.5"><span>{label}</span><span>{Math.round(value * 100)}%</span></div>
      <div className="h-2 rounded-full bg-soft overflow-hidden">
        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${Math.max(2, value * 100)}%` }} />
      </div>
    </div>
  );
}

export function StandardsView({ status }: { status: StandardStatus[] }) {
  const shopify = status.find((s) => s.source === 'shopify')!;
  const unspsc = status.find((s) => s.source === 'unspsc')!;
  return (
    <div className="grid xl:grid-cols-2 gap-4 items-start">
      <ShopifyCard s={shopify} />
      <UnspscCard s={unspsc} />
      <Card className="xl:col-span-2 p-5 text-sm text-mute">
        <h3 className="font-semibold text-ink">How this fits together</h3>
        <ul className="mt-2 space-y-1.5 list-disc pl-5">
          <li>These are references, not the live tree. Nothing is visible to sellers until a category manager adopts a category in the Category tree (“Add from standard”).</li>
          <li>Adopted categories keep their standard id, so a later release of the standard can be compared and applied (R6).</li>
          <li>Adopting a Shopify category also brings its attributes into the library, reusing any attribute you already have with the same name.</li>
          <li>Any category, custom or adopted, can carry a UNSPSC code for procurement reporting; children inherit it.</li>
        </ul>
      </Card>
    </div>
  );
}

function ShopifyCard({ s }: { s: StandardStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState<{ done: number; total: number; name: string } | null>(null);
  const parts = s.parts ?? [];
  const outdated = !!s.version && s.version !== s.bundledVersion;
  const loaded = outdated ? [] : s.loadedParts;
  const remaining = parts.filter((p) => !loaded.includes(p.prefix));
  const total = parts.reduce((n, p) => n + p.categories, 0);

  async function load(list: typeof parts) {
    for (let i = 0; i < list.length; i++) {
      setBusy({ done: i, total: list.length, name: list[i]!.name });
      const r = await loadShopifyPartAction(list[i]!.prefix);
      if (r.status !== 'ok') {
        toast.error(r.status === 'error' ? r.message : 'Loading stopped.');
        setBusy(null);
        router.refresh();
        return;
      }
    }
    setBusy(null);
    toast.success(`Shopify ${s.bundledVersion} loaded.`);
    router.refresh();
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-accent/10 text-accent grid place-items-center shrink-0"><Globe size={20} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Shopify Standard Product Taxonomy</h2>
            {s.complete && !outdated ? <Badge tone="ok"><CheckCircle2 size={12} /> Loaded</Badge> : s.categoryCount ? <Badge tone="warn">Partly loaded</Badge> : <Badge>Not loaded</Badge>}
          </div>
          <p className="text-sm text-mute mt-0.5">
            {total.toLocaleString()} categories in {parts.length} verticals, each with the attributes that describe its products. Release {s.bundledVersion}, shipped with Orbita (MIT licence).
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        {[
          ['Loaded release', s.version ?? '—'],
          ['Categories', s.categoryCount.toLocaleString()],
          ['Attributes', s.attributeCount.toLocaleString()],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-soft p-3">
            <dt className="text-[11px] text-mute">{k}</dt>
            <dd className="text-lg font-semibold tracking-tight">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {parts.map((p) => (
          <span key={p.prefix} className={`rounded-lg px-2 py-1 text-xs ${loaded.includes(p.prefix) ? 'bg-ok/10 text-ok' : 'bg-soft text-mute'}`} title={`${p.categories} categories`}>
            {p.name}
          </span>
        ))}
      </div>
      {busy ? <Progress value={busy.done / busy.total} label={`Loading ${busy.name} (${busy.done + 1} of ${busy.total})…`} /> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {outdated ? <p className="w-full text-sm text-warn">Release {s.version} is loaded; this build ships {s.bundledVersion}. Updating replaces the reference data only, never your adopted categories.</p> : null}
        {remaining.length ? (
          <Button loading={!!busy} onClick={() => load(remaining)}>
            <Download size={15} /> {outdated ? `Update to ${s.bundledVersion}` : loaded.length ? `Load the remaining ${remaining.length}` : `Load Shopify ${s.bundledVersion}`}
          </Button>
        ) : (
          <Button variant="secondary" loading={!!busy} onClick={() => load(parts)}>
            <RefreshCw size={15} /> Reload
          </Button>
        )}
        {s.updatedAt ? <span className="text-xs text-mute">Last change {formatDateTime(s.updatedAt)}</span> : null}
      </div>
    </Card>
  );
}

function UnspscCard({ s }: { s: StandardStatus }) {
  const router = useRouter();
  const [version, setVersion] = useState('');
  const [file, setFile] = useState<{ name: string; entries: UnspscEntry[]; skipped: number } | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  async function read(f: File) {
    setReading(true);
    try {
      let rows: unknown[][];
      if (/\.xlsx$/i.test(f.name)) {
        const { default: readExcelFile } = await import('read-excel-file/browser');
        const sheets = await readExcelFile(f);
        rows = sheets.flatMap((sh) => sh.data as unknown[][]);
      } else rows = parseCsv(await f.text());
      const { entries, skippedRows } = parseUnspscRows(rows);
      if (!entries.length) toast.error('No UNSPSC codes found. The file needs 8-digit codes with their titles next to them.');
      setFile({ name: f.name, entries, skipped: skippedRows });
      const v = f.name.match(/v?\d{2}[._]\d{4,6}/i)?.[0];
      if (v && !version) setVersion(v.startsWith('v') ? v : `v${v}`);
    } catch (e) {
      toast.error(`Could not read ${f.name}: ${(e as Error).message}`);
    } finally {
      setReading(false);
    }
  }

  async function upload() {
    if (!file) return;
    const chunks = Math.ceil(file.entries.length / CHUNK);
    for (let i = 0; i < chunks; i++) {
      setProgress(i / chunks);
      const r = await importUnspscChunkAction({
        version: version.trim(),
        first: i === 0,
        last: i === chunks - 1,
        rows: file.entries.slice(i * CHUNK, (i + 1) * CHUNK),
      });
      if (r.status !== 'ok') {
        toast.error(r.status === 'error' ? r.message : 'Import stopped.');
        setProgress(null);
        return;
      }
    }
    setProgress(null);
    setFile(null);
    toast.success(`UNSPSC ${version} imported: ${file.entries.length.toLocaleString()} codes.`);
    router.refresh();
  }

  const levels = file ? [1, 2, 3, 4].map((l) => file.entries.filter((e) => unspscLevel(e.code) === l).length) : [];

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-ai/10 text-ai grid place-items-center shrink-0"><Hash size={20} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">UNSPSC</h2>
            {s.complete ? <Badge tone="ok"><CheckCircle2 size={12} /> {s.version}</Badge> : <Badge>Not loaded</Badge>}
          </div>
          <p className="text-sm text-mute mt-0.5">
            The procurement codeset: segment › family › class › commodity. It is not shipped with Orbita; download it yourself and check its licence terms for your use, then upload it here.
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        {[
          ['Loaded version', s.version ?? '—'],
          ['Codes', s.categoryCount.toLocaleString()],
          ['Last change', s.updatedAt ? formatDateTime(s.updatedAt) : '—'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-soft p-3">
            <dt className="text-[11px] text-mute">{k}</dt>
            <dd className="text-sm font-semibold tracking-tight mt-1">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 space-y-4">
        <Field label="Codeset file" htmlFor="u-file" hint="Excel (.xlsx), CSV or TSV. Any layout that has 8-digit codes with their titles beside them works, including the flat Segment / Family / Class / Commodity export.">
          <label htmlFor="u-file" className="flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 cursor-pointer hover:bg-soft/60">
            <FileSpreadsheet size={20} className="text-mute" />
            <span className="text-sm">{reading ? 'Reading…' : file ? file.name : 'Choose a file'}</span>
            <input
              id="u-file"
              type="file"
              accept=".xlsx,.csv,.tsv,.txt"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void read(f);
              }}
            />
          </label>
        </Field>
        {file?.entries.length ? (
          <div className="rounded-xl bg-soft p-3.5 text-sm">
            <div className="font-medium">{file.entries.length.toLocaleString()} codes found</div>
            <div className="text-xs text-mute mt-0.5">
              {levels[0]} segments · {levels[1]} families · {levels[2]} classes · {levels[3]} commodities{file.skipped ? ` · ${file.skipped} rows without a code skipped` : ''}
            </div>
            <ul className="mt-2 text-xs space-y-0.5">
              {file.entries.slice(0, 4).map((e) => <li key={e.code}><code>{e.code}</code> {e.title}</li>)}
            </ul>
          </div>
        ) : null}
        <Field label="Version" htmlFor="u-version" hint="As published, e.g. v26.0801. Shown wherever the codes are used.">
          <Input id="u-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v26.0801" />
        </Field>
        {progress !== null ? <Progress value={progress} label="Importing…" /> : null}
        <Button disabled={!file?.entries.length || !version.trim()} loading={progress !== null} onClick={upload}>
          <Upload size={15} /> {s.version ? 'Replace UNSPSC' : 'Import UNSPSC'}
        </Button>
      </div>
    </Card>
  );
}
