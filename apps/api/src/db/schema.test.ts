import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDb } from './client';
import { examMembers, jobs, notices, users } from './schema';

const db = createDb(env.DB);

const member = (userId: string, enrolmentNo: string | null) => ({
  examId: 'exam-1',
  userId,
  role: enrolmentNo === null ? ('professor' as const) : ('student' as const),
  enrolmentNo,
  joinedAt: 0,
});

const job = (id: string, dedupeKey: string) => ({
  id,
  type: 'grade.submission' as const,
  payload: { submissionId: '00000000-0000-4000-8000-000000000501' },
  status: 'queued' as const,
  runAfter: 0,
  dedupeKey,
  createdAt: 0,
  updatedAt: 0,
});

describe('accounts and platform tables', () => {
  it('applies the defaults and reads booleans back', async () => {
    await db
      .insert(users)
      .values({ id: 'u1', email: 'a@demo.invalid', name: 'A', role: 'student', createdAt: 0 });
    const user = await db.select().from(users).where(eq(users.id, 'u1')).get();
    expect(user).toMatchObject({ locale: 'sl', demo: false, enrolmentNo: null });
  });

  it('allows an enrolment number once per exam, and many members without one', async () => {
    await db
      .insert(examMembers)
      .values([member('p1', null), member('p2', null), member('s1', '63240001')]);
    await expect(db.insert(examMembers).values(member('s2', '63240001'))).rejects.toThrow();
  });

  it('keeps one job per dedupe key', async () => {
    await db.insert(jobs).values(job('j1', 'grade:1'));
    await expect(db.insert(jobs).values(job('j2', 'grade:1'))).rejects.toThrow();
  });

  it('numbers notices upwards, for the polling cursor', async () => {
    const notice = { examId: 'exam-1', kind: 'exam_closed' as const, payload: {}, createdAt: 0 };
    const [a, b] = await db.insert(notices).values([notice, notice]).returning({ id: notices.id });
    expect(b!.id).toBeGreaterThan(a!.id);
  });
});
