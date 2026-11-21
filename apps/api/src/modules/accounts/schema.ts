import type { Locale, OAuthProvider, UserRole } from '@codemark/contracts';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Tables of the accounts module (docs/data-model.md). Only accounts code writes them (G3).

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(), // stored lowercase
  name: text('name').notNull(),
  role: text('role').$type<UserRole>().notNull(),
  enrolmentNo: text('enrolment_no'),
  locale: text('locale').$type<Locale>().notNull().default('sl'),
  demo: integer('demo', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

export const oauthAccounts = sqliteTable(
  'oauth_accounts',
  {
    provider: text('provider').$type<OAuthProvider>().notNull(),
    providerUserId: text('provider_user_id').notNull(),
    userId: text('user_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerUserId] })],
);

export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(), // SHA-256 hex of the cookie token
    userId: text('user_id').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(), // createdAt + LIMITS.sessionMs
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const examMembers = sqliteTable(
  'exam_members',
  {
    examId: text('exam_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').$type<UserRole>().notNull(),
    enrolmentNo: text('enrolment_no'), // null for the professor
    joinedAt: integer('joined_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.examId, t.userId] }),
    uniqueIndex('exam_members_exam_id_enrolment_no_unique').on(t.examId, t.enrolmentNo),
    index('exam_members_user_id_idx').on(t.userId),
  ],
);

export const classList = sqliteTable(
  'class_list',
  {
    examId: text('exam_id').notNull(),
    enrolmentNo: text('enrolment_no').notNull(),
  },
  (t) => [primaryKey({ columns: [t.examId, t.enrolmentNo] })],
);
