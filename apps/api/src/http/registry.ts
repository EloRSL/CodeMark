import {
  endpoints,
  testEndpoints,
  type EndpointDef,
  type EndpointKey,
  type ModuleName,
  type ParamsOf,
  type ParsedBodyOf,
  type ParsedQueryOf,
  type ResponseOf,
  type TestEndpointKey,
} from '@codemark/contracts';
import type { Context, Hono } from 'hono';
import type { Db } from '../db/client';
import { checkAccess, type Membership } from '../modules/accounts';
import type { AppEnv, SessionUser } from './context';
import { ApiError, errorResponse } from './errors';

type Key = EndpointKey | TestEndpointKey;
type Endpoints = typeof endpoints & typeof testEndpoints;
const allEndpoints: Record<Key, EndpointDef> = { ...endpoints, ...testEndpoints };

// The owner of each module's endpoints (docs/api.md index).
const owners: Record<ModuleName, string> = {
  platform: 'EloRSL',
  accounts: 'EloRSL',
  exams: 'butarca',
  submissions: 'tzuntar',
  grading: 'lukaazman',
  review: 'bjaksic84',
};

/** internal-interfaces.md section 1, with user, examId and membership narrowed by the registry. */
export type HandlerArgs<K extends Key> = {
  c: Context<AppEnv>;
  db: Db;
  env: Env;
  now: number;
  user: Endpoints[K]['access'] extends 'public' ? SessionUser | null : SessionUser;
  params: ParamsOf<K>;
  query: ParsedQueryOf<K>;
  body: ParsedBodyOf<K>;
  examId: Endpoints[K]['scope'] extends 'none' ? null : string;
  membership: Endpoints[K]['scope'] extends 'none' ? null : Membership;
};

/** Registers the endpoint from the registry: access, scope, Origin, validation, error shape. */
export function implement<K extends Key>(
  app: Hono<AppEnv>,
  key: K,
  handler: (args: HandlerArgs<K>) => Promise<ResponseOf<K>>,
): void {
  const def = allEndpoints[key];
  app.on(def.method, `/api${def.path}`, async (c) => {
    // API-5 in order. 1: Origin (SEC-4); the test endpoints skip it (api.md).
    const isTest = key in testEndpoints;
    if (def.method !== 'GET' && !isTest && c.req.header('Origin') !== c.env.APP_ORIGIN) {
      throw new ApiError('FORBIDDEN_ORIGIN', 'The Origin header must be APP_ORIGIN');
    }
    // 2 to 4: session, scope, role (SEC-3).
    const access = await checkAccess(c, def.access, def.scope);
    c.set('user', access.user);
    // 5: schemas. There are no path parameter schemas.
    const query = def.query && parse(def.query, c.req.query(), 'query');
    const body = def.body && parse(def.body, await readJson(c), 'body');

    const args = { c, db: c.get('db'), env: c.env, now: c.get('now'), params: c.req.param() };
    const result = await handler({ ...args, ...access, query, body } as HandlerArgs<K>);
    if (typeof def.response === 'string') return result as Response; // a redirect or the CSV
    if (c.env.APP_ENV !== 'production') {
      const check = def.response.safeParse(result);
      if (!check.success) {
        throw new ApiError(
          'INTERNAL',
          `${key} returned a response that breaks its schema`,
          check.error.issues,
        );
      }
    }
    return c.json(result as object);
  });
}

function parse(schema: NonNullable<EndpointDef['body']>, value: unknown, what: string): unknown {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError('BAD_REQUEST', `The ${what} does not match its schema`, result.error.issues);
  }
  return result.data;
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError('BAD_REQUEST', 'The body is not valid JSON');
  }
}

/** Registers the endpoint as 501 NOT_IMPLEMENTED with the owner's name in the message. */
export function stub(app: Hono<AppEnv>, key: EndpointKey): void {
  const { method, path, module } = endpoints[key];
  // Skip endpoints a module already implemented. stub runs none of the API-5 checks.
  if (app.routes.some((r) => r.method === method && r.path === `/api${path}`)) return;
  app.on(method, `/api${path}`, (c) =>
    errorResponse(c, 'NOT_IMPLEMENTED', `${key} is not implemented yet (owner: ${owners[module]})`),
  );
}
