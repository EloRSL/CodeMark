import { endpoints, type EndpointKey } from '@codemark/contracts';
import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { requestContext, type AppEnv } from './http/context';
import { notFound, onError } from './http/errors';
import { stub } from './http/registry';
import type { ScopeResolvers } from './modules/accounts';
import { accountRoutes } from './modules/accounts/routes';
import { testRoutes } from './modules/platform/routes';
import { examRoutes } from './modules/exams/routes';
import { jobHandlers, scheduled } from './scheduled';

/** Module routes first, then a 501 stub for every endpoint no module implements yet. */
export function createApp(appEnv: string, resolvers: Partial<ScopeResolvers> = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use(requestContext(resolvers));
  app.onError(onError);
  app.notFound(notFound);
  accountRoutes(app);
  examRoutes(app);
  if (appEnv === 'test') testRoutes(app, jobHandlers); // otherwise /api/test/* is 404 (api.md)
  for (const key of Object.keys(endpoints) as EndpointKey[]) stub(app, key);
  return app;
}

// The submission and scoreRecord resolvers are passed here once their modules exist.
export const app = createApp(env.APP_ENV);
export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<Env>;
