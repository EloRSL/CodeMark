import { z } from 'zod';
import { boundedText, Uuid } from './common';
import { LIMITS } from './limits';

export const CriterionKind = z.enum(['ai', 'runs']);
export type CriterionKind = z.infer<typeof CriterionKind>;

export const Criterion = z.object({
  id: Uuid,
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  maxPoints: z.number().gt(0).max(100).multipleOf(0.5),
  kind: CriterionKind,
});
export type Criterion = z.infer<typeof Criterion>;

export const TestVisibility = z.enum(['public', 'hidden']);
export type TestVisibility = z.infer<typeof TestVisibility>;

export const TestCase = z.object({
  id: Uuid,
  visibility: TestVisibility,
  input: boundedText(LIMITS.testIoBytes), // fed on standard input
  expectedOutput: boundedText(LIMITS.testIoBytes),
});
export type TestCase = z.infer<typeof TestCase>;

const unique = (ids: string[]) => new Set(ids).size === ids.length;
const countTests = (tests: TestCase[], visibility: TestVisibility) =>
  tests.filter((t) => t.visibility === visibility).length;

export const Task = z
  .object({
    id: Uuid,
    title: z.string().min(1).max(200),
    instructions: z.string().max(LIMITS.taskInstructionsChars), // Markdown, including merged legacy fields
    tips: z.string().max(10000), // Markdown
    starterCode: boundedText(LIMITS.codeBytes),
    timeLimitMs: z.number().int().min(LIMITS.timeLimitMs.min).max(LIMITS.timeLimitMs.max),
    criteria: z.array(Criterion).min(1).max(LIMITS.criteriaPerTask),
    tests: z.array(TestCase),
  })
  .refine((t) => countTests(t.tests, 'public') <= LIMITS.publicTestsPerTask, {
    error: `At most ${LIMITS.publicTestsPerTask} public tests`,
    path: ['tests'],
  })
  .refine((t) => countTests(t.tests, 'hidden') <= LIMITS.hiddenTestsPerTask, {
    error: `At most ${LIMITS.hiddenTestsPerTask} hidden tests`,
    path: ['tests'],
  })
  .refine((t) => t.criteria.filter((c) => c.kind === 'runs').length <= 1, {
    error: "At most one 'runs' criterion",
    path: ['criteria'],
  })
  .refine((t) => !t.criteria.some((c) => c.kind === 'runs') || countTests(t.tests, 'hidden') > 0, {
    error: "A 'runs' criterion needs at least one hidden test",
    path: ['tests'],
  })
  .refine((t) => unique(t.criteria.map((c) => c.id)), {
    error: 'Criterion IDs must be unique within the task',
    path: ['criteria'],
  })
  .refine((t) => unique(t.tests.map((c) => c.id)), {
    error: 'Test IDs must be unique within the task',
    path: ['tests'],
  });
export type Task = z.infer<typeof Task>;

const utf8 = new TextEncoder();

export const ExamContent = z
  .object({
    schemaVersion: z.literal(1),
    tasks: z.array(Task).max(LIMITS.tasksPerExam), // publish requires at least 1
  })
  .refine((c) => utf8.encode(JSON.stringify(c)).length <= LIMITS.versionBytes, {
    error: `The exam content is larger than ${LIMITS.versionBytes} bytes`,
  })
  .refine((c) => unique(c.tasks.map((t) => t.id)), {
    error: 'Task IDs must be unique',
    path: ['tasks'],
  });
export type ExamContent = z.infer<typeof ExamContent>;

/** Public tests only. */
export const StudentTestCase = z.object({
  id: Uuid,
  input: z.string(),
  expectedOutput: z.string(),
});
export type StudentTestCase = z.infer<typeof StudentTestCase>;

export const StudentTask = z.object({
  id: Uuid,
  title: z.string(),
  instructions: z.string(),
  tips: z.string(),
  starterCode: z.string(),
  timeLimitMs: z.number(),
  criteria: z.array(Criterion), // the rubric is visible to students
  publicTests: z.array(StudentTestCase),
  hiddenTestCount: z.number(),
});
export type StudentTask = z.infer<typeof StudentTask>;

export const StudentExamView = z.object({
  schemaVersion: z.literal(1),
  tasks: z.array(StudentTask), // same order as ExamContent.tasks
});
export type StudentExamView = z.infer<typeof StudentExamView>;
