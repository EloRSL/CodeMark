const TIME_ZONE = 'Europe/Ljubljana';
const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function localParts(epochMs: number): Record<string, string> {
  return Object.fromEntries(
    dateTimeFormatter
      .formatToParts(new Date(epochMs))
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value]),
  );
}

export function formatLjubljanaDateTime(value: string): string {
  const parts = localParts(Date.parse(value));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function parseLjubljanaDateTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new RangeError('Expected a local date and time');

  const [, year, month, day, hour, minute] = match;
  const localAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  const normalized = new Date(localAsUtc).toISOString().slice(0, 16);
  if (normalized !== value) throw new RangeError('The local date and time is invalid');

  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const sample = localParts(localAsUtc + hours * 60 * 60 * 1000);
    const representedAsUtc = Date.UTC(
      Number(sample.year),
      Number(sample.month) - 1,
      Number(sample.day),
      Number(sample.hour),
      Number(sample.minute),
    );
    offsets.add(representedAsUtc - (localAsUtc + hours * 60 * 60 * 1000));
  }

  const candidates = [...offsets]
    .map((offset) => localAsUtc - offset)
    .filter((candidate) => formatLjubljanaDateTime(new Date(candidate).toISOString()) === value)
    .sort((a, b) => a - b);

  // Ambiguous fall-back times use the earlier instant; spring-forward gaps move forward.
  const epochMs = candidates[0] ?? localAsUtc - Math.min(...offsets);
  return new Date(epochMs).toISOString();
}
