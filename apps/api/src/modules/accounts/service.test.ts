import { DEMO_USERS } from '@codemark/core';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../db/client';
import { addMemberQuery, getUserNames, listStudentMembers } from './index';

const db = createDb(env.DB);
const { professor, student1, student2 } = DEMO_USERS;

describe('listStudentMembers', () => {
  it('lists only students, with their names, by the exam enrolment number', async () => {
    const examId = crypto.randomUUID();
    const member = (userId: string, role: 'professor' | 'student', enrolmentNo: string | null) =>
      addMemberQuery(db, { examId, userId, role, enrolmentNo, joinedAt: 0 });
    await db.batch([
      member(professor.id, 'professor', null),
      member(student1.id, 'student', '63249999'),
      member(student2.id, 'student', '63240000'),
    ]);
    expect(await listStudentMembers(db, examId)).toEqual([
      {
        userId: student2.id,
        name: student2.name,
        email: student2.email,
        role: 'student',
        enrolmentNo: '63240000',
      },
      {
        userId: student1.id,
        name: student1.name,
        email: student1.email,
        role: 'student',
        enrolmentNo: '63249999',
      },
    ]);
    expect(await listStudentMembers(db, crypto.randomUUID())).toEqual([]);
  });
});

describe('getUserNames', () => {
  it('maps known ids to names and leaves unknown ids out', async () => {
    const unknown = Array.from({ length: 150 }, () => crypto.randomUUID()); // over D1's 100 parameters
    const names = await getUserNames(db, [student1.id, ...unknown, professor.id, student1.id]);
    expect(names).toEqual(
      new Map([
        [student1.id, student1.name],
        [professor.id, professor.name],
      ]),
    );
    expect(await getUserNames(db, [])).toEqual(new Map());
  });
});
