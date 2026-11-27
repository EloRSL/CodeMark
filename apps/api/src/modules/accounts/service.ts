import {
  LIMITS,
  type Access,
  type Member,
  type Scope,
  type UpdateMeBody,
  type UserRole,
} from '@codemark/contracts';
import { sha256Hex } from '@codemark/core';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { BatchItem, Db } from '../../db/client';
import type { AppEnv, SessionUser } from '../../http/context';
import { ApiError } from '../../http/errors';
import { examMembers, sessions, users } from './schema';

export type Membership = {
  examId: string;
  userId: string;
  role: UserRole;
  enrolmentNo: string | null;
  joinedAt: number;
};

/** Map a submission or a score record to its exam. The owning modules wire them in app.ts. */
export type ScopeResolvers = {
  submission: (db: Db, submissionId: string) => Promise<string | null>; // submissions.submissionExamId
  scoreRecord: (db: Db, scoreRecordId: string) => Promise<string | null>; // review.scoreRecordExamId
};

// SEC-5. Max-Age is in seconds.
const SESSION_COOKIE = '__Host-session';
const cookieFlags = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' } as const;

const meColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  enrolmentNo: users.enrolmentNo,
  locale: users.locale,
  demo: users.demo,
};

/** SEC-5: a new session row (only the token's hash) and its cookie on the response. */
export async function createSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, ''); // base64url
  const now = c.get('now');
  await c
    .get('db')
    .insert(sessions)
    .values({
      tokenHash: await sha256Hex(token),
      userId,
      createdAt: now,
      expiresAt: now + LIMITS.sessionMs,
    });
  setCookie(c, SESSION_COOKIE, token, { ...cookieFlags, maxAge: LIMITS.sessionMs / 1000 });
}

/** Logout: deletes this session's row and clears the cookie. Other sessions of the user stay. */
export async function endSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c
      .get('db')
      .delete(sessions)
      .where(eq(sessions.tokenHash, await sha256Hex(token)));
  }
  setCookie(c, SESSION_COOKIE, '', { ...cookieFlags, maxAge: 0 });
}

export async function getMe(db: Db, userId: string): Promise<SessionUser | null> {
  return (await db.select(meColumns).from(users).where(eq(users.id, userId)).get()) ?? null;
}

/** Changes only the caller's users row, never an exam_members.enrolment_no (api.md #6). */
export async function updateMe(db: Db, userId: string, fields: UpdateMeBody): Promise<SessionUser> {
  const me = await db
    .update(users)
    .set(fields)
    .where(eq(users.id, userId))
    .returning(meColumns)
    .get();
  if (!me) throw new ApiError('UNAUTHENTICATED', 'The user no longer exists');
  return me;
}

async function getSessionUser(db: Db, token: string, now: number): Promise<SessionUser | null> {
  const user = await db
    .select(meColumns)
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, await sha256Hex(token)), gt(sessions.expiresAt, now)))
    .get();
  return user ?? null;
}

export async function getMembership(
  db: Db,
  examId: string,
  userId: string,
): Promise<Membership | null> {
  const member = await db
    .select()
    .from(examMembers)
    .where(and(eq(examMembers.examId, examId), eq(examMembers.userId, userId)))
    .get();
  return member ?? null;
}

export function addMemberQuery(db: Db, member: Membership): BatchItem {
  return db.insert(examMembers).values(member);
}

/** The exam's student members with their names, by enrolment number. */
export async function listStudentMembers(db: Db, examId: string): Promise<Member[]> {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: examMembers.role,
      enrolmentNo: examMembers.enrolmentNo,
    })
    .from(examMembers)
    .innerJoin(users, eq(users.id, examMembers.userId))
    .where(and(eq(examMembers.examId, examId), eq(examMembers.role, 'student')))
    .orderBy(asc(examMembers.enrolmentNo));
}

/** User id to name. Unknown ids are left out. */
export async function getUserNames(db: Db, userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  // One bound JSON array instead of IN (?, ?, ...): D1 allows at most 100 bound parameters.
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(sql`${users.id} IN (SELECT value FROM json_each(${JSON.stringify(userIds)}))`);
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function resolveScopeExamId(
  db: Db,
  scope: Scope,
  params: Record<string, string>,
  resolvers: Partial<ScopeResolvers>,
): Promise<string | null> {
  if (scope === 'none') return null;
  // A missing exam has no members, so the membership check answers 404 without reading exams.
  if (scope === 'exam') return params.examId ?? null;
  const resolve = resolvers[scope];
  if (!resolve) throw new ApiError('INTERNAL', 'scope resolver not wired');
  const id = params[`${scope}Id`];
  return id === undefined ? null : resolve(db, id);
}

/** SEC-3: API-5 steps 2 to 4 (session, scope, role) for every implemented route. */
export async function checkAccess(
  c: Context<AppEnv>,
  access: Access,
  scope: Scope,
): Promise<{ user: SessionUser | null; examId: string | null; membership: Membership | null }> {
  const db = c.get('db');
  let user: SessionUser | null = null;
  if (access !== 'public') {
    const token = getCookie(c, SESSION_COOKIE);
    user = token ? await getSessionUser(db, token, c.get('now')) : null;
    if (!user) throw new ApiError('UNAUTHENTICATED', 'Sign in first');
  }
  const examId = await resolveScopeExamId(db, scope, c.req.param(), c.get('resolvers'));
  let membership: Membership | null = null;
  if (scope !== 'none') {
    membership = examId && user ? await getMembership(db, examId, user.id) : null;
    if (!membership) throw new ApiError('NOT_FOUND', `No such ${scope}, or not a member`);
  }
  const role = membership?.role ?? user?.role;
  if ((access === 'professor' || access === 'student') && role !== access) {
    throw new ApiError('FORBIDDEN', `Only a ${access} may do this`);
  }
  return { user, examId, membership };
}
