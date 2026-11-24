import { describe, expect, it } from 'vitest';
import { formatLjubljanaDateTime, parseLjubljanaDateTime } from './dateTime';

describe('Europe/Ljubljana date-time conversion', () => {
  it('formats UTC values in winter and summer local time', () => {
    expect(formatLjubljanaDateTime('2026-01-15T09:00:00.000Z')).toBe('2026-01-15T10:00');
    expect(formatLjubljanaDateTime('2026-07-15T09:00:00.000Z')).toBe('2026-07-15T11:00');
  });

  it('round-trips an unambiguous local date-time across daylight-saving offsets', () => {
    expect(parseLjubljanaDateTime('2026-01-15T10:00')).toBe('2026-01-15T09:00:00.000Z');
    expect(parseLjubljanaDateTime('2026-07-15T11:00')).toBe('2026-07-15T09:00:00.000Z');
  });

  it('uses the earlier instant for an ambiguous fall-back time', () => {
    expect(parseLjubljanaDateTime('2026-10-25T02:30')).toBe('2026-10-25T00:30:00.000Z');
  });

  it('moves a nonexistent spring-forward time to the next valid local time', () => {
    expect(parseLjubljanaDateTime('2026-03-29T02:30')).toBe('2026-03-29T01:30:00.000Z');
  });
});
