import { z } from 'zod';

/** The HTTP status of each code is in its comment, always. */
export const ErrorCode = z.enum([
  'BAD_REQUEST', // 400 body, query or params failed the schema, or a rule in api.md says so
  'UNAUTHENTICATED', // 401 no valid session
  'FORBIDDEN', // 403 signed in, but the wrong role for this route or this exam
  'FORBIDDEN_ORIGIN', // 403 a data-changing request without our Origin (SEC-4)
  'NOT_FOUND', // 404 the thing doesn't exist, or the caller isn't a member of its exam
  'CONFLICT', // 409 the request is valid but the current data doesn't allow it
  'EXAM_NOT_OPEN', // 409 the exam hasn't opened yet
  'EXAM_CLOSED', // 409 the exam no longer allows this
  'ENROLMENT_TAKEN', // 409 another member of this exam has this enrolment number
  'ENROLMENT_NOT_LISTED', // 403 the exam has a class list and the number isn't on it
  'LIMIT_EXCEEDED', // 422 a count or budget limit checked outside the schema
  'RELEASE_NOT_READY', // 409 release preconditions not met (ADR-002)
  'DEMO_DISABLED', // 403 demo sign-in while DEMO_MODE isn't "true"
  'AI_UNAVAILABLE', // 503 the AI provider failed during trial grading
  'NOT_IMPLEMENTED', // 501 a registered endpoint whose handler isn't built yet
  'INTERNAL', // 500 anything unexpected
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(), // English, for developers; never shown to users
    details: z.unknown().optional(), // zod issues for BAD_REQUEST; extra data named in api.md
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
