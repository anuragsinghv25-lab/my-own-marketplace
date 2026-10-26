import { describe, expect, it } from 'vitest';
import {
  ROLE_KEYS,
  ROLES,
  accessibleAreas,
  defineAbilityFor,
  grantProblem,
  homeAreaFor,
  subject,
  type Grant,
  type RoleKey,
} from '../src';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const WG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const g = (role: RoleKey, scopeType: Grant['scopeType'] = 'global', scopeId: string | null = null): Grant => ({
  role,
  scopeType,
  scopeId,
});
const abilityOf = (...grants: Grant[]) => defineAbilityFor({ userId: ME, grants });

describe('areas: each role sees only its own area', () => {
  const expected: Record<RoleKey, string[]> = {
    platform_admin: ['AdminConsole'],
    template_manager: ['AdminConsole'],
    workgroup_manager: ['AdminConsole'],
    category_creator: ['Workbench'],
    category_drafter: ['Workbench'],
    category_checker: ['Workbench'],
    category_approver: ['Workbench'],
    va_officer: ['ReviewDesk'],
    brand_specialist: ['ReviewDesk'],
    agency_manager: ['ReviewDesk'],
    product_reviewer: ['ReviewDesk'],
    marketplace_manager: ['ReviewDesk'],
    committee_member: ['ReviewDesk'],
    auditor: ['AdminConsole'],
    seller_admin: ['SellerApp'],
    seller_lister: ['SellerApp'],
    seller_pricing: ['SellerApp'],
    brand_owner: ['SellerApp'],
  };
  for (const role of ROLE_KEYS) {
    it(role, () => {
      const scope = ROLES[role].scopes[0]!;
      const grant = g(role, scope, scope === 'global' ? null : WG_A);
      expect(accessibleAreas(abilityOf(grant))).toEqual(expected[role]);
      expect(ROLES[role].home).toBe(expected[role][0]);
    });
  }

  it('a user with no grants sees no area', () => {
    expect(accessibleAreas(abilityOf())).toEqual([]);
  });
});

describe('user administration (sample resource for R0)', () => {
  const allowedToInvite: RoleKey[] = ['platform_admin'];
  for (const role of ROLE_KEYS) {
    const scope = ROLES[role].scopes[0]!;
    const ability = abilityOf(g(role, scope, scope === 'global' ? null : WG_A));
    const shouldAllow = allowedToInvite.includes(role);
    it(`${role} ${shouldAllow ? 'can' : 'cannot'} invite users and grant roles`, () => {
      expect(ability.can('invite', 'User')).toBe(shouldAllow);
      expect(ability.can('grant', 'RoleGrant')).toBe(shouldAllow);
      expect(ability.can('revoke', 'RoleGrant')).toBe(shouldAllow);
    });
  }

  it('everyone can read their own profile but not others', () => {
    const a = abilityOf(g('seller_lister', 'org', WG_A));
    expect(a.can('read', subject('User', { id: ME }))).toBe(true);
    expect(a.can('read', subject('User', { id: OTHER }))).toBe(false);
  });

  it('platform admin and auditor can read the audit log; others cannot', () => {
    expect(abilityOf(g('platform_admin')).can('read', 'AuditEvent')).toBe(true);
    expect(abilityOf(g('auditor')).can('read', 'AuditEvent')).toBe(true);
    expect(abilityOf(g('category_checker')).can('read', 'AuditEvent')).toBe(false);
    expect(abilityOf(g('seller_admin', 'org', WG_A)).can('read', 'AuditEvent')).toBe(false);
  });

  it('auditor never writes', () => {
    const a = abilityOf(g('auditor'));
    expect(a.can('read', 'User')).toBe(true);
    expect(a.can('invite', 'User')).toBe(false);
    expect(a.can('update', 'CategoryVersion')).toBe(false);
    expect(a.can('approve', 'BrandRequest')).toBe(false);
  });

  it('platform admin cannot approve business requests', () => {
    const a = abilityOf(g('platform_admin'));
    expect(a.can('approve', 'CategoryVersion')).toBe(false);
    expect(a.can('approve', 'BrandRequest')).toBe(false);
    expect(a.can('approve', 'Catalog')).toBe(false);
  });
});

describe('scope and conditions', () => {
  it('workgroup-scoped drafter edits only drafts in their workgroup', () => {
    const a = abilityOf(g('category_drafter', 'workgroup', WG_A));
    expect(a.can('update', subject('CategoryVersion', { workgroupId: WG_A, state: 'DRAFT' }))).toBe(true);
    expect(a.can('update', subject('CategoryVersion', { workgroupId: WG_B, state: 'DRAFT' }))).toBe(false);
    expect(a.can('update', subject('CategoryVersion', { workgroupId: WG_A, state: 'PUBLISHED' }))).toBe(false);
    expect(a.can('submit', subject('CategoryVersion', { workgroupId: WG_A, state: 'DRAFT' }))).toBe(false);
  });

  it('checker can submit drafts', () => {
    const a = abilityOf(g('category_checker', 'workgroup', WG_A));
    expect(a.can('submit', subject('CategoryVersion', { workgroupId: WG_A, state: 'DRAFT' }))).toBe(true);
  });

  it('approver cannot approve a version they edited or submitted (maker ≠ approver)', () => {
    const a = abilityOf(g('category_approver', 'workgroup', WG_A));
    const base = { workgroupId: WG_A, state: 'IN_REVIEW', submittedBy: OTHER, editorIds: [OTHER] };
    expect(a.can('approve', subject('CategoryVersion', base))).toBe(true);
    expect(a.can('approve', subject('CategoryVersion', { ...base, editorIds: [OTHER, ME] }))).toBe(false);
    expect(a.can('approve', subject('CategoryVersion', { ...base, submittedBy: ME }))).toBe(false);
  });

  it('seller roles are limited to their organisation', () => {
    const a = abilityOf(g('seller_lister', 'org', WG_A));
    expect(a.can('update', subject('Catalog', { orgId: WG_A }))).toBe(true);
    expect(a.can('update', subject('Catalog', { orgId: WG_B }))).toBe(false);
    const p = abilityOf(g('seller_pricing', 'org', WG_A));
    expect(p.can('update', subject('Offer', { orgId: WG_A }))).toBe(true);
    expect(p.can('update', subject('Catalog', { orgId: WG_A }))).toBe(false);
  });

  it('brand specialist cannot approve a request they submitted', () => {
    const a = abilityOf(g('brand_specialist'));
    expect(a.can('approve', subject('BrandRequest', { submittedBy: OTHER }))).toBe(true);
    expect(a.can('approve', subject('BrandRequest', { submittedBy: ME }))).toBe(false);
  });
});

describe('grant validation', () => {
  it('rejects derived roles', () => {
    expect(grantProblem('brand_owner', 'brand', WG_A, [])).toMatch(/automatically/);
  });
  it('rejects wrong scope', () => {
    expect(grantProblem('platform_admin', 'workgroup', WG_A, [])).toMatch(/cannot be granted/);
    expect(grantProblem('seller_admin', 'org', null, [])).toMatch(/required/);
  });
  it('rejects duplicates', () => {
    expect(grantProblem('category_checker', 'global', null, [g('category_checker')])).toMatch(/already/);
  });
  it('enforces separation of duties', () => {
    expect(grantProblem('category_approver', 'global', null, [g('platform_admin')])).toMatch(/separation/);
    expect(grantProblem('auditor', 'global', null, [g('template_manager')])).toMatch(/separation/);
    expect(grantProblem('category_checker', 'global', null, [g('auditor')])).toMatch(/separation/);
  });
  it('allows valid combinations', () => {
    expect(grantProblem('category_checker', 'global', null, [g('template_manager')])).toBeNull();
  });
});

describe('home area', () => {
  it('uses the first role in catalogue order', () => {
    expect(homeAreaFor(['seller_lister', 'category_checker'])).toBe('Workbench');
    expect(homeAreaFor([])).toBeNull();
  });
});
