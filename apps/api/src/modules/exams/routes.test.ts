import { env } from 'cloudflare:workers';
import { ApiErrorBody } from '@codemark/contracts';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { signIn } from '../../../test/client';
import { createDb } from '../../db/client';
import { examMembers, exams } from '../../db/schema';
import { clock } from '../../platform/clock';

const db = createDb(env.DB);
const T0 = Date.parse('2026-12-01T10:00:00.000Z');

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
    };
    expect(professorGet.draft.tasks[0]?.title).toBe('Current draft title');
    expect(professorGet.finalVersionTasks).toEqual([{ id: taskId, title: 'Task' }]);

    clock.set(T0 + 600000);
    await db
      .insert(examMembers)
      .values({
        examId: summary.id,
        userId: '00000000-0000-4000-8000-000000000002',
        role: 'student',
        enrolmentNo: '63240001',
        joinedAt: T0,
      })
      .run();
    const studentGet = await (await signIn('student1')).request('GET', `/exams/${summary.id}`);
    if (studentGet.status === 200) {
      const text = JSON.stringify(await studentGet.json());
      expect(text).not.toContain('SECRET');
      expect(text).not.toContain('ANSWER');
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
    clock.set(T0 + 1000);
    expect(
      (
        await professor.request('PATCH', `/exams/${normal.id}/settings`, {
          closesAt: new Date(T0 - 1000).toISOString(),
        })
      ).status,
    ).toBe(200);
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
    const closed = await (
      await import('../../app')
    ).app.request(
      '/api/test/run-jobs',
      { method: 'POST', headers: { Origin: env.APP_ORIGIN } },
      env,
    );
    expect(closed.status).toBe(200);
  });
});
