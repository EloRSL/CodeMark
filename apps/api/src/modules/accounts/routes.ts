import { DEMO_USERS } from '@codemark/core';
import type { Hono } from 'hono';
import type { AppEnv } from '../../http/context';
import { ApiError } from '../../http/errors';
import { implement } from '../../http/registry';
import { createSession, endSession, getMe, updateMe } from './service';

/** api.md #3 to #6. OAuth (#1, #2), join (#7), class list (#8) and members (#9) come later. */
export function accountRoutes(app: Hono<AppEnv>): void {
  implement(app, 'auth.demo', async ({ c, db, env, body }) => {
    if (env.DEMO_MODE !== 'true') throw new ApiError('DEMO_DISABLED', 'Demo sign-in is off');
    const me = await getMe(db, DEMO_USERS[body.user].id);
    if (!me) throw new ApiError('NOT_FOUND', 'The demo user is missing; run pnpm db:reset');
    await createSession(c, me.id);
    return me;
  });

  implement(app, 'auth.logout', async ({ c }) => {
    await endSession(c);
    return { ok: true as const };
  });

  implement(app, 'me.get', async ({ user }) => user);

  implement(app, 'me.update', async ({ db, user, body }) => updateMe(db, user.id, body));
}
