import { Me, type DemoUser } from '@codemark/contracts';
import { createScheduledController } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import type { Hono } from 'hono';
import worker, { app as defaultApp } from '../src/app';
import type { AppEnv } from '../src/http/context';

/** One cron run through the Worker's scheduled handler, on the clock test.clock set. */
export async function runCron(cronEnv: Env = env): Promise<void> {
  await worker.scheduled(createScheduledController(), cronEnv);
}

/**
 * Signs a demo user in through auth.demo and returns a client for API tests.
 * request() sends the session cookie and the Origin header; paths omit /api.
 */
export async function signIn(
  user: DemoUser,
  app: Hono<AppEnv> = defaultApp,
): Promise<{
  me: Me;
  cookie: string;
  request: (method: string, path: string, body?: unknown) => Promise<Response>;
}> {
  const res = await app.request(
    '/api/auth/demo',
    { method: 'POST', headers: { Origin: env.APP_ORIGIN }, body: JSON.stringify({ user }) },
    env,
  );
  if (res.status !== 200) throw new Error(`auth.demo for ${user} answered ${res.status}`);
  const cookie = res.headers.get('Set-Cookie')?.split(';')[0] ?? '';
  const me = Me.parse(await res.json());

  const request = async (method: string, path: string, body?: unknown) =>
    app.request(
      `/api${path}`,
      {
        method,
        headers: { Cookie: cookie, Origin: env.APP_ORIGIN },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env,
    );
  return { me, cookie, request };
}
