/**
 * Keyboard input handler for Eggnogg+.
 * P1: A/D = left/right, W = up, S = down, Space = jump, Q = attack.
 * P2: ArrowLeft/ArrowRight/ArrowUp/ArrowDown, Comma = attack, Period = jump.
 * Uses keydown/keyup listeners on a target window object.
 */

import type { InputState } from './types.js';
import { EMPTY_INPUT } from './types.js';

const P1_KEYS: Record<string, keyof InputState> = {
	a: 'left',
	d: 'right',
	w: 'up',
	s: 'down',
	' ': 'jump',
	q: 'attack',
};

const P2_KEYS: Record<string, keyof InputState> = {
	ArrowLeft: 'left',
	ArrowRight: 'right',
	ArrowUp: 'up',
	ArrowDown: 'down',
	'.': 'jump',
	',': 'attack',
};

const ALL_HANDLED_KEYS = new Set([
	...Object.keys(P1_KEYS),
	...Object.keys(P2_KEYS),
]);

export interface InputHandler {
	p1: InputState;
	p2: InputState;
	attach(target: Window): void;
	detach(): void;
}

export function createInputHandler(): InputHandler {
	const p1: InputState = { ...EMPTY_INPUT };
	const p2: InputState = { ...EMPTY_INPUT };

	let attachedTarget: Window | null = null;

	function onKeyDown(event: KeyboardEvent): void {
		const key = event.key;
		if (ALL_HANDLED_KEYS.has(key)) {
			event.preventDefault();
		}

		const p1Field = P1_KEYS[key];
		if (p1Field !== undefined) {
			p1[p1Field] = true;
		}

		const p2Field = P2_KEYS[key];
		if (p2Field !== undefined) {
			p2[p2Field] = true;
		}
	}

	function onKeyUp(event: KeyboardEvent): void {
		const key = event.key;

		const p1Field = P1_KEYS[key];
		if (p1Field !== undefined) {
			p1[p1Field] = false;
		}

		const p2Field = P2_KEYS[key];
		if (p2Field !== undefined) {
			p2[p2Field] = false;
		}
	}

	return {
		p1,
		p2,
		attach(target: Window): void {
			if (attachedTarget) {
				attachedTarget.removeEventListener('keydown', onKeyDown as EventListener);
				attachedTarget.removeEventListener('keyup', onKeyUp as EventListener);
			}
			attachedTarget = target;
			target.addEventListener('keydown', onKeyDown as EventListener);
			target.addEventListener('keyup', onKeyUp as EventListener);
		},
		detach(): void {
			if (attachedTarget) {
				attachedTarget.removeEventListener('keydown', onKeyDown as EventListener);
				attachedTarget.removeEventListener('keyup', onKeyUp as EventListener);
				attachedTarget = null;
			}
		},
	};
}
