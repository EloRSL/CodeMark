import type { ApiErrorBody, ErrorCode } from '@codemark/contracts';
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** The status of each code, from the comments on ErrorCode in types.md. */
const statusOf = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  FORBIDDEN_ORIGIN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  EXAM_NOT_OPEN: 409,
  EXAM_CLOSED: 409,
  ENROLMENT_TAKEN: 409,
  ENROLMENT_NOT_LISTED: 403,
  LIMIT_EXCEEDED: 422,
  RELEASE_NOT_READY: 409,
  DEMO_DISABLED: 403,
  AI_UNAVAILABLE: 503,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, ContentfulStatusCode>;

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function errorResponse(c: Context, code: ErrorCode, message: string, details?: unknown) {
  const body: ApiErrorBody = { error: { code, message, details } };
  return c.json(body, statusOf[code]);
}

/** A thrown ApiError becomes its error body; anything else is logged and becomes 500 INTERNAL. */
export const onError: ErrorHandler = (error, c) => {
  if (error instanceof ApiError) return errorResponse(c, error.code, error.message, error.details);
  console.error(error);
  return errorResponse(c, 'INTERNAL', 'Internal error');
};

export const notFound: NotFoundHandler = (c) =>
  errorResponse(c, 'NOT_FOUND', `No route for ${c.req.method} ${c.req.path}`);
