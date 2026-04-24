import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import type { ServerMessage } from '../src/lib/types';

// ---------------------------------------------------------------------------
// 1. Shape of xp_gained message matches the ServerMessage union
// ---------------------------------------------------------------------------
describe('xp_gained ServerMessage shape', () => {
	it('is assignable to ServerMessage and has correct runtime types', () => {
		const msg: ServerMessage = { type: 'xp_gained', amount: 100, newXp: 500 };

		expect(msg.type).toBe('xp_gained');
		// Narrow to access typed fields
		if (msg.type === 'xp_gained') {
			expect(typeof msg.amount).toBe('number');
			expect(typeof msg.newXp).toBe('number');
		}
	});
});

// ---------------------------------------------------------------------------
// Helpers: use globalThis as the EventTarget since window may not be a global
// in the bun:test environment.
// ---------------------------------------------------------------------------
const target: EventTarget = (typeof window !== 'undefined' ? window : globalThis) as EventTarget;

// ---------------------------------------------------------------------------
// 2. CustomEvent('xpgained') detail round-trips correctly
// ---------------------------------------------------------------------------
describe('xpgained CustomEvent dispatch', () => {
	let handler: (e: Event) => void;

	afterEach(() => {
		target.removeEventListener('xpgained', handler);
	});

	it('fires handler with correct detail when dispatched', (done) => {
		const expected = { amount: 50, newXp: 1050 };

		handler = (e: Event) => {
			const detail = (e as CustomEvent<{ amount: number; newXp: number }>).detail;
			expect(detail.amount).toBe(expected.amount);
			expect(detail.newXp).toBe(expected.newXp);
			done();
		};

		target.addEventListener('xpgained', handler);

		const event = new CustomEvent('xpgained', { detail: expected });
		target.dispatchEvent(event);
	});
});

// ---------------------------------------------------------------------------
// 3. Listener cleanup removes the handler
// ---------------------------------------------------------------------------
describe('xpgained listener cleanup', () => {
	it('does not fire handler after removeEventListener', () => {
		let fired = false;

		const handler = () => {
			fired = true;
		};

		target.addEventListener('xpgained', handler);
		target.removeEventListener('xpgained', handler);

		const event = new CustomEvent('xpgained', { detail: { amount: 99, newXp: 999 } });
		target.dispatchEvent(event);

		expect(fired).toBe(false);
	});
});
