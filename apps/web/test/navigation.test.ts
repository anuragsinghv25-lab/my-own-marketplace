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
  const areas = (role: RoleKey) => nav(role).map((s) => s.area);

  it('every role sees its home area; only the approver spans two areas', () => {
    for (const role of ROLE_KEYS) {
      expect(areas(role), role).toContain(ROLES[role].home);
      expect(areas(role).length, role).toBe(role === 'approver' ? 2 : 1);
    }
    expect(areas('approver')).toEqual(['Workbench', 'ReviewDesk']);
  });

  it('only user administrators see Users and Roles', () => {
    for (const role of ROLE_KEYS) {
      expect(hrefs(role).includes('/admin/users'), role).toBe(role === 'platform_admin' || role === 'auditor');
    }
  });

  it('the platform admin sees users, audit and shared configuration (R1, R1.1)', () => {
    expect(hrefs('platform_admin')).toEqual([
      '/admin',
      '/admin/users',
      '/admin/roles',
      '/admin/audit',
      '/admin/library',
      '/admin/standards',
      '/admin/flags',
      '/admin/workgroups',
    ]);
    const live = nav('platform_admin').flatMap((s) => s.items).filter((i) => !i.release);
    expect(live.map((i) => i.href)).toContain('/admin/library');
  });

  it('the category tree is live for category managers and approvers', () => {
    for (const r of ['category_manager', 'approver'] as const) {
      const tree = nav(r).flatMap((s) => s.items).find((i) => i.href === '/workbench/taxonomy');
      expect(tree?.release, r).toBeUndefined();
    }
  });

  it('a category manager sees only the workbench, without approvals', () => {
    expect(hrefs('category_manager')).toEqual(['/workbench', '/workbench/taxonomy', '/workbench/versions']);
  });

  it('approvals and escalations go to the approver', () => {
    expect(hrefs('approver')).toContain('/workbench/approvals');
    expect(hrefs('approver')).toContain('/reviews/escalations');
    expect(hrefs('reviewer')).not.toContain('/workbench/approvals');
  });

  it('the reviewer sees every review queue', () => {
    expect(hrefs('reviewer')).toEqual(['/reviews', '/reviews/vendors', '/reviews/brands', '/reviews/catalogs', '/reviews/escalations']);
  });

  it('the audit log is for platform admins and auditors', () => {
    const withAudit = ROLE_KEYS.filter((r) => hrefs(r).includes('/admin/audit'));
    expect(withAudit.sort()).toEqual(['auditor', 'platform_admin']);
  });

  it('a seller admin sees the whole seller app', () => {
    expect(hrefs('seller_admin')).toEqual(['/seller', '/seller/organisation', '/seller/brands', '/seller/catalogs', '/seller/offers']);
  });
});
