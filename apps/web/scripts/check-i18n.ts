// pnpm check:i18n: fails when sl.json and en.json don't have the same keys (G9).
import { checkLocales } from '../src/i18n/keys';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import sl from '../src/i18n/locales/sl.json' with { type: 'json' };

const problems = checkLocales(sl, en);
if (problems.length > 0) throw new Error(`check:i18n failed:\n${problems.join('\n')}`);
console.log('sl.json and en.json have the same keys.');
