// Barrel Night scheduling helpers. Pure + UTC-only (the cron is "0 9 * * 0" UTC =
// 19:00 AEST; never derive from local time — DST-safe). Shared by the status
// endpoint and the future cron so the BN-{week} room code always agrees.

/** ISO-8601 week string for a UTC instant, e.g. "2026-W24". */
export function isoWeekUTC(now: number): string {
  const d = new Date(now);
  // Work on the date at UTC midnight.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // ISO weekday: Mon=0 .. Sun=6. Shift to the Thursday of this week.
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const isoYear = date.getUTCFullYear();
  // First Thursday of the ISO year.
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** The BN room code for a given UTC instant, e.g. "BN-2026-W24". */
export function barrelNightCode(now: number): string {
  return `BN-${isoWeekUTC(now)}`.toUpperCase();
}

/** Unix ms of the next Sunday 09:00 UTC (= 19:00 AEST) strictly after `now`,
 *  or the upcoming one today if it hasn't passed yet. */
export function nextBarrelNightStartUTC(now: number): number {
  const d = new Date(now);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 0, 0, 0));
  let addDays = (7 - target.getUTCDay()) % 7; // days until Sunday (Sun=0)
  if (addDays === 0 && now >= target.getTime()) addDays = 7;
  target.setUTCDate(target.getUTCDate() + addDays);
  return target.getTime();
}
