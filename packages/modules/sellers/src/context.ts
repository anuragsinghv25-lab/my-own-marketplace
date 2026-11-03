import type { AppAbility } from '@orbita/authz';
import type { Actor, RequestMeta } from '@orbita/domain';

export interface Ctx {
  actor: Actor;
  ability: AppAbility;
  meta: RequestMeta;
}
