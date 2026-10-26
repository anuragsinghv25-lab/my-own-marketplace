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

const APPROVAL_ROLES = [
  'category_approver',
  'va_officer',
  'brand_specialist',
  'agency_manager',
  'product_reviewer',
  'marketplace_manager',
  'committee_member',
] as const;

export const ROLE_KEYS = [
  'platform_admin',
  'template_manager',
  'workgroup_manager',
  'category_creator',
  'category_drafter',
  'category_checker',
  'category_approver',
  'va_officer',
  'brand_specialist',
  'agency_manager',
  'product_reviewer',
  'marketplace_manager',
  'committee_member',
  'auditor',
  'seller_admin',
  'seller_lister',
  'seller_pricing',
  'brand_owner',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

const ALL_OTHER = (self: RoleKey) => ROLE_KEYS.filter((r) => r !== self);

export const ROLES: Record<RoleKey, RoleDefinition> = {
  platform_admin: {
    key: 'platform_admin',
    label: 'Platform admin',
    side: 'platform',
    description: 'Users, role grants and system settings. Never approves business requests.',
    scopes: ['global'],
    home: 'AdminConsole',
    assignable: true,
    conflictsWith: [...APPROVAL_ROLES, 'auditor'],
  },
  template_manager: {
    key: 'template_manager',
    label: 'Template manager',
    side: 'platform',
    description: 'Attribute library, units, value lists, flag profiles and certificate types.',
    scopes: ['global'],
    home: 'AdminConsole',
    assignable: true,
  },
  workgroup_manager: {
    key: 'workgroup_manager',
    label: 'Workgroup manager',
    side: 'platform',
    description: 'Creates workgroups, assigns category subtrees and members.',
    scopes: ['global'],
    home: 'AdminConsole',
    assignable: true,
  },
  category_creator: {
    key: 'category_creator',
    label: 'Category creator',
    side: 'platform',
    description: 'Creates and moves category nodes, assigns workgroup and checker.',
    scopes: ['workgroup', 'global'],
    home: 'Workbench',
    assignable: true,
  },
  category_drafter: {
    key: 'category_drafter',
    label: 'Category drafter',
    side: 'platform',
    description: 'Edits draft category versions: flags, specs and rules.',
    scopes: ['workgroup', 'global'],
    home: 'Workbench',
    assignable: true,
  },
  category_checker: {
    key: 'category_checker',
    label: 'Category checker',
    side: 'platform',
    description: 'Drafter powers plus review, send back and submit for approval.',
    scopes: ['workgroup', 'global'],
    home: 'Workbench',
    assignable: true,
  },
  category_approver: {
    key: 'category_approver',
    label: 'Category approver',
    side: 'platform',
    description: 'Approves and schedules category versions. Never on a version they edited.',
    scopes: ['workgroup', 'global'],
    home: 'Workbench',
    assignable: true,
  },
  va_officer: {
    key: 'va_officer',
    label: 'Vendor assessment officer',
    side: 'platform',
    description: 'Verifies seller identity and OEM status.',
    scopes: ['global'],
    home: 'ReviewDesk',
    assignable: true,
  },
  brand_specialist: {
    key: 'brand_specialist',
    label: 'Brand specialist',
    side: 'platform',
    description: 'Reviews brand requests: approve, reject, ask for info, escalate.',
    scopes: ['global'],
    home: 'ReviewDesk',
    assignable: true,
  },
  agency_manager: {
    key: 'agency_manager',
    label: 'Agency manager',
    side: 'platform',
    description: 'Specialist powers plus assigning work and reviving brands.',
    scopes: ['global'],
    home: 'ReviewDesk',
    assignable: true,
  },
  product_reviewer: {
    key: 'product_reviewer',
    label: 'Product reviewer',
    side: 'platform',
    description: 'Reviews catalogs (product approval).',
    scopes: ['global'],
    home: 'ReviewDesk',
    assignable: true,
  },
  marketplace_manager: {
    key: 'marketplace_manager',
    label: 'Marketplace manager',
    side: 'platform',
    description: 'Escalations, disputes, priority processing and policy exceptions.',
    scopes: ['global'],
    home: 'ReviewDesk',
    assignable: true,
  },
  committee_member: {
    key: 'committee_member',
    label: 'Committee member',
    side: 'platform',
    description: 'Decides special cases referred by a marketplace manager.',
    scopes: ['global'],
    home: 'ReviewDesk',
    assignable: true,
  },
  auditor: {
    key: 'auditor',
    label: 'Auditor',
    side: 'platform',
    description: 'Read-only access to audit trails and history. Never writes.',
    scopes: ['global'],
    home: 'AdminConsole',
    assignable: true,
    conflictsWith: ALL_OTHER('auditor'),
  },
  seller_admin: {
    key: 'seller_admin',
    label: 'Seller admin',
    side: 'seller',
    description: "Manages the seller organisation's users, divisions and certificates.",
    scopes: ['org'],
    home: 'SellerApp',
    assignable: true,
  },
  seller_lister: {
    key: 'seller_lister',
    label: 'Seller lister',
    side: 'seller',
    description: 'Creates, pairs and clones catalogs; edits offers.',
    scopes: ['org'],
    home: 'SellerApp',
    assignable: true,
  },
  seller_pricing: {
    key: 'seller_pricing',
    label: 'Seller pricing',
    side: 'seller',
    description: 'Edits price and stock only.',
    scopes: ['org'],
    home: 'SellerApp',
    assignable: true,
  },
  brand_owner: {
    key: 'brand_owner',
    label: 'Brand owner (OEM)',
    side: 'seller',
    description: 'Derived after OEM assessment. Authorises resellers and approves their catalogs.',
    scopes: ['brand'],
    home: 'SellerApp',
    assignable: false,
  },
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
