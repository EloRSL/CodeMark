import {
  JobPayloads,
  LIMITS,
  Notice,
  NoticePayloads,
  type JobPayload,
  type JobType,
  type NoticeKind,
  type UserRole,
} from '@codemark/contracts';
import { and, asc, eq, gt, gte, isNull, lt, lte, max, or, sql } from 'drizzle-orm';
import type { BatchItem, Db } from '../../db/client';
import { jobs, notices } from './schema';

// Jobs and notices (internal-interfaces.md section 3, platform; ADR-005).

export type NewJob<T extends JobType = JobType> = {
  type: T;
  payload: JobPayload<T>;
  dedupeKey: string;
  runAfter: number;
};

export type NoticePayload<K extends NoticeKind> = ReturnType<(typeof NoticePayloads)[K]['parse']>;
export type NewNotice<K extends NoticeKind = NoticeKind> = {
  examId: string;
  userId: string | null;
  kind: K;
  payload: NoticePayload<K>;
};

export type JobContext = { db: Db; env: Env; now: number; attempt: number }; // attempt starts at 1
export type JobOutcome = { kind: 'done' } | { kind: 'wait'; runAfter: number };
export type JobHandlerDef<T extends JobType> = {
  run(payload: JobPayload<T>, ctx: JobContext): Promise<JobOutcome>; // throw to fail the attempt
  onFailed?(payload: JobPayload<T>, ctx: JobContext): Promise<void>; // after the last attempt
};
export type JobHandlers = { [T in JobType]: JobHandlerDef<T> };

const insertJob = (db: Db, job: NewJob, now: number) =>
  db
    .insert(jobs)
    .values({
      id: crypto.randomUUID(),
      type: job.type,
      payload: JobPayloads[job.type].parse(job.payload), // throws on a bad payload (DM-2)
      status: 'queued',
      runAfter: job.runAfter,
      dedupeKey: job.dedupeKey,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: jobs.dedupeKey });

export function enqueueQuery(db: Db, job: NewJob, now: number): BatchItem {
  return insertJob(db, job, now);
}

export async function enqueue(db: Db, job: NewJob, now: number): Promise<void> {
  await insertJob(db, job, now).run();
}

const insertNotice = (db: Db, notice: NewNotice, now: number) =>
  db.insert(notices).values({
    examId: notice.examId,
    userId: notice.userId,
    kind: notice.kind,
    payload: NoticePayloads[notice.kind].parse(notice.payload),
    createdAt: now,
  });

export function notifyQuery(db: Db, notice: NewNotice, now: number): BatchItem {
  return insertNotice(db, notice, now);
}

export async function notify(db: Db, notice: NewNotice, now: number): Promise<void> {
  await insertNotice(db, notice, now).run();
}

type JobRow = typeof jobs.$inferSelect;

const STOPPED = 'run stopped before it finished';
const errorText = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1000);

/** Claims and runs due jobs one at a time. Returns the number claimed, including failed ones. */
export async function runDueJobs(
  db: Db,
  env: Env,
  now: number,
  limit: number,
  handlers: JobHandlers,
): Promise<number> {
  const setJob = (id: string, fields: Partial<JobRow>) =>
    db
      .update(jobs)
      .set({ ...fields, lockedUntil: null, updatedAt: now })
      .where(eq(jobs.id, id));

  const failed = async (job: JobRow) => {
    const onFailed = handlers[job.type].onFailed;
    const payload = JobPayloads[job.type].safeParse(job.payload);
    if (!onFailed || !payload.success) return;
    try {
      await onFailed(payload.data, { db, env, now, attempt: job.attempts });
    } catch (error) {
      console.error(`onFailed of job ${job.id} threw`, error);
      await setJob(job.id, { lastError: `onFailed: ${errorText(error)}`.slice(0, 1000) });
    }
  };

  // 1. An expired lock means the run holding the job was stopped: a failed attempt (ADR5-3).
  const expired = and(eq(jobs.status, 'running'), lt(jobs.lockedUntil, now));
  await db
    .update(jobs)
    .set({ status: 'queued', lockedUntil: null, lastError: STOPPED, updatedAt: now })
    .where(and(expired, lt(jobs.attempts, LIMITS.jobMaxAttempts)));
  const spent = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(expired, gte(jobs.attempts, LIMITS.jobMaxAttempts)))
    .limit(limit);

  let claimed = 0;
  for (const { id } of spent) {
    const job = await db
      .update(jobs)
      .set({ status: 'failed', lockedUntil: null, lastError: STOPPED, updatedAt: now })
      .where(and(eq(jobs.id, id), expired))
      .returning()
      .get();
    if (!job) continue; // another run failed it first
    claimed++;
    await failed(job);
  }
  if (claimed >= limit) return claimed;

  // 2. and 3. One at a time, so a stopped run leaves at most one job locked.
  const due = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.status, 'queued'), lte(jobs.runAfter, now)))
    .orderBy(asc(jobs.runAfter))
    .limit(limit - claimed);

  for (const { id } of due) {
    const job = await db
      .update(jobs)
      .set({
        status: 'running',
        lockedUntil: now + LIMITS.jobLockMs,
        attempts: sql`${jobs.attempts} + 1`,
        updatedAt: now,
      })
      .where(and(eq(jobs.id, id), eq(jobs.status, 'queued')))
      .returning()
      .get();
    if (!job) continue; // another run claimed it
    claimed++;

    // 4. A payload that fails its schema can't run, and onFailed can't take it either.
    const payload = JobPayloads[job.type].safeParse(job.payload);
    if (!payload.success) {
      await setJob(job.id, { status: 'failed', lastError: errorText(payload.error) });
      continue;
    }

    // 5. and 6.
    let outcome: JobOutcome;
    try {
      outcome = await handlers[job.type].run(payload.data, { db, env, now, attempt: job.attempts });
    } catch (error) {
      const delay = LIMITS.jobRetryDelaysMs[job.attempts - 1];
      if (job.attempts < LIMITS.jobMaxAttempts && delay !== undefined) {
        await setJob(job.id, {
          status: 'queued',
          runAfter: now + delay,
          lastError: errorText(error),
        });
      } else {
        await setJob(job.id, { status: 'failed', lastError: errorText(error) });
        await failed(job);
      }
      continue;
    }
    if (outcome.kind === 'done') await setJob(job.id, { status: 'done' });
    else
      await setJob(job.id, {
        status: 'queued',
        runAfter: outcome.runAfter,
        attempts: job.attempts - 1, // a budget wait spends no attempt
      });
  }
  return claimed;
}

/** The notices an exam member may see (api.md #10, rules 2 to 4). */
export async function listNotices(
  db: Db,
  viewer: { examId: string; userId: string; role: UserRole },
  since: number | undefined,
): Promise<{ notices: Notice[]; latestNoticeId: number }> {
  const visible = and(
    eq(notices.examId, viewer.examId),
    viewer.role === 'student'
      ? or(eq(notices.userId, viewer.userId), isNull(notices.userId))
      : eq(notices.userId, viewer.userId),
  );
  const latest = db
    .select({ id: max(notices.id) })
    .from(notices)
    .where(visible);
  if (since === undefined) {
    const [row] = await latest;
    return { notices: [], latestNoticeId: row?.id ?? 0 };
  }
  const [rows, [row]] = await db.batch([
    db
      .select()
      .from(notices)
      .where(and(visible, gt(notices.id, since)))
      .orderBy(asc(notices.id))
      .limit(LIMITS.noticesPerPoll),
    latest,
  ]);
  return {
    notices: rows.map((n) =>
      Notice.parse({ ...n, createdAt: new Date(n.createdAt).toISOString() }),
    ),
    latestNoticeId: row?.id ?? 0,
  };
}
