import { env } from 'cloudflare:workers';
import { ApiErrorBody } from '@codemark/contracts';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { signIn } from '../../../test/client';
import { app } from '../../app';
import { createDb } from '../../db/client';
import { examMembers, examVersions, exams, notices, taskAdjustments, users } from '../../db/schema';
import { clock } from '../../platform/clock';
import { getExam } from './service';

const db = createDb(env.DB);
const T0 = Date.parse('2026-12-01T10:00:00.000Z');
const anonymousRequest = (method: string, path: string, body?: unknown) =>
  app.request(
    `/api${path}`,
    {
      method,
      headers: { Origin: env.APP_ORIGIN },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );

async function errorCode(res: Response) {
  if (res.status === 0) return null;
  const body = ApiErrorBody.parse(await res.clone().json());
  return { status: res.status, code: body.error.code };
}

afterEach(() => clock.set(null));

describe('exams endpoints', () => {
  it('creates and lists an exam, then protects student draft access', async () => {
    clock.set(T0);
    const professor = await signIn('professor');
    const create = await professor.request('POST', '/exams', {
      title: 'Algebra',
      opensAt: new Date(T0).toISOString(),
      closesAt: new Date(T0 + 3600000).toISOString(),
      practice: false,
    });
    expect(create.status).toBe(200);
    const summary = (await create.json()) as { id: string };
    const stored = await db
      .select({ joinCode: exams.joinCode })
      .from(exams)
      .where(eq(exams.id, summary.id))
      .get();
    expect(stored?.joinCode).toMatch(
      /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/,
    );
    const examRecord = await getExam(db, summary.id);
    expect(Object.keys(examRecord ?? {})).toEqual([
      'id',
      'title',
      'phase',
      'opensAt',
      'closesAt',
      'closedAt',
      'practice',
      'currentVersion',
      'createdBy',
      'settings',
    ]);

    const list = await professor.request('GET', '/exams');
    expect(await list.json()).toMatchObject({ exams: [{ id: summary.id, title: 'Algebra' }] });

    const student = await signIn('student1');
    const studentGet = await student.request('GET', `/exams/${summary.id}`);
    expect(studentGet.status).toBe(404);
  });

  it('saves and publishes a valid draft, and does not leak hidden tests to students', async () => {
    clock.set(T0);
    const professor = await signIn('professor');
    const create = await professor.request('POST', '/exams', {
      title: 'Secrets',
      opensAt: new Date(T0).toISOString(),
      closesAt: new Date(T0 + 3600000).toISOString(),
      practice: false,
    });
    const summary = (await create.json()) as { id: string };
    await db.update(exams).set({ joinCode: 'PRACTICE' }).where(eq(exams.id, summary.id));
    const taskId = crypto.randomUUID();
    const criterionId = crypto.randomUUID();
    const publicTestId = crypto.randomUUID();
    const hiddenTestId = crypto.randomUUID();
    const draft = {
      schemaVersion: 1,
      tasks: [
        {
          id: taskId,
          title: 'Task',
          instructions: 'Solve',
          tips: 'Use a loop',
          starterCode: '',
          timeLimitMs: 2000,
          criteria: [
            {
              id: criterionId,
              name: 'Correctness',
              description: '',
              maxPoints: 1,
              kind: 'ai',
            },
          ],
          tests: [
            { id: publicTestId, visibility: 'public', input: '1', expectedOutput: '1' },
            { id: hiddenTestId, visibility: 'hidden', input: 'SECRET', expectedOutput: 'ANSWER' },
          ],
        },
      ],
    };
    expect((await professor.request('PUT', `/exams/${summary.id}/draft`, draft)).status).toBe(200);
    expect((await professor.request('POST', `/exams/${summary.id}/publish`)).status).toBe(200);
    const changedDraft = {
      ...draft,
      tasks: draft.tasks.map((task) => ({ ...task, title: 'Current draft title' })),
    };
    expect(
      (await professor.request('PUT', `/exams/${summary.id}/draft`, changedDraft)).status,
    ).toBe(200);
    const professorGet = (await (
      await professor.request('GET', `/exams/${summary.id}`)
    ).json()) as {
      draft: { tasks: { title: string }[] };
      finalVersionTasks: { id: string; title: string }[];
      joinCode: string;
    };
    expect(professorGet.draft.tasks[0]?.title).toBe('Current draft title');
    expect(professorGet.finalVersionTasks).toEqual([{ id: taskId, title: 'Task' }]);
    expect(professorGet.joinCode).toBe('PRACTICE');

    clock.set(T0 + 600000);
    await db
      .insert(examMembers)
      .values({
        examId: summary.id,
        userId: (await signIn('student1')).me.id,
        role: 'student',
        enrolmentNo: '63240001',
        joinedAt: T0,
      })
      .run();
    const studentGet = await (await signIn('student1')).request('GET', `/exams/${summary.id}`);
    expect(studentGet.status).toBe(200);
    const studentText = JSON.stringify(await studentGet.json());
    expect(studentText).not.toContain('SECRET');
    expect(studentText).not.toContain('ANSWER');
    expect(studentText).not.toContain(hiddenTestId);
    expect(studentText).not.toContain('"draft"');
    expect(studentText).not.toContain('"snapshot"');
  });

  it('checks authentication, membership, and role on every exam endpoint', async () => {
    clock.set(T0);
    const professor = await signIn('professor');
    const student = await signIn('student1');
    const outsider = await signIn('student3');
    const create = await professor.request('POST', '/exams', {
      title: 'Access checks',
      opensAt: new Date(T0).toISOString(),
      closesAt: new Date(T0 + 3600000).toISOString(),
      practice: false,
    });
    const exam = (await create.json()) as { id: string };
    await db.insert(examMembers).values({
      examId: exam.id,
      userId: student.me.id,
      role: 'student',
      enrolmentNo: '63240001',
      joinedAt: T0,
    });

    expect(await errorCode(await anonymousRequest('POST', '/exams', {}))).toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect(await errorCode(await student.request('POST', '/exams', {}))).toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(await errorCode(await anonymousRequest('GET', '/exams'))).toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect((await student.request('GET', '/exams')).status).toBe(200);
    const studentList = (await (await student.request('GET', '/exams')).json()) as {
      exams: Record<string, unknown>[];
    };
    expect(studentList.exams[0]).not.toHaveProperty('draft');
    expect(studentList.exams[0]).not.toHaveProperty('snapshot');
    expect(studentList.exams[0]).not.toHaveProperty('joinCode');

    const detailPath = `/exams/${exam.id}`;
    expect(await errorCode(await anonymousRequest('GET', detailPath))).toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect(await errorCode(await outsider.request('GET', detailPath))).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect((await student.request('GET', detailPath)).status).toBe(200);

    const professorEndpoints: [string, string, unknown?][] = [
      ['PUT', `${detailPath}/draft`, { schemaVersion: 1, tasks: [] }],
      ['PATCH', `${detailPath}/settings`, { title: 'Updated' }],
      ['POST', `${detailPath}/publish`],
      ['POST', `${detailPath}/versions`, { note: 'Change' }],
      [
        'PUT',
        `${detailPath}/tasks/${crypto.randomUUID()}/adjustment`,
        { removed: false, keepAsBonus: false },
      ],
      ['GET', `${detailPath}/grades.csv`],
    ];
    for (const [method, path, body] of professorEndpoints) {
      expect(await errorCode(await anonymousRequest(method, path, body))).toMatchObject({
        status: 401,
        code: 'UNAUTHENTICATED',
      });
      expect(await errorCode(await outsider.request(method, path, body))).toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
      expect(await errorCode(await student.request(method, path, body))).toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
      });
    }
  });

  it('publishes changed drafts as new versions and rejects invalid version transitions', async () => {
    clock.set(T0);
    const professor = await signIn('professor');
    const create = await professor.request('POST', '/exams', {
      title: 'Versions',
      opensAt: new Date(T0 + 3600000).toISOString(),
      closesAt: new Date(T0 + 7200000).toISOString(),
      practice: false,
    });
    const exam = (await create.json()) as { id: string };
    expect(
      await errorCode(await professor.request('POST', `/exams/${exam.id}/versions`, { note: '' })),
    ).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
    const draft = {
      schemaVersion: 1,
      tasks: [
        {
          id: crypto.randomUUID(),
          title: 'Versioned task',
          instructions: 'Solve',
          tips: '',
          starterCode: 'print(1)',
          timeLimitMs: 2000,
          criteria: [
            {
              id: crypto.randomUUID(),
              name: 'Correctness',
              description: '',
              maxPoints: 1,
              kind: 'ai',
            },
          ],
          tests: [],
        },
      ],
    };
    expect(
      (await professor.request('POST', `/exams/${exam.id}/versions`, { note: 'Before' })).status,
    ).toBe(409);
    expect(
      await errorCode(
        await professor.request('PUT', `/exams/${exam.id}/draft`, {
          schemaVersion: 1,
          tasks: [{}],
        }),
      ),
    ).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
    await professor.request('PUT', `/exams/${exam.id}/draft`, draft);
    expect((await professor.request('POST', `/exams/${exam.id}/publish`)).status).toBe(200);
    expect(await professor.request('POST', `/exams/${exam.id}/publish`)).toMatchObject({
      status: 409,
    });
    expect(
      await errorCode(
        await professor.request('POST', `/exams/${exam.id}/versions`, { note: 'Same' }),
      ),
    ).toMatchObject({ status: 409, code: 'CONFLICT' });

    const changed = {
      ...draft,
      tasks: draft.tasks.map((task) => ({ ...task, title: 'Updated title' })),
    };
    await professor.request('PUT', `/exams/${exam.id}/draft`, changed);
    expect(
      (
        await professor.request('POST', `/exams/${exam.id}/versions`, {
          note: 'Updated',
        })
      ).status,
    ).toBe(200);
    const versions = await db
      .select({ version: examVersions.version })
      .from(examVersions)
      .where(eq(examVersions.examId, exam.id));
    expect(versions.map(({ version }) => version)).toEqual([1, 2]);
  });

  it('tests CSV format and localized headers after closing', async () => {
    clock.set(T0);
    const professor = await signIn('professor');
    const student = await signIn('student2');
    const originalUser = await db.select().from(users).where(eq(users.id, professor.me.id)).get();
    const create = await professor.request('POST', '/exams', {
      title: 'CSV',
      opensAt: new Date(T0).toISOString(),
      closesAt: new Date(T0 + 3600000).toISOString(),
      practice: false,
    });
    const exam = (await create.json()) as { id: string };
    const task = {
      id: crypto.randomUUID(),
      title: 'Task; "quoted"\ncontinued',
      instructions: '',
      tips: '',
      starterCode: '',
      timeLimitMs: 2000,
      criteria: [
        {
          id: crypto.randomUUID(),
          name: 'Correctness',
          description: '',
          maxPoints: 1,
          kind: 'ai',
        },
      ],
      tests: [],
    };
    await professor.request('PUT', `/exams/${exam.id}/draft`, { schemaVersion: 1, tasks: [task] });
    const publish = await professor.request('POST', `/exams/${exam.id}/publish`);
    expect(publish.status).toBe(200);
    await db.insert(examMembers).values({
      examId: exam.id,
      userId: student.me.id,
      role: 'student',
      enrolmentNo: '63240002',
      joinedAt: T0,
    });
    await db.update(exams).set({ closedAt: T0 }).where(eq(exams.id, exam.id));

    try {
      for (const [locale, expected] of [
        ['en', 'Enrolment number;Name;'],
        ['sl', 'Vpisna številka;Ime;'],
      ] as const) {
        await db.update(users).set({ locale }).where(eq(users.id, professor.me.id));
        const csvResponse = await professor.request('GET', `/exams/${exam.id}/grades.csv`);
        expect(csvResponse.status).toBe(200);
        expect(csvResponse.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
        expect(csvResponse.headers.get('Content-Disposition')).toBe(
          `attachment; filename="grades-${exam.id}.csv"`,
        );
        const bytes = new Uint8Array(await csvResponse.arrayBuffer());
        expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
        const csv = new TextDecoder().decode(bytes.slice(3));
        expect(csv).toContain(`${expected}"Task; ""quoted""\ncontinued"`);
        expect(csv).toContain(';0,00;1,00;0,00;5\r\n');
        expect(csv.split('\r\n').length).toBeGreaterThanOrEqual(2);
      }
    } finally {
      if (originalUser) {
        await db
          .update(users)
          .set({ locale: originalUser.locale })
          .where(eq(users.id, professor.me.id));
      }
    }
  });

  it('updates settings and rejects closing practice exams', async () => {
    clock.set(T0);
    const professor = await signIn('professor');
    const practiceCreate = await professor.request('POST', '/exams', {
      title: 'Practice',
      opensAt: new Date(T0).toISOString(),
      closesAt: null,
      practice: true,
    });
    const practice = (await practiceCreate.json()) as { id: string };
    expect(
      await errorCode(await professor.request('PATCH', `/exams/${practice.id}/settings`, {})),
    ).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
    expect(
      await errorCode(
        await professor.request('PATCH', `/exams/${practice.id}/settings`, {
          closesAt: new Date(T0 + 1000).toISOString(),
        }),
      ),
    ).toMatchObject({ status: 400, code: 'BAD_REQUEST' });

    const normalCreate = await professor.request('POST', '/exams', {
      title: 'Normal',
      opensAt: new Date(T0).toISOString(),
      closesAt: new Date(T0 + 3600000).toISOString(),
      practice: false,
    });
    const normal = (await normalCreate.json()) as { id: string };
    await db.update(exams).set({ phase: 'published' }).where(eq(exams.id, normal.id));
    clock.set(T0 + 1000);
    expect(
      await errorCode(
        await professor.request('PATCH', `/exams/${normal.id}/settings`, {
          opensAt: new Date(T0 + 500).toISOString(),
        }),
      ),
    ).toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(
      (
        await professor.request('PATCH', `/exams/${normal.id}/settings`, {
          closesAt: new Date(T0 - 1000).toISOString(),
        })
      ).status,
    ).toBe(200);
  });

  it('covers publish, version, adjustment, and CSV state errors', async () => {
    clock.set(T0);
    const professor = await signIn('professor');
    const create = await professor.request('POST', '/exams', {
      title: 'Transitions',
      opensAt: new Date(T0).toISOString(),
      closesAt: new Date(T0 + 7200000).toISOString(),
      practice: false,
    });
    const exam = (await create.json()) as { id: string };
    const emptyDraft = { schemaVersion: 1, tasks: [] };
    expect(
      await errorCode(await professor.request('POST', `/exams/${exam.id}/publish`)),
    ).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
    expect(
      await errorCode(await professor.request('GET', `/exams/${exam.id}/grades.csv`)),
    ).toMatchObject({ status: 409, code: 'CONFLICT' });
    await professor.request('PUT', `/exams/${exam.id}/draft`, emptyDraft);

    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      title: 'Adjustment target',
      instructions: '',
      tips: '',
      starterCode: '',
      timeLimitMs: 2000,
      criteria: [
        {
          id: crypto.randomUUID(),
          name: 'Correctness',
          description: '',
          maxPoints: 1,
          kind: 'ai',
        },
      ],
      tests: [],
    };
    await professor.request('PUT', `/exams/${exam.id}/draft`, {
      schemaVersion: 1,
      tasks: [task],
    });
    expect(
      await errorCode(
        await professor.request('PUT', `/exams/${exam.id}/tasks/${taskId}/adjustment`, {
          removed: true,
          keepAsBonus: false,
        }),
      ),
    ).toMatchObject({ status: 409, code: 'CONFLICT' });
    await professor.request('POST', `/exams/${exam.id}/publish`);
    await db.update(exams).set({ closedAt: T0 }).where(eq(exams.id, exam.id));
    expect(
      await errorCode(
        await professor.request('PUT', `/exams/${exam.id}/tasks/${taskId}/adjustment`, {}),
      ),
    ).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
    expect(
      await errorCode(
        await professor.request('POST', `/exams/${exam.id}/versions`, { note: 'Closed' }),
      ),
    ).toMatchObject({ status: 409, code: 'EXAM_CLOSED' });
    expect(
      await errorCode(
        await professor.request(
          'PUT',
          `/exams/${exam.id}/tasks/${crypto.randomUUID()}/adjustment`,
          {
            removed: true,
            keepAsBonus: false,
          },
        ),
      ),
    ).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(
      (
        await professor.request('PUT', `/exams/${exam.id}/tasks/${taskId}/adjustment`, {
          removed: true,
          keepAsBonus: true,
        })
      ).status,
    ).toBe(200);
    expect(
      await db.select().from(taskAdjustments).where(eq(taskAdjustments.examId, exam.id)),
    ).toContainEqual(expect.objectContaining({ taskId, removed: true, keepAsBonus: true }));
    const student = await signIn('student2');
    await db.insert(examMembers).values({
      examId: exam.id,
      userId: student.me.id,
      role: 'student',
      enrolmentNo: '63240002',
      joinedAt: T0,
    });
    await db.update(exams).set({ phase: 'released' }).where(eq(exams.id, exam.id));
    expect(
      (
        await professor.request('PUT', `/exams/${exam.id}/tasks/${taskId}/adjustment`, {
          removed: false,
          keepAsBonus: false,
        })
      ).status,
    ).toBe(200);
    const gradeChanged = await db.select().from(notices).where(eq(notices.examId, exam.id));
    expect(gradeChanged.filter((notice) => notice.kind === 'grade_changed')).toEqual([
      expect.objectContaining({ userId: null, kind: 'grade_changed' }),
    ]);
    expect(
      (
        await professor.request('PATCH', `/exams/${exam.id}/settings`, {
          settings: {
            scale: 'percent',
            thresholds: { '6': 50, '7': 60, '8': 70, '9': 80, '10': 90 },
            autocomplete: true,
          },
        })
      ).status,
    ).toBe(409);
  });

  it('returns the documented create, save, and settings errors', async () => {
    clock.set(T0);
    const professor = await signIn('professor');
    expect(
      await errorCode(
        await professor.request('POST', '/exams', {
          title: '',
          opensAt: new Date(T0).toISOString(),
          closesAt: new Date(T0 + 1000).toISOString(),
          practice: false,
        }),
      ),
    ).toMatchObject({ status: 400, code: 'BAD_REQUEST' });

    const create = await professor.request('POST', '/exams', {
      title: 'Settings errors',
      opensAt: new Date(T0 + 5000).toISOString(),
      closesAt: new Date(T0 + 10000).toISOString(),
      practice: false,
    });
    const exam = (await create.json()) as { id: string };
    expect(
      await errorCode(
        await professor.request('PATCH', `/exams/${exam.id}/settings`, {
          closesAt: new Date(T0 + 3000).toISOString(),
        }),
      ),
    ).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
    await db.update(exams).set({ phase: 'released' }).where(eq(exams.id, exam.id));
    const releasedDraft = await professor.request('PUT', `/exams/${exam.id}/draft`, {
      schemaVersion: 1,
      tasks: [],
    });
    expect(await errorCode(releasedDraft)).toMatchObject({ status: 409, code: 'EXAM_CLOSED' });
    expect(
      await errorCode(
        await professor.request('PATCH', `/exams/${exam.id}/settings`, {
          settings: {
            scale: 'percent',
            thresholds: { '6': 50, '7': 60, '8': 70, '9': 80, '10': 90 },
            autocomplete: true,
          },
        }),
      ),
    ).toMatchObject({ status: 409, code: 'EXAM_CLOSED' });
    expect(
      await errorCode(
        await professor.request('PATCH', `/exams/${exam.id}/settings`, {
          closesAt: new Date(T0 + 12000).toISOString(),
        }),
      ),
    ).toMatchObject({ status: 409, code: 'EXAM_CLOSED' });
  });

  it('closes due exams once and stores a closing notification', async () => {
    clock.set(T0);
    const professor = await signIn('professor');
    const create = await professor.request('POST', '/exams', {
      title: 'Deadline',
      opensAt: new Date(T0).toISOString(),
      closesAt: new Date(T0 + 1000).toISOString(),
      practice: false,
    });
    const exam = (await create.json()) as { id: string };
    await db.update(exams).set({ phase: 'published', closedAt: null }).where(eq(exams.id, exam.id));
    clock.set(T0 + 61000);
    const runJobs = () =>
      import('../../app').then(({ app: workerApp }) =>
        workerApp.request(
          '/api/test/run-jobs',
          { method: 'POST', headers: { Origin: env.APP_ORIGIN } },
          env,
        ),
      );
    const closed = await runJobs();
    expect(closed.status).toBe(200);
    const firstRun = (await closed.json()) as { examsClosed: number };
    expect(firstRun.examsClosed).toBeGreaterThan(0);
    const stored = await db.select().from(exams).where(eq(exams.id, exam.id)).get();
    expect(stored?.closedAt).toBe(T0 + 61000);
    const closingNotices = await db.select().from(notices).where(eq(notices.examId, exam.id));
    expect(closingNotices).toEqual([
      expect.objectContaining({
        examId: exam.id,
        userId: professor.me.id,
        kind: 'exam_closed',
      }),
    ]);
    const secondRun = await runJobs();
    expect(secondRun.status).toBe(200);
    expect(await secondRun.json()).toMatchObject({ examsClosed: 0 });
    expect(await db.select().from(notices).where(eq(notices.examId, exam.id))).toHaveLength(1);
  });
});
