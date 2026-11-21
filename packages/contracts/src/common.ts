import { z } from 'zod';

export const Uuid = z.uuid();
export type Uuid = z.infer<typeof Uuid>;

/** UTC, ending in Z. */
export const IsoDateTime = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTime>;

export const EnrolmentNo = z.string().regex(/^\d{8}$/);
export type EnrolmentNo = z.infer<typeof EnrolmentNo>;

export const Locale = z.enum(['sl', 'en']);
export type Locale = z.infer<typeof Locale>;

export const UserRole = z.enum(['professor', 'student']);
export type UserRole = z.infer<typeof UserRole>;

export const Ok = z.object({ ok: z.literal(true) });
export type Ok = z.infer<typeof Ok>;

/** Opaque to the client. */
export const Cursor = z.string().min(1).max(200);
export type Cursor = z.infer<typeof Cursor>;

const utf8 = new TextEncoder();

/** A string of at most `max` UTF-8 bytes, not characters (T-3). */
export function boundedText(max: number) {
  return z.string().refine((s) => utf8.encode(s).length <= max, {
    error: `At most ${max} UTF-8 bytes`,
  });
}
