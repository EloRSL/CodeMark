import { z } from 'zod';
import { IsoDateTime, UserRole, Uuid } from '../common';
import { ExamSettings, ExamState } from '../exam';
import { ExamContent, StudentExamView } from '../examContent';

export const ExamSummary = z.object({
  id: Uuid,
  title: z.string(),
  state: ExamState,
  opensAt: IsoDateTime,
  closesAt: IsoDateTime.nullable(),
  currentVersion: z.number(),
  role: UserRole, // the caller's role in this exam
  practice: z.boolean(),
});
export type ExamSummary = z.infer<typeof ExamSummary>;

/** Sorted by opensAt, newest first. */
export const ExamListResponse = z.object({ exams: z.array(ExamSummary) });
export type ExamListResponse = z.infer<typeof ExamListResponse>;

export const CreateExamBody = z
  .object({
    title: z.string().min(1).max(200),
    opensAt: IsoDateTime,
    closesAt: IsoDateTime.nullable(),
    practice: z.boolean(),
  })
  .refine((b) => b.practice === (b.closesAt === null), {
    error: 'closesAt is null exactly when the exam is a practice exam',
    path: ['closesAt'],
  })
  .refine((b) => b.closesAt === null || Date.parse(b.closesAt) > Date.parse(b.opensAt), {
    error: 'closesAt must be later than opensAt',
    path: ['closesAt'],
  });
export type CreateExamBody = z.infer<typeof CreateExamBody>;

export const ExamVersionInfo = z.object({
  version: z.number(),
  createdAt: IsoDateTime,
  note: z.string(),
});
export type ExamVersionInfo = z.infer<typeof ExamVersionInfo>;

export const TaskAdjustmentBody = z.object({ removed: z.boolean(), keepAsBonus: z.boolean() });
export type TaskAdjustmentBody = z.infer<typeof TaskAdjustmentBody>;

export const TaskAdjustment = z.object({
  taskId: Uuid,
  removed: z.boolean(),
  keepAsBonus: z.boolean(),
  decidedAt: IsoDateTime,
});
export type TaskAdjustment = z.infer<typeof TaskAdjustment>;

export const ExamForProfessor = z.object({
  role: z.literal('professor'),
  exam: ExamSummary,
  joinCode: z.string(),
  settings: ExamSettings,
  draft: ExamContent,
  versions: z.array(ExamVersionInfo), // oldest first
  adjustments: z.array(TaskAdjustment),
});
export type ExamForProfessor = z.infer<typeof ExamForProfessor>;

export const ExamForStudent = z.object({
  role: z.literal('student'),
  exam: ExamSummary,
  autocomplete: z.boolean(),
  view: StudentExamView.nullable(), // null while draft or scheduled; the current version's view otherwise
});
export type ExamForStudent = z.infer<typeof ExamForStudent>;

/** Discriminated on role. */
export const ExamDetail = z.discriminatedUnion('role', [ExamForProfessor, ExamForStudent]);
export type ExamDetail = z.infer<typeof ExamDetail>;

export const SaveDraftResponse = z.object({ savedAt: IsoDateTime });
export type SaveDraftResponse = z.infer<typeof SaveDraftResponse>;

export const UpdateSettingsBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
    opensAt: IsoDateTime.optional(),
    closesAt: IsoDateTime.optional(),
    settings: ExamSettings.optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    error: 'Give at least one field',
  });
export type UpdateSettingsBody = z.infer<typeof UpdateSettingsBody>;

export const NewVersionBody = z.object({ note: z.string().min(1).max(500) });
export type NewVersionBody = z.infer<typeof NewVersionBody>;

export const VersionResponse = z.object({ version: z.number() });
export type VersionResponse = z.infer<typeof VersionResponse>;
