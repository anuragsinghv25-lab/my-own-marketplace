import type { AppAbility, Area } from '@orbita/authz';
import { BLURBS } from './blurbs';
import { navigationFor } from './navigation';

export function upcomingFor(ability: AppAbility, area: Area) {
  const section = navigationFor(ability).find((s) => s.area === area);
  return (section?.items ?? [])
    .filter((i) => i.release)
    .map((i) => ({ ...i, blurb: BLURBS[i.href] ?? '' }));
}
