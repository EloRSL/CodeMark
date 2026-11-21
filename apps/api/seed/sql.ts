import { DEMO_USERS } from '@codemark/core';

// The demo seed as SQL statements, from the constants in packages/core/src/demo (docs/demo-data.md).
// generate.ts writes them to demo.sql; test/setup.ts runs them on every fresh test database.

const sql = (v: string | number | null) =>
  v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replaceAll("'", "''")}'`;
const insert = (table: string, columns: string[], values: (string | number | null)[]) =>
  `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.map(sql).join(', ')});`;

/** r is the moment the seed is generated; demo times are relative to it. */
export function demoSeedSql(r: number): string[] {
  const users = Object.values(DEMO_USERS).map((u) =>
    insert(
      'users',
      ['id', 'email', 'name', 'role', 'enrolment_no', 'locale', 'demo', 'created_at'],
      [u.id, u.email, u.name, u.role, u.enrolmentNo, 'sl', 1, r],
    ),
  );
  // Exams, versions and submissions join when their tables exist (M3 task 15).
  return users;
}
