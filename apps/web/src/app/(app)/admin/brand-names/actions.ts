'use server';

import { addProhibited, removeProhibited } from '@orbita/brands';
import { getDb } from '@orbita/db';
import { actionCtx, runAction } from '@/server/actions';

export async function addProhibitedAction(input: Parameters<typeof addProhibited>[2]) {
  return runAction(async () => {
    await addProhibited({ db: getDb() }, await actionCtx(), input);
    return { status: 'ok', message: 'Added to the list.' };
  }, ['/admin/brand-names']);
}

export async function removeProhibitedAction(id: string) {
  return runAction(async () => {
    await removeProhibited({ db: getDb() }, await actionCtx(), id);
    return { status: 'ok', message: 'Removed.' };
  }, ['/admin/brand-names']);
}
