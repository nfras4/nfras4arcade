import { describe, it, expect } from 'bun:test';
import { toFP, fromFP, mulFP, divFP, floorFP, FP_SCALE } from '../../src/lib/eggnogg/fixedPoint.js';

describe('fixedPoint -- FP_SCALE', () => {
	it('FP_SCALE is 256', () => {
		expect(FP_SCALE).toBe(256);
	});
});

describe('fixedPoint -- toFP / fromFP roundtrip', () => {
	it('fromFP(toFP(123)) equals 123', () => {
		expect(fromFP(toFP(123))).toBe(123);
	});

	it('fromFP(toFP(0)) equals 0', () => {
		expect(fromFP(toFP(0))).toBe(0);
	});

	it('toFP(1) equals FP_SCALE', () => {
		expect(toFP(1)).toBe(FP_SCALE);
	});

	it('fromFP(toFP(16)) equals 16', () => {
		expect(fromFP(toFP(16))).toBe(16);
	});
});

describe('fixedPoint -- mulFP', () => {
	it('mulFP(toFP(2), toFP(3)) produces toFP(6)', () => {
		expect(mulFP(toFP(2), toFP(3))).toBe(toFP(6));
	});

	it('mulFP(toFP(0), toFP(100)) produces toFP(0)', () => {
		expect(mulFP(toFP(0), toFP(100))).toBe(toFP(0));
	});

	it('mulFP(toFP(1), toFP(5)) produces toFP(5)', () => {
		expect(mulFP(toFP(1), toFP(5))).toBe(toFP(5));
	});
});

describe('fixedPoint -- divFP', () => {
	it('divFP(toFP(6), toFP(2)) produces toFP(3)', () => {
		expect(divFP(toFP(6), toFP(2))).toBe(toFP(3));
	});

	it('divFP(toFP(10), toFP(5)) produces toFP(2)', () => {
		expect(divFP(toFP(10), toFP(5))).toBe(toFP(2));
	});
});

describe('fixedPoint -- floorFP', () => {
	it('floorFP(toFP(7)) equals 7', () => {
		expect(floorFP(toFP(7))).toBe(7);
	});

	it('floorFP(toFP(7) + 1) equals 7 (floors fractional part)', () => {
		expect(floorFP(toFP(7) + 1)).toBe(7);
	});

	it('floorFP(toFP(0)) equals 0', () => {
		expect(floorFP(toFP(0))).toBe(0);
	});
});
