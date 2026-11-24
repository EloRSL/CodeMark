import { grade } from '@codemark/core';
import type { Hono } from 'hono';
import type { AppEnv } from '../../http/context';
import { implement } from '../../http/registry';
import {
  getExamState,
  getExamDetail,
  getFinalVersion,
  getTaskAdjustments,
  adjustTask,
  createExam,
  listExams,
  newExamVersion,
  publishExam,
  saveDraft,
  updateExamSettings,
} from './service';
import { examMembers, users, exams } from '../../db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { ApiError } from '../../http/errors';

export function examRoutes(app: Hono<AppEnv>): void {
  implement(app, 'exams.create', async ({ db, user, body, now }) =>
    createExam(db, user.id, body, now),
  );

  implement(app, 'exams.list', async ({ db, user, now }) => ({
    exams: await listExams(db, user.id, now),
  }));

  implement(app, 'exams.get', async ({ db, user, examId, membership, now }) =>
    getExamDetail(
      db,
      examId!,
      user.id,
      membership!.role === 'professor' ? 'professor' : 'student',
      now,
    ),
  );

  implement(app, 'exams.saveDraft', async ({ db, examId, body, now }) =>
    saveDraft(db, examId!, body, now),
  );

  implement(app, 'exams.updateSettings', async ({ db, examId, body, now }) =>
    updateExamSettings(db, examId!, body, now),
  );

  implement(app, 'exams.publish', async ({ db, examId, now }) => publishExam(db, examId!, now));

  implement(app, 'exams.newVersion', async ({ db, examId, body, now }) =>
    newExamVersion(db, examId!, body.note, now),
  );

  implement(app, 'exams.adjustTask', async ({ db, examId, params, body, now, user }) =>
    adjustTask(db, examId!, params.taskId, body, now, user.id),
  );

  implement(app, 'exams.gradesCsv', async ({ db, examId, now, user }) => {
    const state = await getExamState(db, examId!, now);
    if (state !== 'closed' && state !== 'released') {
      throw new ApiError('CONFLICT', 'CSV export is allowed only after closing');
    }
    const finalVersion = await getFinalVersion(db, examId!);
    const adjustments = await getTaskAdjustments(db, examId!);
    const adjustmentByTask = new Map(
      adjustments.map((adjustment) => [adjustment.taskId, adjustment]),
    );
    const locale = user.locale;
    const removedSuffix = locale === 'sl' ? ' (odstranjena)' : ' (removed)';
    const headers =
      locale === 'sl'
        ? [
            'Vpisna številka',
            'Ime',
            ...finalVersion.snapshot.tasks.map((task) =>
              adjustmentByTask.get(task.id)?.removed ? `${task.title}${removedSuffix}` : task.title,
            ),
            'Skupaj',
            'Največ',
            'Odstotek',
            'Ocena',
          ]
        : [
            'Enrolment number',
            'Name',
            ...finalVersion.snapshot.tasks.map((task) =>
              adjustmentByTask.get(task.id)?.removed ? `${task.title}${removedSuffix}` : task.title,
            ),
            'Total',
            'Max',
            'Percent',
            'Grade',
          ];

    const members = await db
      .select({ enrolmentNo: examMembers.enrolmentNo, name: users.name })
      .from(examMembers)
      .innerJoin(users, eq(examMembers.userId, users.id))
      .where(and(eq(examMembers.examId, examId!), eq(examMembers.role, 'student')))
      .orderBy(asc(examMembers.enrolmentNo));

    const examRow = await db
      .select({ settings: exams.settings })
      .from(exams)
      .where(eq(exams.id, examId!))
      .get();
    if (!examRow) throw new ApiError('NOT_FOUND', 'No such exam');
    const grades = grade({
      tasks: finalVersion.snapshot.tasks.map((task) => ({
        taskId: task.id,
        criteria: task.criteria.map((criterion) => ({
          criterionId: criterion.id,
          maxPoints: criterion.maxPoints,
        })),
      })),
      confirmed: [],
      adjustments: adjustments.map((adjustment) => ({
        taskId: adjustment.taskId,
        removed: adjustment.removed,
        keepAsBonus: adjustment.keepAsBonus,
      })),
      settings: examRow.settings,
    });

    const decimal = (value: number) => value.toFixed(2).replace('.', ',');
    const rowValues = members.map((member) => [
      member.enrolmentNo ?? '',
      member.name,
      ...finalVersion.snapshot.tasks.map(() => ''),
      decimal(grades.total),
      decimal(grades.max),
      decimal(grades.percent),
      String(grades.grade),
    ]);
    const csvEscape = (value: string) =>
      /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    const csv = `\ufeff${[headers, ...rowValues].map((row) => row.map(csvEscape).join(';')).join('\r\n')}\r\n`;
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="grades-${examId}.csv"`,
      },
    });
  });
}
