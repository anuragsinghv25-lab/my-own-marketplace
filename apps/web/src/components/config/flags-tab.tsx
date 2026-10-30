'use client';

import { useState } from 'react';
import { Lock, RotateCcw } from 'lucide-react';
import type { EffectiveFlag } from '@orbita/category-config';
import { Badge, Button, Card, CardHeader, Field, Select, Switch, cn } from '@orbita/ui';
import { applyProfileAction, clearFlagAction, setFlagAction } from '@/app/(app)/workbench/versions/actions';
import { useRunner } from '@/components/common/use-runner';
import { FlagValueInput, formatFlagValue } from '@/components/library/flags';

const GROUPS: Record<string, string> = { category: 'Category', seller: 'Sellers', buyer: 'Buyers', marketplace: 'Marketplace', transactional: 'Buying side (read-only)' };
const SOURCE: Record<EffectiveFlag['source'], { label: string; tone: 'neutral' | 'accent' | 'warn' | 'bad' }> = {
  default: { label: 'Platform default', tone: 'neutral' },
  profile: { label: 'From profile', tone: 'accent' },
  version: { label: 'Set here', tone: 'warn' },
  none: { label: 'Needs a decision', tone: 'bad' },
};

export function FlagsTab({
  versionId,
  ws,
  editable,
}: {
  versionId: string;
  ws: { flags: EffectiveFlag[]; profiles: { id: string; name: string; version: number }[]; profile: { id: string; name: string; version: number; outdated: boolean } | null };
  editable: boolean;
}) {
  const [all, setAll] = useState(false);
  const [profileId, setProfileId] = useState(ws.profile?.id ?? '');
  const { pending, run } = useRunner();
  // the exceptions view: what was set here or still needs deciding; everything else follows the profile or default
  const attention = ws.flags.filter((f) => f.source === 'version' || f.source === 'none');
  const shown = all ? ws.flags : attention;
  const groups = [...new Set(shown.map((f) => f.group))];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Flag profile" description="A profile sets most flags at once. Values set here override it; everything else follows the platform default." />
        <div className="border-t border-line px-5 py-4 flex flex-wrap items-end gap-3">
          <Field label="Profile" htmlFor="fl-profile" className="min-w-[260px]">
            <Select id="fl-profile" value={profileId} onChange={(e) => setProfileId(e.target.value)} disabled={!editable}>
              <option value="">No profile</option>
              {ws.profiles.map((p) => <option key={p.id} value={p.id}>{p.name} (v{p.version})</option>)}
            </Select>
          </Field>
          {editable ? (
            <Button variant="secondary" loading={pending} disabled={profileId === (ws.profile?.id ?? '') && !ws.profile?.outdated} onClick={() => run(() => applyProfileAction(versionId, profileId || null))}>
              {ws.profile?.outdated && profileId === ws.profile.id ? 'Re-apply latest' : 'Apply'}
            </Button>
          ) : null}
          {ws.profile?.outdated ? <p className="text-sm text-warn">The profile changed since it was applied here.</p> : null}
        </div>
      </Card>

      <Card>
        <CardHeader
          title={all ? 'All flags' : attention.length ? `${attention.length} flag${attention.length === 1 ? '' : 's'} set here or needing a decision` : 'Nothing needs your attention'}
          description={all ? 'Every flag, grouped by who it affects.' : `The other ${ws.flags.length - attention.length} flags follow the profile or the platform default.`}
          actions={<Switch checked={all} onCheckedChange={setAll} label="Show all" />}
        />
        {groups.map((g) => (
          <section key={g} className="border-t border-line">
            <h3 className="px-5 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-mute">{GROUPS[g] ?? g}</h3>
            <ul className="divide-y divide-line">
              {shown.filter((f) => f.group === g).map((f) => (
                <FlagRow key={f.key} versionId={versionId} f={f} editable={editable && !f.readOnly} />
              ))}
            </ul>
          </section>
        ))}
        {!shown.length ? <p className="border-t border-line px-5 py-4 text-sm text-mute">Switch on “Show all” to change any flag.</p> : null}
      </Card>
    </div>
  );
}

function FlagRow({ versionId, f, editable }: { versionId: string; f: EffectiveFlag; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<unknown>(f.value);
  const { pending, run } = useRunner();
  const def = { valueType: f.valueType, schema: f.schema, label: f.label };
  const inherited = f.source === 'version' ? (f.profileValue !== undefined ? `Profile: ${formatFlagValue(def, f.profileValue)}` : `Default: ${formatFlagValue(def, f.defaultValue)}`) : null;
  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="text-sm font-medium flex items-center gap-1.5">
            {f.label} {f.readOnly ? <Lock size={12} className="text-mute" aria-label="read-only" /> : null}
          </div>
          {f.helpText ? <div className="text-xs text-mute mt-0.5">{f.helpText}</div> : null}
        </div>
        {!editing ? (
          <>
            <div className="text-sm text-right min-w-[140px]">
              <div className={cn(f.source === 'none' && 'text-bad')}>{formatFlagValue(def, f.value)}</div>
              {inherited ? <div className="text-[11px] text-mute">{inherited}</div> : null}
            </div>
            <Badge tone={SOURCE[f.source].tone}>{SOURCE[f.source].label}</Badge>
            {editable ? (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setValue(f.value); setEditing(true); }}>Change</Button>
                {f.source === 'version' ? (
                  <Button size="icon" variant="ghost" aria-label={`Reset ${f.label}`} loading={pending} onClick={() => run(() => clearFlagAction(versionId, f.key))}><RotateCcw size={14} /></Button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-soft p-3">
          <FlagValueInput id={`flag-${f.key}`} def={def} value={value} onChange={setValue} />
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" loading={pending} onClick={() => run(() => setFlagAction(versionId, f.key, value), () => setEditing(false))}>Save</Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
