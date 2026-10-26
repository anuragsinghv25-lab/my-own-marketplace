import { describe, expect, it } from 'vitest';
import { ROLES, ROLE_KEYS, defineAbilityFor, type RoleKey } from '@orbita/authz';
import { navigationFor } from '@/lib/navigation';

const nav = (role: RoleKey) => {
  const scope = ROLES[role].scopes[0]!;
  return navigationFor(
    defineAbilityFor({
      userId: '11111111-1111-4111-8111-111111111111',
      grants: [{ role, scopeType: scope, scopeId: scope === 'global' ? null : '22222222-2222-4222-8222-222222222222' }],
    }),
  );
};
const hrefs = (role: RoleKey) => nav(role).flatMap((s) => s.items.map((i) => i.href));

describe('role-driven navigation', () => {
  it('every role sees exactly one area: its home', () => {
    for (const role of ROLE_KEYS) {
      expect(nav(role).map((s) => s.area), role).toEqual([ROLES[role].home]);
    }
  });

  it('only user administrators see Users and Roles', () => {
    for (const role of ROLE_KEYS) {
      const seesUsers = hrefs(role).includes('/admin/users');
      expect(seesUsers, role).toBe(role === 'platform_admin' || role === 'auditor');
    }
  });

  it('a category checker sees only the workbench', () => {
    expect(hrefs('category_checker')).toEqual(['/workbench', '/workbench/taxonomy', '/workbench/versions']);
  });

  it('approvals are shown to approvers only', () => {
    expect(hrefs('category_approver')).toContain('/workbench/approvals');
    expect(hrefs('category_drafter')).not.toContain('/workbench/approvals');
  });

  it('the audit log is for platform admins and auditors', () => {
    const withAudit = ROLE_KEYS.filter((r) => hrefs(r).includes('/admin/audit'));
    expect(withAudit.sort()).toEqual(['auditor', 'platform_admin']);
  });
});
