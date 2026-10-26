import { AREAS, type Action, type AppAbility, type Area, type SubjectType } from '@orbita/authz';

/**
 * Sidebar items per area. An item shows only when the user's ability allows `requires`.
 * Items with `release` are previews of later releases: visible (so people see what is coming
 * for their role) but not clickable yet.
 */
export type IconName =
  | 'home'
  | 'users'
  | 'shield'
  | 'scroll'
  | 'library'
  | 'flag'
  | 'network'
  | 'tree'
  | 'layers'
  | 'stamp'
  | 'badge'
  | 'building'
  | 'package'
  | 'tag'
  | 'alert'
  | 'palette';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  requires: [Action, SubjectType];
  release?: string;
}

export interface NavSection {
  area: Area;
  label: string;
  items: NavItem[];
}

const NAV: Record<Area, NavItem[]> = {
  AdminConsole: [
    { href: '/admin', label: 'Overview', icon: 'home', requires: ['access', 'AdminConsole'] },
    { href: '/admin/users', label: 'Users', icon: 'users', requires: ['read', 'RoleGrant'] },
    { href: '/admin/roles', label: 'Roles', icon: 'shield', requires: ['read', 'RoleGrant'] },
    { href: '/admin/audit', label: 'Audit log', icon: 'scroll', requires: ['read', 'AuditEvent'] },
    { href: '/admin/attributes', label: 'Attribute library', icon: 'library', requires: ['read', 'AttributeLibrary'], release: 'R1' },
    { href: '/admin/workgroups', label: 'Workgroups', icon: 'network', requires: ['read', 'Workgroup'], release: 'R1' },
    { href: '/admin/flag-profiles', label: 'Flag profiles', icon: 'flag', requires: ['read', 'FlagProfile'], release: 'R2' },
  ],
  Workbench: [
    { href: '/workbench', label: 'Home', icon: 'home', requires: ['access', 'Workbench'] },
    { href: '/workbench/taxonomy', label: 'Category tree', icon: 'tree', requires: ['read', 'CategoryNode'], release: 'R1' },
    { href: '/workbench/versions', label: 'Category versions', icon: 'layers', requires: ['read', 'CategoryVersion'], release: 'R2' },
    { href: '/workbench/approvals', label: 'Approvals', icon: 'stamp', requires: ['approve', 'CategoryVersion'], release: 'R3' },
  ],
  ReviewDesk: [
    { href: '/reviews', label: 'Home', icon: 'home', requires: ['access', 'ReviewDesk'] },
    { href: '/reviews/vendors', label: 'Vendor assessments', icon: 'building', requires: ['read', 'VendorAssessment'], release: 'R4' },
    { href: '/reviews/brands', label: 'Brand requests', icon: 'badge', requires: ['read', 'BrandRequest'], release: 'R4' },
    { href: '/reviews/catalogs', label: 'Catalog reviews', icon: 'package', requires: ['approve', 'Catalog'], release: 'R5' },
    { href: '/reviews/escalations', label: 'Escalations', icon: 'alert', requires: ['read', 'Escalation'], release: 'R4' },
  ],
  SellerApp: [
    { href: '/seller', label: 'Home', icon: 'home', requires: ['access', 'SellerApp'] },
    { href: '/seller/organisation', label: 'Organisation', icon: 'building', requires: ['read', 'SellerOrg'], release: 'R4' },
    { href: '/seller/brands', label: 'Brands', icon: 'badge', requires: ['read', 'BrandRequest'], release: 'R4' },
    { href: '/seller/catalogs', label: 'Catalogs', icon: 'package', requires: ['read', 'Catalog'], release: 'R5' },
    { href: '/seller/offers', label: 'Offers', icon: 'tag', requires: ['read', 'Offer'], release: 'R5' },
  ],
};

/** Sections for the areas this user can access, each filtered to the items they may use. */
export function navigationFor(ability: AppAbility): NavSection[] {
  return (Object.keys(NAV) as Area[])
    .filter((area) => ability.can('access', area))
    .map((area) => ({
      area,
      label: AREAS[area].label,
      items: NAV[area].filter((i) => ability.can(i.requires[0], i.requires[1])),
    }));
}

export const ALL_NAV = NAV;
