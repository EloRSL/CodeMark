// The rules of check:i18n (internal-interfaces.md, Translations).

const PLURAL = /_(zero|one|two|few|many|other)$/;
const SLOVENE_FORMS = ['one', 'two', 'few', 'other'];

/** Every leaf key with dots: { a: { b: 'x' } } gives ['a.b']. */
export function flatKeys(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? flatKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

/** What is wrong with the two locale files, one line per problem; [] when they match. */
export function checkLocales(sl: object, en: object): string[] {
  const slKeys = flatKeys(sl);
  const enKeys = flatKeys(en);
  const base = (keys: string[]) => new Set(keys.map((k) => k.replace(PLURAL, '')));
  const slBase = base(slKeys);
  const enBase = base(enKeys);

  const problems = [
    ...[...slBase].filter((k) => !enBase.has(k)).map((k) => `en.json is missing ${k}`),
    ...[...enBase].filter((k) => !slBase.has(k)).map((k) => `sl.json is missing ${k}`),
  ];
  const slPlurals = new Set(slKeys.filter((k) => PLURAL.test(k)).map((k) => k.replace(PLURAL, '')));
  for (const key of slPlurals) {
    for (const form of SLOVENE_FORMS) {
      if (!slKeys.includes(`${key}_${form}`)) problems.push(`sl.json is missing ${key}_${form}`);
    }
  }
  return problems;
}
