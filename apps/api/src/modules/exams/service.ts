import {
  DEFAULT_SETTINGS,
  LIMITS,
  type ExamForProfessor,
  type ExamForStudent,
  type ExamPhase,
  type ExamSettings,
  type ExamSummary,
  type ExamTiming,
  type StudentExamView,
  type TaskAdjustment,
  type ExamContent,
  type ExamVersionInfo,
} from '@codemark/contracts';
import { stateOf } from '@codemark/core';
import { and, asc, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import type { BatchItem, Db } from '../../db/client';
import { ApiError } from '../../http/errors';
import { addMemberQuery } from '../accounts';
import { examMembers } from '../../db/schema';
import { notify, notifyQuery } from '../platform';
import { exams, examVersions, taskAdjustments } from './schema';

export type ExamRecord = ExamTiming & {
  id: string;
  title: string;
  currentVersion: number;
  createdBy: string;
  settings: ExamSettings;
};

const JOIN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const code = [...bytes].map((byte) => JOIN_CHARS[byte % JOIN_CHARS.length]).join('');
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

async function examRow(db: Db, examId: string) {
  return db.select().from(exams).where(eq(exams.id, examId)).get();
}

export async function getExam(db: Db, examId: string): Promise<ExamRecord | null> {
  const row = await db
    .select({
      id: exams.id,
      title: exams.title,
      phase: exams.phase,
      opensAt: exams.opensAt,
      closesAt: exams.closesAt,
      closedAt: exams.closedAt,
      practice: exams.practice,
      currentVersion: exams.currentVersion,
      createdBy: exams.createdBy,
      settings: exams.settings,
    })
    .from(exams)
    .where(eq(exams.id, examId))
    .get();
  if (!row) return null;
  return row;
}

export async function getExamState(db: Db, examId: string, now: number) {
  const exam = await getExam(db, examId);
  if (!exam) throw new ApiError('NOT_FOUND', 'No such exam');
  return stateOf(exam, now);
}

export async function getVersion(
  db: Db,
  examId: string,
  version: number,
): Promise<{
  snapshot: ExamContent;
  studentView: StudentExamView;
  note: string;
  createdAt: number;
} | null> {
  const row = await db
    .select({
      snapshot: examVersions.snapshot,
      studentView: examVersions.studentView,
      note: examVersions.note,
      createdAt: examVersions.createdAt,
    })
    .from(examVersions)
    .where(and(eq(examVersions.examId, examId), eq(examVersions.version, version)))
    .get();
  if (!row) return null;
  return {
    snapshot: row.snapshot,
    studentView: row.studentView,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export async function getFinalVersion(
  db: Db,
  examId: string,
): Promise<{ version: number; snapshot: ExamContent }> {
  const exam = await db
    .select({ currentVersion: exams.currentVersion })
    .from(exams)
    .where(eq(exams.id, examId))
    .get();
  if (!exam) throw new ApiError('NOT_FOUND', 'No such exam');
  const version = await getVersion(db, examId, exam.currentVersion);
  if (!version) throw new ApiError('NOT_FOUND', 'The exam has no final version');
  return { version: exam.currentVersion, snapshot: version.snapshot };
}

export async function getTaskAdjustments(db: Db, examId: string): Promise<TaskAdjustment[]> {
  const rows = await db.select().from(taskAdjustments).where(eq(taskAdjustments.examId, examId));
  return rows.map((row) => ({
    taskId: row.taskId,
    removed: row.removed,
    keepAsBonus: row.keepAsBonus,
    decidedAt: new Date(row.decidedAt).toISOString(),
  }));
}

function summary(
  row: Pick<
    typeof exams.$inferSelect,
    'id' | 'title' | 'phase' | 'opensAt' | 'closesAt' | 'closedAt' | 'practice' | 'currentVersion'
  >,
  role: 'professor' | 'student',
  now: number,
): ExamSummary {
  const exam: ExamTiming = {
    phase: row.phase,
    opensAt: row.opensAt,
    closesAt: row.closesAt,
    closedAt: row.closedAt,
    practice: row.practice,
  };
  return {
    id: row.id,
    title: row.title,
    state: stateOf(exam, now),
    opensAt: new Date(row.opensAt).toISOString(),
    closesAt: row.closesAt === null ? null : new Date(row.closesAt).toISOString(),
    currentVersion: row.currentVersion,
    role,
    practice: row.practice,
  };
}

export async function createExam(
  db: Db,
  callerId: string,
  body: { title: string; opensAt: string; closesAt: string | null; practice: boolean },
  now: number,
): Promise<ExamSummary> {
  const opensAt = Date.parse(body.opensAt);
  const closesAt = body.closesAt === null ? null : Date.parse(body.closesAt);
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = crypto.randomUUID();
    const joinCode = generateJoinCode();
    const row = {
      id,
      title: body.title,
      joinCode,
      opensAt,
      closesAt,
      phase: 'draft' as ExamPhase,
      practice: body.practice,
      settings: DEFAULT_SETTINGS,
      draft: { schemaVersion: 1, tasks: [] } as ExamContent,
      currentVersion: 0,
      closedAt: null,
      releasedAt: null,
      createdBy: callerId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db.batch([
        db.insert(exams).values(row),
        addMemberQuery(db, {
          examId: id,
          userId: callerId,
          role: 'professor',
          enrolmentNo: null,
          joinedAt: now,
        }),
      ]);
      return summary(row, 'professor', now);
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  throw new ApiError('INTERNAL', 'Could not generate a unique join code');
}

export async function listExams(db: Db, userId: string, now: number): Promise<ExamSummary[]> {
  const rows = await db
    .select({
      id: exams.id,
      title: exams.title,
      phase: exams.phase,
      opensAt: exams.opensAt,
      closesAt: exams.closesAt,
      closedAt: exams.closedAt,
      practice: exams.practice,
      currentVersion: exams.currentVersion,
      role: examMembers.role,
    })
    .from(exams)
    .innerJoin(examMembers, eq(exams.id, examMembers.examId))
    .where(eq(examMembers.userId, userId))
    .orderBy(desc(exams.opensAt));
  return rows.map((row) => summary(row, row.role, now));
}

export async function getExamDetail(
  db: Db,
  examId: string,
  callerId: string,
  callerRole: 'professor' | 'student',
  now: number,
): Promise<ExamForProfessor | ExamForStudent> {
  if (callerRole === 'professor') {
    const row = await examRow(db, examId);
    if (!row) throw new ApiError('NOT_FOUND', 'No such exam');
    const examSummary = summary(row, callerRole, now);
    const [versions, adjustments, finalVersionRows] = await db.batch([
      db
        .select({
          version: examVersions.version,
          createdAt: examVersions.createdAt,
          note: examVersions.note,
        })
        .from(examVersions)
        .where(eq(examVersions.examId, examId))
        .orderBy(asc(examVersions.version)),
      db.select().from(taskAdjustments).where(eq(taskAdjustments.examId, examId)),
      db
        .select({ snapshot: examVersions.snapshot })
        .from(examVersions)
        .where(and(eq(examVersions.examId, examId), eq(examVersions.version, row.currentVersion)))
        .limit(1),
    ]);
    const versionInfo: ExamVersionInfo[] = versions.map((version) => ({
      version: version.version,
      createdAt: new Date(version.createdAt).toISOString(),
      note: version.note,
    }));
    return {
      role: 'professor',
      exam: examSummary,
      joinCode: row.joinCode,
      settings: row.settings,
      draft: row.draft,
      finalVersionTasks:
        finalVersionRows[0]?.snapshot.tasks.map(({ id, title }) => ({ id, title })) ?? [],
      versions: versionInfo,
      adjustments: adjustments.map((rowAdjustment) => ({
        taskId: rowAdjustment.taskId,
        removed: rowAdjustment.removed,
        keepAsBonus: rowAdjustment.keepAsBonus,
        decidedAt: new Date(rowAdjustment.decidedAt).toISOString(),
      })),
    };
  }
  const row = await db
    .select({
      id: exams.id,
      title: exams.title,
      phase: exams.phase,
      opensAt: exams.opensAt,
      closesAt: exams.closesAt,
      closedAt: exams.closedAt,
      practice: exams.practice,
      currentVersion: exams.currentVersion,
      settings: exams.settings,
    })
    .from(exams)
    .where(eq(exams.id, examId))
    .get();
  if (!row) throw new ApiError('NOT_FOUND', 'No such exam');
  const examSummary = summary(row, 'student', now);
  const state = stateOf(
    {
      phase: row.phase,
      opensAt: row.opensAt,
      closesAt: row.closesAt,
      closedAt: row.closedAt,
      practice: row.practice,
    },
    now,
  );
  let view = null;
  if (state !== 'draft' && state !== 'scheduled') {
    const version = await db
      .select({ studentView: examVersions.studentView })
      .from(examVersions)
      .where(and(eq(examVersions.examId, examId), eq(examVersions.version, row.currentVersion)))
      .get();
    view = version?.studentView ?? null;
  }
  return { role: 'student', exam: examSummary, autocomplete: row.settings.autocomplete, view };
}

export async function saveDraft(db: Db, examId: string, draft: ExamContent, now: number) {
  const state = await getExamState(db, examId, now);
  if (state === 'closed' || state === 'released') {
    throw new ApiError('EXAM_CLOSED', 'The exam is closed');
  }
  await db.update(exams).set({ draft, updatedAt: now }).where(eq(exams.id, examId));
  return { savedAt: new Date(now).toISOString() };
}

export async function updateExamSettings(
  db: Db,
  examId: string,
  body: { title?: string; opensAt?: string; closesAt?: string; settings?: ExamSettings },
  now: number,
): Promise<ExamSummary> {
  const row = await examRow(db, examId);
  if (!row) throw new ApiError('NOT_FOUND', 'No such exam');
  const state = stateOf(
    {
      phase: row.phase,
      opensAt: row.opensAt,
      closesAt: row.closesAt,
      closedAt: row.closedAt,
      practice: row.practice,
    },
    now,
  );

  const fields: Partial<typeof exams.$inferInsert> = {};
  if (body.title !== undefined) fields.title = body.title;
  if (body.settings !== undefined) {
    if (state === 'released') throw new ApiError('EXAM_CLOSED', 'The exam is released');
    fields.settings = body.settings;
  }
  if (body.opensAt !== undefined) {
    if (state !== 'draft' && state !== 'scheduled') {
      throw new ApiError('CONFLICT', 'The opening time cannot change in this state');
    }
    fields.opensAt = Date.parse(body.opensAt);
  }
  if (body.closesAt !== undefined) {
    if (state !== 'draft' && state !== 'scheduled' && state !== 'open') {
      throw new ApiError('EXAM_CLOSED', 'The closing time cannot change in this state');
    }
    if (row.practice) throw new ApiError('BAD_REQUEST', 'A practice exam has no closing time');
    const requested = Date.parse(body.closesAt);
    fields.closesAt = requested < now ? now : requested;
  }

  const opensAt = fields.opensAt ?? row.opensAt;
  const closesAt = fields.closesAt !== undefined ? fields.closesAt : row.closesAt;
  if (closesAt !== null && closesAt <= opensAt) {
    throw new ApiError('BAD_REQUEST', 'closesAt must be later than opensAt');
  }
  fields.updatedAt = now;
  const updated = await db.update(exams).set(fields).where(eq(exams.id, examId)).returning().get();
  if (!updated) throw new ApiError('NOT_FOUND', 'No such exam');
  return summary(updated, 'professor', now);
}

export async function publishExam(db: Db, examId: string, now: number) {
  const row = await examRow(db, examId);
  if (!row) throw new ApiError('NOT_FOUND', 'No such exam');
  const state = stateOf(
    {
      phase: row.phase,
      opensAt: row.opensAt,
      closesAt: row.closesAt,
      closedAt: row.closedAt,
      practice: row.practice,
    },
    now,
  );
  if (state !== 'draft') throw new ApiError('CONFLICT', 'Publish is allowed only in draft');
  if (row.draft.tasks.length === 0) throw new ApiError('BAD_REQUEST', 'The draft has no task');
  const { buildStudentView } = await import('@codemark/core');
  const studentView = buildStudentView(row.draft);
  await db.batch([
    db.insert(examVersions).values({
      examId,
      version: 1,
      snapshot: row.draft,
      studentView,
      note: '',
      createdAt: now,
    }),
    db
      .update(exams)
      .set({ phase: 'published', currentVersion: 1, updatedAt: now })
      .where(eq(exams.id, examId)),
  ]);
  return { version: 1 };
}

export async function newExamVersion(db: Db, examId: string, note: string, now: number) {
  const row = await examRow(db, examId);
  if (!row) throw new ApiError('NOT_FOUND', 'No such exam');
  const state = stateOf(
    {
      phase: row.phase,
      opensAt: row.opensAt,
      closesAt: row.closesAt,
      closedAt: row.closedAt,
      practice: row.practice,
    },
    now,
  );
  if (state === 'draft') throw new ApiError('CONFLICT', 'Publish the exam first');
  if (state === 'closed' || state === 'released') {
    throw new ApiError('EXAM_CLOSED', 'The exam is closed');
  }
  if (state !== 'scheduled' && state !== 'open')
    throw new ApiError('CONFLICT', 'This state cannot add a version');
  if (row.draft.tasks.length === 0) throw new ApiError('BAD_REQUEST', 'The draft has no task');
  const current = await getVersion(db, examId, row.currentVersion);
  if (current && JSON.stringify(current.snapshot) === JSON.stringify(row.draft)) {
    throw new ApiError('CONFLICT', 'The draft is unchanged');
  }
  const version = row.currentVersion + 1;
  const { buildStudentView } = await import('@codemark/core');
  const studentView = buildStudentView(row.draft);
  const statements: BatchItem[] = [
    db.insert(examVersions).values({
      examId,
      version,
      snapshot: row.draft,
      studentView,
      note,
      createdAt: now,
    }),
    db.update(exams).set({ currentVersion: version, updatedAt: now }).where(eq(exams.id, examId)),
  ];
  if (state === 'open') {
    statements.push(
      notifyQuery(
        db,
        { examId, userId: null, kind: 'task_changed', payload: { version, note } },
        now,
      ),
    );
  }
  if (statements.length === 2) await db.batch([statements[0]!, statements[1]!]);
  else await db.batch([statements[0]!, statements[1]!, statements[2]!]);
  return { version };
}

export async function closeDueExams(db: Db, now: number): Promise<number> {
  const due = await db
    .select({ id: exams.id, createdBy: exams.createdBy })
    .from(exams)
    .where(
      and(
        eq(exams.phase, 'published'),
        eq(exams.practice, false),
        isNull(exams.closedAt),
        lte(sql`${exams.closesAt} + ${LIMITS.graceMs}`, now),
      ),
    )
    .limit(10);
  let closed = 0;
  for (const exam of due) {
    const result = await db
      .update(exams)
      .set({ closedAt: now, updatedAt: now })
      .where(and(eq(exams.id, exam.id), isNull(exams.closedAt)))
      .returning({ id: exams.id });
    if (result.length === 1) {
      closed++;
      await notify(
        db,
        {
          examId: exam.id,
          userId: exam.createdBy,
          kind: 'exam_closed',
          payload: {},
        },
        now,
      );
    }
  }
  return closed;
}

export function releaseQuery(db: Db, examId: string, now: number): BatchItem {
  return db
    .update(exams)
    .set({ phase: 'released', releasedAt: now, updatedAt: now })
    .where(and(eq(exams.id, examId), eq(exams.phase, 'published')));
}

export async function adjustTask(
  db: Db,
  examId: string,
  taskId: string,
  body: { removed: boolean; keepAsBonus: boolean },
  now: number,
  callerId: string,
) {
  const row = await examRow(db, examId);
  if (!row) throw new ApiError('NOT_FOUND', 'No such exam');
  const state = stateOf(
    {
      phase: row.phase,
      opensAt: row.opensAt,
      closesAt: row.closesAt,
      closedAt: row.closedAt,
      practice: row.practice,
    },
    now,
  );
  if (state !== 'closed' && state !== 'released') {
    throw new ApiError('CONFLICT', 'Task adjustments are allowed only after closing');
  }
  const finalVersion = await getFinalVersion(db, examId);
  if (!finalVersion.snapshot.tasks.some((task) => task.id === taskId)) {
    throw new ApiError('NOT_FOUND', 'No such task in the final version');
  }
  const value = {
    examId,
    taskId,
    removed: body.removed,
    keepAsBonus: body.keepAsBonus,
    decidedBy: callerId,
    decidedAt: now,
  };
  const statements: BatchItem[] = [
    db
      .insert(taskAdjustments)
      .values(value)
      .onConflictDoUpdate({
        target: [taskAdjustments.examId, taskAdjustments.taskId],
        set: {
          removed: body.removed,
          keepAsBonus: body.keepAsBonus,
          decidedBy: callerId,
          decidedAt: now,
        },
      }),
  ];
  if (state === 'released') {
    statements.push(
      notifyQuery(db, { examId, userId: null, kind: 'grade_changed', payload: { taskId } }, now),
    );
  }
  if (statements.length === 1) await db.batch([statements[0]!]);
  else await db.batch([statements[0]!, ...statements.slice(1)] as [BatchItem, ...BatchItem[]]);
  return {
    taskId,
    removed: body.removed,
    keepAsBonus: body.keepAsBonus,
    decidedAt: new Date(now).toISOString(),
  };
}
