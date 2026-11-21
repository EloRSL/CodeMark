import { ApiErrorBody, type ErrorCode, type ExamStatus, type Ok } from '@codemark/contracts';
import { DEMO_USERS, sha256Hex } from '@codemark/core';
import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '../db/client';
import { examMembers, sessions } from '../db/schema';
import { clock } from '../platform/clock';
import { requestContext, type AppEnv } from './context';
import { ApiError, notFound, onError } from './errors';
import { implement } from './registry';

const T0 = Date.parse('2026-12-01T10:00:00.000Z');
const EXAM = '00000000-0000-4000-8000-000000000100';
const SUBMISSION = '00000000-0000-4000-8000-000000000200';
const id = (n: number) => `00000000-0000-4000-8000-00000000001${n}`;
// The seeded demo users, each with a session of its own.
const people = {
  professor: { id: DEMO_USERS.professor.id, token: 'professor-token', expiresAt: T0 + 1 },
  student: { id: DEMO_USERS.student1.id, token: 'student-token', expiresAt: T0 + 1 },
  outsider: { id: DEMO_USERS.student2.id, token: 'outsider-token', expiresAt: T0 + 1 },
  expired: { id: DEMO_USERS.student3.id, token: 'expired-token', expiresAt: T0 }, // expires now
};

let logoutResult: () => Promise<unknown>;

const app = new Hono<AppEnv>();
app.use(requestContext({ submission: async (_db, s) => (s === SUBMISSION ? EXAM : null) }));
app.onError(onError);
app.notFound(notFound);
implement(app, 'me.get', async ({ user }) => user);
implement(app, 'me.update', async ({ user }) => user);
implement(app, 'exams.create', async () => {
  throw new Error('unreachable');
});
implement(app, 'exams.status', async ({ now, query }) => {
  const at = new Date(now).toISOString();
  const status: ExamStatus = {
    serverTime: at,
    state: 'open',
    opensAt: at,
    closesAt: null,
    version: 1,
    notices: [],
    latestNoticeId: query.since ?? 0,
  };
  return status;
});
implement(app, 'review.release', async ({ now }) => ({ releasedAt: new Date(now).toISOString() }));
implement(app, 'submissions.lateDecision', async () => ({ ok: true as const }));
implement(app, 'review.confirm', async () => {
  throw new Error('unreachable');
});
implement(app, 'auth.logout', async () => (await logoutResult()) as Ok);

function send(
  method: string,
  path: string,
  opts: { token?: string; origin?: string | null; body?: unknown } = {},
) {
  const { token, origin = env.APP_ORIGIN, body } = opts;
  const headers = {
    ...(token ? { Cookie: `__Host-session=${token}` } : {}),
    ...(origin ? { Origin: origin } : {}),
  };
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return app.request(`/api${path}`, { method, headers, body: raw }, env);
}

async function expectError(pending: Response | Promise<Response>, status: number, code: ErrorCode) {
  const res = await pending;
  expect(res.status).toBe(status);
  const { error } = ApiErrorBody.parse(await res.json());
  expect(error.code).toBe(code);
  return error;
}

beforeEach(async () => {
  clock.set(T0);
  const db = createDb(env.DB);
  for (const p of Object.values(people)) {
    const tokenHash = await sha256Hex(p.token);
    await db
      .insert(sessions)
      .values({ tokenHash, userId: p.id, createdAt: 0, expiresAt: p.expiresAt })
      .onConflictDoNothing();
  }
  await db
    .insert(examMembers)
    .values([
      { examId: EXAM, userId: people.professor.id, role: 'professor', joinedAt: 0 },
      { examId: EXAM, userId: people.student.id, role: 'student', joinedAt: 0 },
    ])
    .onConflictDoNothing();
});

afterEach(() => clock.set(null));

describe('implement runs the API-5 checks in order', () => {
  it('1. checks the Origin of a data-changing request before the session', async () => {
    await expectError(
      send('PATCH', '/me', { origin: 'https://evil.example' }),
      403,
      'FORBIDDEN_ORIGIN',
    );
    await expectError(send('PATCH', '/me', { origin: null }), 403, 'FORBIDDEN_ORIGIN');
  });

  it('2. needs a valid session that has not expired', async () => {
    await expectError(send('GET', '/me'), 401, 'UNAUTHENTICATED');
    await expectError(send('GET', '/me', { token: 'unknown' }), 401, 'UNAUTHENTICATED');
    await expectError(send('GET', '/me', { token: people.expired.token }), 401, 'UNAUTHENTICATED');
    const res = await send('GET', '/me', { token: people.student.token });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: people.student.id, role: 'student', demo: true });
  });

  it('3. answers 404 to a non-member and for an exam that does not exist', async () => {
    const outsider = { token: people.outsider.token };
    await expectError(send('POST', `/exams/${EXAM}/release`, outsider), 404, 'NOT_FOUND');
    const missing = `/exams/${id(9)}/release`;
    await expectError(send('POST', missing, { token: people.professor.token }), 404, 'NOT_FOUND');
  });

  it("4. checks the caller's role in the exam, with the request's time in the handler", async () => {
    const path = `/exams/${EXAM}/release`;
    await expectError(send('POST', path, { token: people.student.token }), 403, 'FORBIDDEN');
    const res = await send('POST', path, { token: people.professor.token });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ releasedAt: '2026-12-01T10:00:00.000Z' });
  });

  it("4. checks the user's role without a scope, before the body", async () => {
    await expectError(send('POST', '/exams', { token: people.student.token }), 403, 'FORBIDDEN');
  });

  it('5. validates the body and the query last', async () => {
    const student = { token: people.student.token };
    const error = await expectError(
      send('PATCH', '/me', { ...student, body: {} }),
      400,
      'BAD_REQUEST',
    );
    expect(error.details).toEqual([
      expect.objectContaining({ message: 'Give at least one field' }),
    ]);
    await expectError(send('PATCH', '/me', { ...student, body: '{' }), 400, 'BAD_REQUEST');

    const status = `/exams/${EXAM}/status`;
    await expectError(send('GET', `${status}?since=abc`, student), 400, 'BAD_REQUEST');
    const res = await send('GET', `${status}?since=5`, student);
    expect(await res.json()).toMatchObject({ latestNoticeId: 5 }); // coerced by StatusQuery
  });

  it('resolves a submission to its exam through the wired resolver', async () => {
    const opts = { token: people.professor.token, body: { decision: 'accepted' } };
    const res = await send('POST', `/submissions/${SUBMISSION}/late-decision`, opts);
    expect(await res.json()).toEqual({ ok: true });
    await expectError(send('POST', `/submissions/${id(9)}/late-decision`, opts), 404, 'NOT_FOUND');
  });

  it('fails with 500 when a scope resolver is not wired', async () => {
    const res = send('POST', `/score-records/${id(9)}/confirm`, { token: people.professor.token });
    const error = await expectError(res, 500, 'INTERNAL');
    expect(error.message).toBe('scope resolver not wired');
  });
});

describe('implement turns errors into ApiErrorBody', () => {
  const logout = () => send('POST', '/auth/logout', { token: people.student.token });

  it('a thrown ApiError keeps its code and status', async () => {
    logoutResult = async () => {
      throw new ApiError('CONFLICT', 'Busy');
    };
    expect((await expectError(logout(), 409, 'CONFLICT')).message).toBe('Busy');
  });

  it('any other error is logged and becomes 500 INTERNAL', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    logoutResult = async () => {
      throw new Error('database on fire');
    };
    expect((await expectError(logout(), 500, 'INTERNAL')).message).toBe('Internal error');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('a response that breaks its schema becomes 500 INTERNAL outside production', async () => {
    logoutResult = async () => ({ ok: 'yes' });
    await expectError(logout(), 500, 'INTERNAL');
  });

  it('an unknown route is a JSON 404', async () => {
    await expectError(send('GET', '/nowhere'), 404, 'NOT_FOUND');
  });
});
