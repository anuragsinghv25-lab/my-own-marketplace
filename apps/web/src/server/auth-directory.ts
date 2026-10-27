import 'server-only';
import { badRequest, conflict, AppError } from '@orbita/domain';
import type { AuthDirectory, EmailLink } from '@orbita/identity';
import { adminSupabase } from './supabase';

/** The identity module's AuthDirectory port, implemented with the Supabase Auth Admin API. */
function fail(message: string, status?: number): never {
  if (/already been registered|already exists|already registered/i.test(message))
    throw conflict('A user with this email already exists.');
  if (status && status >= 400 && status < 500) throw badRequest(message);
  throw new AppError('INTERNAL', `Auth service error: ${message}`);
}

export const supabaseAuthDirectory: AuthDirectory = {
  async invite(email, fullName) {
    const { data, error } = await adminSupabase().auth.admin.generateLink({
      type: 'invite',
      email,
      options: { data: { full_name: fullName } },
    });
    if (error || !data.user) fail(error?.message ?? 'No user returned', error?.status);
    return {
      userId: data.user.id,
      link: { tokenHash: data.properties.hashed_token, type: 'invite' } satisfies EmailLink,
    };
  },

  async magicLink(email) {
    const { data, error } = await adminSupabase().auth.admin.generateLink({ type: 'magiclink', email });
    if (error) fail(error.message, error.status);
    return { tokenHash: data.properties.hashed_token, type: 'magiclink' };
  },

  async createWithPassword(email, password, fullName) {
    const { data, error } = await adminSupabase().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) fail(error?.message ?? 'No user returned', error?.status);
    return { userId: data.user.id };
  },

  async setPassword(userId, password) {
    const { error } = await adminSupabase().auth.admin.updateUserById(userId, { password });
    if (error) fail(error.message, error.status);
  },

  async setBanned(userId, banned) {
    const { error } = await adminSupabase().auth.admin.updateUserById(userId, {
      ban_duration: banned ? '876000h' : 'none',
    });
    if (error) fail(error.message, error.status);
  },

  async delete(userId) {
    const { error } = await adminSupabase().auth.admin.deleteUser(userId);
    if (error) fail(error.message, error.status);
  },
};

/** Recovery link for "forgot password" (not part of the identity port: no admin involved). */
export async function recoveryLink(email: string): Promise<EmailLink | null> {
  const { data, error } = await adminSupabase().auth.admin.generateLink({ type: 'recovery', email });
  if (error) return null; // unknown email: say nothing (no account enumeration)
  return { tokenHash: data.properties.hashed_token, type: 'recovery' };
}

export async function signInLink(email: string): Promise<EmailLink | null> {
  const { data, error } = await adminSupabase().auth.admin.generateLink({ type: 'magiclink', email });
  if (error) return null;
  return { tokenHash: data.properties.hashed_token, type: 'magiclink' };
}
