'use server';

import { signUpSeller, type SignupInput } from '@orbita/sellers';
import type { ActionState } from '@/lib/action-state';
import { runAction } from '@/server/actions';
import { sellerDeps } from '@/server/deps';
import { env } from '@/server/env';
import { requestMeta } from '@/server/request';

export async function registerSellerAction(input: SignupInput): Promise<ActionState> {
  return runAction(async () => {
    const r = await signUpSeller(sellerDeps(), await requestMeta(), input);
    // Without email, the confirmation link proves nothing about the address, so it is only shown in demo mode.
    const link = r.manualLink && env.demoMode() ? r.manualLink : null;
    return {
      status: 'ok',
      message: r.delivered ? `We sent a confirmation link to ${r.email}.` : link ? 'Email is not set up here (demo mode): use the link below.' : 'Your registration is saved, but we could not send the email. Contact support to finish.',
      data: { email: r.email, link },
    };
  });
}
