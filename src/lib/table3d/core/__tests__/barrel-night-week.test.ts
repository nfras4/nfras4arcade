import { describe, it, expect } from 'vitest';
import { isoWeekUTC, barrelNightCode, nextBarrelNightStartUTC } from '../../../../../worker/barrelNight/week.js';

const ms = (iso: string) => Date.parse(iso);

describe('isoWeekUTC', () => {
  it('computes the ISO week for a mid-week date', () => {
    // Wed 2026-06-10 is in ISO week 24 of 2026.
    expect(isoWeekUTC(ms('2026-06-10T12:00:00Z'))).toBe('2026-W24');
  });

  it('handles the year-boundary (2027-01-01 is ISO week 53 of 2026)', () => {
    expect(isoWeekUTC(ms('2027-01-01T00:00:00Z'))).toBe('2026-W53');
  });

  it('barrelNightCode wraps the week', () => {
    expect(barrelNightCode(ms('2026-06-10T12:00:00Z'))).toBe('BN-2026-W24');
  });
});

describe('nextBarrelNightStartUTC', () => {
  it('returns the upcoming Sunday 09:00 UTC from a weekday', () => {
    // Wed 2026-06-10 -> next Sunday is 2026-06-14 09:00Z.
    expect(new Date(nextBarrelNightStartUTC(ms('2026-06-10T12:00:00Z'))).toISOString())
      .toBe('2026-06-14T09:00:00.000Z');
  });

  it('returns today when it is Sunday before 09:00 UTC', () => {
    // Sun 2026-06-14 08:00Z -> same day 09:00Z.
    expect(new Date(nextBarrelNightStartUTC(ms('2026-06-14T08:00:00Z'))).toISOString())
      .toBe('2026-06-14T09:00:00.000Z');
  });

  it('rolls to next Sunday when it is Sunday after 09:00 UTC', () => {
    // Sun 2026-06-14 10:00Z -> next Sunday 2026-06-21 09:00Z.
    expect(new Date(nextBarrelNightStartUTC(ms('2026-06-14T10:00:00Z'))).toISOString())
      .toBe('2026-06-21T09:00:00.000Z');
  });
});
