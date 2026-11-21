import { ApiErrorBody, endpoints, LIMITS, Me, type DemoUser } from '@codemark/contracts';
import { DEMO_USERS, sha256Hex } from '@codemark/core';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { signIn } from '../../../test/client';
import { app } from '../../app';
import { createDb } from '../../db/client';
import { examMembers, sessions, users } from '../../db/schema';
import { clock } from '../../platform/clock';

const db = createDb(env.DB);
const T0 = Date.parse('2026-12-01T10:00:00.000Z');

const demoSignIn = (user: string, workerEnv: Env = env) =>
  app.request(
    '/api/auth/demo',
    { method: 'POST', headers: { Origin: env.APP_ORIGIN }, body: JSON.stringify({ user }) },
    workerEnv,
  );

async function errorCode(res: Response) {
  return { status: res.status, code: ApiErrorBody.parse(await res.json()).error.code };
}

/** The cookie's value and its attributes, in any order. */
function parseCookie(header: string | null) {
  const [pair = '', ...attributes] = (header ?? '').split('; ');
  const [name, value] = pair.split('=');
  return { name, value, attributes: [...attributes].sort() };
}

afterEach(() => clock.set(null));

describe('auth.demo', () => {
  it.each(Object.entries(DEMO_USERS))('signs in %s as the seeded user', async (key, u) => {
    const { me } = await signIn(key as DemoUser);
    const { id, email, name, role, enrolmentNo } = u;
    expect(me).toEqual({ id, email, name, role, enrolmentNo, locale: 'sl', demo: true });
  });

  it('sets the SEC-5 cookie and stores only the SHA-256 of the token', async () => {
    clock.set(T0);
    const res = await demoSignIn('student1');
    const cookie = parseCookie(res.headers.get('Set-Cookie'));
    expect(cookie.name).toBe('__Host-session');
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes in base64url
    expect(cookie.attributes).toEqual(
      ['HttpOnly', 'Max-Age=1209600', 'Path=/', 'SameSite=Lax', 'Secure'].sort(),
    );

    const row = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, await sha256Hex(cookie.value!)))
      .get();
    expect(row).toEqual({
      tokenHash: await sha256Hex(cookie.value!),
      userId: DEMO_USERS.student1.id,
      createdAt: T0,
      expiresAt: T0 + LIMITS.sessionMs,
    });
  });

  it('answers 403 DEMO_DISABLED unless DEMO_MODE is "true"', async () => {
    const res = await demoSignIn('professor', { ...env, DEMO_MODE: 'false' });
    expect(await errorCode(res)).toEqual({ status: 403, code: 'DEMO_DISABLED' });
  });

  it('answers 404 when the seed did not run', async () => {
    const seeded = await db.select().from(users).where(eq(users.id, DEMO_USERS.student3.id)).get();
    await db.delete(users).where(eq(users.id, DEMO_USERS.student3.id));
    try {
      expect(await errorCode(await demoSignIn('student3'))).toEqual({
        status: 404,
        code: 'NOT_FOUND',
      });
    } finally {
      await db.insert(users).values(seeded!);
    }
  });

  it('answers 400 for an unknown demo user', async () => {
    expect(await errorCode(await demoSignIn('student9'))).toEqual({
      status: 400,
      code: 'BAD_REQUEST',
    });
  });
});

describe('sessions', () => {
  it('last 14 days to the millisecond', async () => {
    clock.set(T0);
    const ana = await signIn('student1');
    clock.set(T0 + LIMITS.sessionMs - 1);
    expect((await ana.request('GET', '/me')).status).toBe(200);
    clock.set(T0 + LIMITS.sessionMs);
    expect(await errorCode(await ana.request('GET', '/me'))).toEqual({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
  });

  it('logout deletes only this session and clears the cookie', async () => {
    const laptop = await signIn('student2');
    const phone = await signIn('student2');
    const res = await laptop.request('POST', '/auth/logout');
    expect(await res.json()).toEqual({ ok: true });
    const cookie = parseCookie(res.headers.get('Set-Cookie'));
    expect(cookie).toEqual({
      name: '__Host-session',
      value: '',
      attributes: ['HttpOnly', 'Max-Age=0', 'Path=/', 'SameSite=Lax', 'Secure'].sort(),
    });

    const token = laptop.cookie.slice('__Host-session='.length);
    const row = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, await sha256Hex(token)))
      .get();
    expect(row).toBeUndefined();
    expect((await laptop.request('GET', '/me')).status).toBe(401);
    expect((await phone.request('GET', '/me')).status).toBe(200);
  });
});

describe('me', () => {
  it('me.get returns the caller', async () => {
    const bor = await signIn('student2');
    expect(Me.parse(await (await bor.request('GET', '/me')).json())).toEqual(bor.me);
  });

  it("me.update changes the caller's row and never an exam membership", async () => {
    const cvetka = await signIn('student3');
    const examId = '00000000-0000-4000-8000-000000000100';
    const member = { examId, userId: cvetka.me.id, role: 'student' as const, joinedAt: 0 };
    await db.insert(examMembers).values({ ...member, enrolmentNo: '63240003' });

    const res = await cvetka.request('PATCH', '/me', { enrolmentNo: '63249999', locale: 'en' });
    const changed = { ...cvetka.me, enrolmentNo: '63249999', locale: 'en' };
    expect(await res.json()).toEqual(changed);
    expect(await (await cvetka.request('GET', '/me')).json()).toEqual(changed);
    const membership = await db
      .select()
      .from(examMembers)
      .where(eq(examMembers.userId, cvetka.me.id))
      .get();
    expect(membership?.enrolmentNo).toBe('63240003');

    const other = await db.select().from(users).where(eq(users.id, DEMO_USERS.student1.id)).get();
    expect(other).toMatchObject({ enrolmentNo: '63240001', locale: 'sl' });
  });

  it.each([{}, { enrolmentNo: '1234' }, { locale: 'de' }])('me.update rejects %j', async (body) => {
    const ana = await signIn('student1');
    expect(await errorCode(await ana.request('PATCH', '/me', body))).toEqual({
      status: 400,
      code: 'BAD_REQUEST',
    });
  });
});

describe('Origin check (SEC-4) on the accounts endpoints that change data', () => {
  const changing = (['auth.demo', 'auth.logout', 'me.update'] as const).flatMap((key) =>
    [undefined, 'https://evil.example'].map((origin) => ({ key, origin })),
  );

  it.each(changing)('$key with Origin $origin answers 403', async ({ key, origin }) => {
    const ana = await signIn('student1');
    const { method, path } = endpoints[key];
    const headers = { Cookie: ana.cookie, ...(origin ? { Origin: origin } : {}) };
    const body = JSON.stringify(key === 'auth.demo' ? { user: 'student1' } : { locale: 'en' });
    const res = await app.request(`/api${path}`, { method, headers, body }, env);
    expect(await errorCode(res)).toEqual({ status: 403, code: 'FORBIDDEN_ORIGIN' });
  });
});
