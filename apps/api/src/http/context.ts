import type { Me } from '@codemark/contracts';
import type { MiddlewareHandler } from 'hono';
import { createDb, type Db } from '../db/client';
import type { ScopeResolvers } from '../modules/accounts';
import { clock } from '../platform/clock';

export type SessionUser = Me; // the users row as the Me type

export type AppEnv = {
  Bindings: Env; // the variables and bindings in architecture.md section 5
  Variables: {
    db: Db;
    now: number;
    user: SessionUser | null;
    resolvers: Partial<ScopeResolvers>; // app.ts sets them
  };
};

/** Sets the request's time once (G4), its database, and the scope resolvers app.ts wires in. */
export function requestContext(resolvers: Partial<ScopeResolvers>): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('now', clock.now());
    c.set('db', createDb(c.env.DB));
    c.set('user', null);
    c.set('resolvers', resolvers);
    await next();
  };
}
