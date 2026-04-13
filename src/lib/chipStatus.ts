import { writable } from 'svelte/store';

export const canClaim = writable(false);
export const nextClaimAt = writable<number | null>(null);
export const canHourlyClaim = writable(false);
export const nextHourlyClaimAt = writable<number | null>(null);

export async function fetchChipStatus() {
  try {
    const res = await fetch('/api/chips/status');
    if (!res.ok) return;
    const data: any = await res.json();
    canClaim.set(data.canClaim);
    nextClaimAt.set(data.nextClaimAt);
    canHourlyClaim.set(data.canHourlyClaim);
    nextHourlyClaimAt.set(data.nextHourlyClaimAt);
  } catch {}
}
