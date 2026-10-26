import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import {
  ROLES,
  accessibleAreas,
  defineAbilityFor,
  homeAreaFor,
  AREAS,
  type Action,
  type AppAbility,
  type Area,
  type Grant,
  type RoleKey,
  type SubjectType,
} from '@orbita/authz';
import { getDb, type Profile } from '@orbita/db';
import { forbidden, unauthenticated, type Actor } from '@orbita/domain';
import { loadSession } from '@orbita/identity';
import { isCoreConfigured } from './env';
import { createServerSupabase } from './supabase';

export interface Session {
  actor: Actor;
  profile: Profile;
  grants: Grant[];
  roles: RoleKey[];
  ability: AppAbility;
  areas: Area[];
  homePath: string;
}

export type SessionState =
  | { state: 'unconfigured' }
  | { state: 'signed-out' }
  | { state: 'no-profile'; userId: string; email: string }
  | { state: 'deactivated'; email: string }
  | { state: 'ok'; session: Session };

/**
 * Who is signed in, with roles and abilities, loaded once per request.
 * Roles are read from the database on every request, so a change takes effect immediately.
 */
export const getSessionState = cache(async (bearer?: string | null): Promise<SessionState> => {
  if (!isCoreConfigured()) return { state: 'unconfigured' };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getClaims(bearer ?? undefined);
  const claims = data?.claims;
  if (error || !claims?.sub) return { state: 'signed-out' };

  const userId = claims.sub;
  const email = String(claims.email ?? '');
  const loaded = await loadSession(getDb(), userId);
  if (!loaded) return { state: 'no-profile', userId, email };
  if (loaded.profile.status === 'deactivated') return { state: 'deactivated', email };

  const ability = defineAbilityFor({ userId, grants: loaded.grants });
  const roles = [...new Set(loaded.grants.map((g) => g.role))];
  const home = homeAreaFor(roles);
  const actor = { id: userId, email: loaded.profile.email || email, fullName: loaded.profile.fullName };
  Sentry.setUser({ id: userId, email: actor.email });
  return {
    state: 'ok',
    session: {
      actor,
      profile: loaded.profile,
      grants: loaded.grants,
      roles,
      ability,
      areas: accessibleAreas(ability),
      homePath: home ? AREAS[home].path : '/no-access',
    },
  };
});

/** For pages: redirect to the right place unless a usable session exists. */
export async function requireSession(opts: { allowInvited?: boolean } = {}): Promise<Session> {
  const s = await getSessionState();
  switch (s.state) {
    case 'unconfigured':
      redirect('/setup');
    case 'signed-out':
      redirect('/login');
    case 'no-profile':
      redirect('/auth/signout?reason=no-profile');
    case 'deactivated':
      redirect('/auth/signout?reason=deactivated');
    case 'ok':
      if (s.session.profile.status === 'invited' && !opts.allowInvited) redirect('/welcome');
      return s.session;
  }
}

/** For pages: require a permission or render the 403 page. */
export async function requirePermission(action: Action, subject: SubjectType): Promise<Session> {
  const session = await requireSession();
  if (!session.ability.can(action, subject)) redirect('/forbidden');
  return session;
}

/** For server actions and route handlers: throw instead of redirecting. */
export async function sessionOrThrow(bearer?: string | null): Promise<Session> {
  const s = await getSessionState(bearer);
  if (s.state !== 'ok') throw unauthenticated();
  if (s.session.profile.status !== 'active') throw forbidden('Finish accepting your invite first.');
  return s.session;
}

export function roleLabels(roles: RoleKey[]): string[] {
  return roles.map((r) => ROLES[r].label);
}
