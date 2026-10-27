/**
 * The role catalogue. Roles live in code (they carry permissions, which are code);
 * *grants* of roles to users live in the database.
 * See docs/architecture/02-roles-and-permissions.md.
 */
export const AREAS = {
  AdminConsole: { label: 'Admin console', path: '/admin' },
  Workbench: { label: 'Category workbench', path: '/workbench' },
  ReviewDesk: { label: 'Review desk', path: '/reviews' },
  SellerApp: { label: 'Seller app', path: '/seller' },
} as const;
export type Area = keyof typeof AREAS;

export type ScopeType = 'global' | 'workgroup' | 'org' | 'brand';
export type Side = 'platform' | 'seller';

export interface RoleDefinition {
  key: RoleKey;
  label: string;
  side: Side;
  description: string;
  /** Scopes a grant of this role may carry. The first one is the default. */
  scopes: readonly ScopeType[];
  /** Area the role lands on after login. */
  home: Area;
  /** false = derived by the system (e.g. brand_owner after OEM assessment), never granted by hand. */
  assignable: boolean;
  /** Roles a user may not hold at the same time (separation of duties). */
  conflictsWith?: readonly RoleKey[];
}

export const ROLE_KEYS = [
  'platform_admin',
  'category_manager',
  'approver',
  'reviewer',
  'auditor',
  'seller_admin',
  'seller_staff',
  'brand_owner',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

const ALL_OTHER = (self: RoleKey) => ROLE_KEYS.filter((r) => r !== self);

/**
 * Eight roles cover every category, brand and catalog flow (R0.1 consolidation; the mapping
 * from the original 18 is in docs/architecture/02-roles-and-permissions.md).
 * Separation of duties is kept where the flows need an independent second person:
 * category manager → approver, reviewer → approver, and nobody approves their own work.
 */
export const ROLES: Record<RoleKey, RoleDefinition> = {
  platform_admin: {
    key: 'platform_admin',
    label: 'Platform admin',
    side: 'platform',
    description:
      'Users, roles and audit, plus shared configuration: attribute library, flag profiles and workgroups. Never approves business requests.',
    scopes: ['global'],
    home: 'AdminConsole',
    assignable: true,
    conflictsWith: ['approver', 'reviewer', 'auditor'],
  },
  category_manager: {
    key: 'category_manager',
    label: 'Category manager',
    side: 'platform',
    description:
      'Creates categories in the tree, drafts and checks their flags, specifications and rules, and submits versions for approval.',
    scopes: ['workgroup', 'global'],
    home: 'Workbench',
    assignable: true,
  },
  approver: {
    key: 'approver',
    label: 'Approver',
    side: 'platform',
    description:
      'Senior decisions: approves and schedules category versions, and decides escalated brand, catalog and vendor cases. Never on their own work.',
    scopes: ['workgroup', 'global'],
    home: 'ReviewDesk',
    assignable: true,
    conflictsWith: ['reviewer'],
  },
  reviewer: {
    key: 'reviewer',
    label: 'Reviewer',
    side: 'platform',
    description:
      'First-line review of vendor assessments, brand requests and catalogs: approve, reject, ask for information or escalate.',
    scopes: ['global'],
    home: 'ReviewDesk',
    assignable: true,
  },
  auditor: {
    key: 'auditor',
    label: 'Auditor',
    side: 'platform',
    description: 'Read-only access to everything, including the audit trail. Never writes.',
    scopes: ['global'],
    home: 'AdminConsole',
    assignable: true,
    conflictsWith: ALL_OTHER('auditor'),
  },
  seller_admin: {
    key: 'seller_admin',
    label: 'Seller admin',
    side: 'seller',
    description:
      "The seller organisation's main account: profile, users, brands, catalogs, offers and certificates.",
    scopes: ['org'],
    home: 'SellerApp',
    assignable: true,
  },
  seller_staff: {
    key: 'seller_staff',
    label: 'Seller staff',
    side: 'seller',
    description: 'Extra users a seller adds: brand requests, catalogs and offers, but not organisation settings.',
    scopes: ['org'],
    home: 'SellerApp',
    assignable: true,
  },
  brand_owner: {
    key: 'brand_owner',
    label: 'Brand owner (OEM)',
    side: 'seller',
    description: 'Given automatically after OEM assessment. Authorises resellers and approves their catalogs.',
    scopes: ['brand'],
    home: 'SellerApp',
    assignable: false,
  },
};

/** Roles that existed before R0.1, mapped to their replacement (null = no longer granted). */
export const LEGACY_ROLE_MAP: Record<string, RoleKey | null> = {
  template_manager: null,
  workgroup_manager: null,
  category_creator: 'category_manager',
  category_drafter: 'category_manager',
  category_checker: 'category_manager',
  category_approver: 'approver',
  agency_manager: 'approver',
  marketplace_manager: 'approver',
  committee_member: 'approver',
  va_officer: 'reviewer',
  brand_specialist: 'reviewer',
  product_reviewer: 'reviewer',
  seller_lister: 'seller_staff',
  seller_pricing: 'seller_staff',
};

export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === 'string' && (ROLE_KEYS as readonly string[]).includes(value);
}

/** Two roles conflict if either one lists the other. */
export function rolesConflict(a: RoleKey, b: RoleKey): boolean {
  return Boolean(ROLES[a].conflictsWith?.includes(b) || ROLES[b].conflictsWith?.includes(a));
}

/**
 * Validates adding `role` with `scopeType` to a user who already holds `held`.
 * Returns a human-readable reason, or null when the grant is allowed.
 */
export function grantProblem(
  role: RoleKey,
  scopeType: ScopeType,
  scopeId: string | null,
  held: readonly { role: RoleKey; scopeType: ScopeType; scopeId: string | null }[],
): string | null {
  const def = ROLES[role];
  if (!def.assignable) return `${def.label} is assigned automatically and cannot be granted by hand.`;
  if (!def.scopes.includes(scopeType))
    return `${def.label} cannot be granted with ${scopeType} scope (allowed: ${def.scopes.join(', ')}).`;
  if (scopeType !== 'global' && !scopeId) return `A ${scopeType} id is required for this grant.`;
  if (scopeType === 'global' && scopeId) return 'Global grants must not carry a scope id.';
  if (held.some((h) => h.role === role && h.scopeType === scopeType && h.scopeId === scopeId))
    return `The user already has ${def.label} with this scope.`;
  const clash = held.find((h) => h.role !== role && rolesConflict(role, h.role));
  if (clash)
    return `${def.label} cannot be combined with ${ROLES[clash.role].label} (separation of duties).`;
  return null;
}

/** Where a user lands after login: the home area of their first role, in catalogue order. */
export function homeAreaFor(roles: readonly RoleKey[]): Area | null {
  for (const key of ROLE_KEYS) if (roles.includes(key)) return ROLES[key].home;
  return null;
}
