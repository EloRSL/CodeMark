import { writeFileSync } from 'node:fs';
import { demoSeedSql } from './sql';

// Writes seed/demo.sql with R = now (docs/demo-data.md).
writeFileSync(new URL('./demo.sql', import.meta.url), demoSeedSql(Date.now()).join('\n') + '\n');
