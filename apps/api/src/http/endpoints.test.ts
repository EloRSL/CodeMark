import { ApiErrorBody, endpoints, testEndpoints, type EndpointKey } from '@codemark/contracts';
import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import type { AppEnv } from './context';
import { stub } from './registry';

const registry = Object.values(endpoints).map((e) => `${e.method} /api${e.path}`);
// Tests run with APP_ENV=test, so the test endpoints are registered too.
const testRoutes = Object.values(testEndpoints).map((e) => `${e.method} /api${e.path}`);
const routes = app.routes.filter((r) => r.method !== 'ALL').map((r) => `${r.method} ${r.path}`);

describe('endpoint registry', () => {
  it('has the 33 endpoints of api.md', () => {
    expect(registry).toHaveLength(33);
    expect(new Set(registry).size).toBe(33);
  });

  it('the Worker registers every entry once, implemented or stubbed, and nothing else', () => {
    expect([...routes].sort()).toEqual([...registry, ...testRoutes].sort());
  });
});

describe('stub', () => {
  const stubs = new Hono<AppEnv>();
  for (const key of Object.keys(endpoints) as EndpointKey[]) stub(stubs, key);

  // stub runs none of the API-5 checks, so no session or Origin is needed.
  it.each(Object.entries(endpoints))('%s answers 501 NOT_IMPLEMENTED', async (key, e) => {
    const path = `/api${e.path}`.replace(/:\w+/g, '00000000-0000-4000-8000-000000000001');
    const res = await stubs.request(path, { method: e.method }, env);
    expect(res.status).toBe(501);
    const body = ApiErrorBody.parse(await res.json());
    expect(body.error.code).toBe('NOT_IMPLEMENTED');
    expect(body.error.message).toContain(key);
  });

  it('leaves an implemented endpoint alone', () => {
    const me = app.routes.filter((r) => r.method === 'GET' && r.path === '/api/me');
    expect(me).toHaveLength(1);
  });
});
