'use server';

import { revalidatePath } from 'next/cache';
import { ROLES, isRoleKey, type Grant, type RoleKey } from '@orbita/authz';
import { isAppError } from '@orbita/domain';
import {
  DEMO_ORG_ID,
  grantRole,
  inviteUser,
  resendInvite,
  revokeRole,
  setUserActive,
} from '@orbita/identity';
import type { ActionState } from '@/lib/action-state';
import { identityDeps } from '@/server/deps';
import { log } from '@/server/log';
import { requestMeta } from '@/server/request';
import { sessionOrThrow } from '@/server/session';

async function ctx() {
  return { ...(await sessionOrThrow()), meta: await requestMeta() };
}

/**
 * Default scope for a role chosen in the admin UI. Workgroups (R1) and seller organisations (R4)
 * do not exist yet, so category roles are granted globally and seller roles to the demo organisation.
 */
function defaultGrant(role: RoleKey): Grant {
  const scopes = ROLES[role].scopes;
  if (scopes.includes('global')) return { role, scopeType: 'global', scopeId: null };
  if (scopes.includes('org')) return { role, scopeType: 'org', scopeId: DEMO_ORG_ID };
  return { role, scopeType: scopes[0]!, scopeId: null };
}

async function run(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    const result = await fn();
    revalidatePath('/admin', 'layout');
    return result;
  } catch (err) {
    if (isAppError(err)) return { status: 'error', message: err.message, fieldErrors: undefined };
    log.error('admin.action_failed', { err });
    return { status: 'error', message: 'Something went wrong. Please try again.' };
  }
}

export async function inviteUserAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const roles = form.getAll('roles').map(String).filter(isRoleKey);
    if (roles.length === 0) return { status: 'error', message: 'Pick at least one role.', fieldErrors: { roles: ['Pick at least one role'] } };
    const result = await inviteUser(identityDeps(), await ctx(), {
      email: String(form.get('email') ?? ''),
      fullName: String(form.get('fullName') ?? ''),
      kind: roles.every((r) => ROLES[r].side === 'seller') ? 'seller' : 'staff',
      roles: roles.map(defaultGrant),
    });
    return {
      status: 'ok',
      message: result.manualLink ? 'User invited. Email is not configured, so share the link below.' : `Invite sent to ${result.user.email}.`,
      data: { manualLink: result.manualLink, email: result.user.email },
    };
  });
}

export async function grantRoleAction(userId: string, role: string): Promise<ActionState> {
  return run(async () => {
    if (!isRoleKey(role)) return { status: 'error', message: 'Unknown role.' };
    await grantRole(identityDeps(), await ctx(), userId, defaultGrant(role));
    return { status: 'ok', message: `${ROLES[role].label} granted.` };
  });
}

export async function revokeRoleAction(userId: string, grantId: string): Promise<ActionState> {
  return run(async () => {
    await revokeRole(identityDeps(), await ctx(), userId, grantId);
    return { status: 'ok', message: 'Role revoked.' };
  });
}

export async function setActiveAction(userId: string, active: boolean): Promise<ActionState> {
  return run(async () => {
    await setUserActive(identityDeps(), await ctx(), userId, active);
    return { status: 'ok', message: active ? 'User reactivated.' : 'User deactivated. They are signed out on their next request.' };
  });
}

export async function resendInviteAction(userId: string): Promise<ActionState> {
  return run(async () => {
    const r = await resendInvite(identityDeps(), await ctx(), userId);
    return {
      status: 'ok',
      message: r.manualLink ? 'New link created. Email is not configured, so share it below.' : 'Invite re-sent.',
      data: { manualLink: r.manualLink },
    };
  });
}
