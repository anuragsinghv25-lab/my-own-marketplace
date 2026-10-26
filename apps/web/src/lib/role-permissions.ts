import { ROLES, defineAbilityFor, type RoleKey } from '@orbita/authz';

const SAMPLE_USER = '00000000-0000-4000-8000-000000000000';

/** Human-readable "can do" lines for a role, derived from the real CASL rules (never hand-maintained). */
export function permissionsOf(role: RoleKey): string[] {
  const scope = ROLES[role].scopes[0]!;
  const ability = defineAbilityFor({
    userId: SAMPLE_USER,
    grants: [{ role, scopeType: scope, scopeId: scope === 'global' ? null : SAMPLE_USER }],
  });
  const lines: string[] = [];
  for (const rule of ability.rules) {
    if (rule.inverted) continue;
    const actions = ([] as string[]).concat(rule.action as string | string[]);
    const subjects = ([] as string[]).concat(rule.subject as string | string[]);
    // Skip the baseline every signed-in user has.
    if (subjects.includes('DesignGallery') || (subjects.includes('User') && rule.conditions && 'id' in rule.conditions)) continue;
    const cond = rule.conditions
      ? ' (' +
        Object.entries(rule.conditions)
          .map(([k, v]) => (k === 'state' ? `when ${String(v).toLowerCase().replace('_', ' ')}` : `own ${k.replace(/Id$/, '')}`))
          .join(', ') +
        ')'
      : '';
    lines.push(`${actions.join(', ')} · ${subjects.map(humanise).join(', ')}${cond}`);
  }
  return lines;
}

const humanise = (s: string) =>
  s === 'all'
    ? 'everything'
    : s
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase());
