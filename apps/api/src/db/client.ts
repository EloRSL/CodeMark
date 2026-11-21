import type { BatchItem as DrizzleBatchItem } from 'drizzle-orm/batch';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;

/** An unexecuted statement for db.batch([...]) (II-2). */
export type BatchItem = DrizzleBatchItem<'sqlite'>;
