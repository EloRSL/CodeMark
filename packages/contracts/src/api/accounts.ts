import { z } from 'zod';
import { EnrolmentNo, Locale, UserRole, Uuid } from '../common';
import { LIMITS } from '../limits';

export const Me = z.object({
  id: Uuid,
  email: z.string(),
  name: z.string(),
  role: UserRole,
  enrolmentNo: EnrolmentNo.nullable(),
  locale: Locale,
  demo: z.boolean(),
});
export type Me = z.infer<typeof Me>;

export const UpdateMeBody = z
  .object({ enrolmentNo: EnrolmentNo.optional(), locale: Locale.optional() })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    error: 'Give at least one field',
  });
export type UpdateMeBody = z.infer<typeof UpdateMeBody>;

export const DemoUser = z.enum(['professor', 'student1', 'student2', 'student3']);
export type DemoUser = z.infer<typeof DemoUser>;

export const DemoLoginBody = z.object({ user: DemoUser });
export type DemoLoginBody = z.infer<typeof DemoLoginBody>;

export const OAuthProvider = z.enum(['google', 'github']);
export type OAuthProvider = z.infer<typeof OAuthProvider>;

const RETURN_TO_BASE = 'http://codemark.invalid';

/**
 * A path on our own site to return to after sign-in, otherwise "/". Resolving it as a URL
 * catches "//evil.com", "/\evil.com" and tabs or newlines that browsers strip.
 */
export function safeReturnTo(value: string | undefined): string {
  if (value === undefined || value.length > 2000 || !value.startsWith('/')) return '/';
  let url: URL;
  try {
    url = new URL(value, RETURN_TO_BASE);
  } catch {
    return '/'; // e.g. "//[" has an invalid host
  }
  if (url.origin !== RETURN_TO_BASE) return '/';
  return url.pathname + url.search + url.hash;
}

/** returnTo always parses, through safeReturnTo; never a 400. */
export const AuthStartQuery = z.object({
  returnTo: z.string().optional().catch(undefined).transform(safeReturnTo),
});
export type AuthStartQuery = z.infer<typeof AuthStartQuery>;

export const JoinExamBody = z.object({
  joinCode: z.string().min(4).max(32),
  enrolmentNo: EnrolmentNo,
});
export type JoinExamBody = z.infer<typeof JoinExamBody>;

export const JoinExamResponse = z.object({ examId: Uuid });
export type JoinExamResponse = z.infer<typeof JoinExamResponse>;

/** [] removes the list. */
export const ClassListBody = z.object({
  enrolmentNos: z.array(EnrolmentNo).max(LIMITS.classListMax),
});
export type ClassListBody = z.infer<typeof ClassListBody>;

export const ClassListResponse = z.object({ count: z.number() });
export type ClassListResponse = z.infer<typeof ClassListResponse>;

export const UpdateMemberBody = z.object({ enrolmentNo: EnrolmentNo });
export type UpdateMemberBody = z.infer<typeof UpdateMemberBody>;

export const Member = z.object({
  userId: Uuid,
  name: z.string(),
  email: z.string(),
  role: UserRole,
  enrolmentNo: EnrolmentNo.nullable(),
});
export type Member = z.infer<typeof Member>;
