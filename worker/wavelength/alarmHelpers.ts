/**
 * Returns true when `target` should win the alarm race: i.e. there is no
 * existing alarm yet, or `target` fires strictly earlier than the one already
 * set.  Exported for unit-testing.
 */
export function earlierAlarm(existing: number | null, target: number): boolean {
  return existing === null || target < existing;
}
