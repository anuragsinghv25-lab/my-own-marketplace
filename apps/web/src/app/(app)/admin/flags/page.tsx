import type { Metadata } from 'next';
import { getDb } from '@orbita/db';
import { listFlagDefinitions, listFlagProfiles } from '@orbita/library';
import { PageHeader } from '@orbita/ui';
import { TabLinks } from '@/components/common/tab-links';
import { FlagDefinitionsTab, FlagProfilesTab, type FlagDef, type ProfileRow } from '@/components/library/flags';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Flags & profiles' };

const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export default async function FlagsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requirePermission('read', 'FlagProfile');
  const tab = (await searchParams).tab === 'definitions' ? 'definitions' : 'profiles';
  const db = getDb();
  const [defs, profiles] = await Promise.all([listFlagDefinitions(db, session.ability), listFlagProfiles(db, session.ability)]);
  const canEdit = session.ability.can('update', 'FlagProfile');
  return (
    <>
      <PageHeader
        eyebrow="Admin console"
        title="Flags & profiles"
        description="Flags are the configuration switches of a category (pricing, sellers, certificates, media). Profiles bundle common settings so categories start mostly configured."
      />
      <TabLinks
        base="/admin/flags"
        current={tab}
        tabs={[
          { key: 'profiles', label: 'Profiles', count: profiles.length },
          { key: 'definitions', label: 'Flag definitions', count: defs.length },
        ]}
      />
      {tab === 'profiles' ? (
        <FlagProfilesTab rows={plain(profiles) as ProfileRow[]} defs={plain(defs) as FlagDef[]} canEdit={canEdit} />
      ) : (
        <FlagDefinitionsTab rows={plain(defs) as FlagDef[]} canEdit={canEdit} />
      )}
    </>
  );
}
