import { describe, it, expect } from 'bun:test';
import { loadMap } from '../../src/lib/eggnogg/maps.js';
import { PANEL_W, PANEL_H } from '../../src/lib/eggnogg/types.js';

// Two-panel fixture: panel 0 has a ground row at the bottom, panel 1 is all air.
// Each panel is PANEL_H=12 rows x PANEL_W=33 cols.
function makeFixture(): string {
	// Panel 0: bottom row is all '@' (ground), rest air
	const panel0Lines: string[] = [];
	for (let row = 0; row < PANEL_H - 1; row++) {
		panel0Lines.push(' '.repeat(PANEL_W));
	}
	panel0Lines.push('@'.repeat(PANEL_W)); // row 11: ground

	// Panel 1: all air
	const panel1Lines: string[] = [];
	for (let row = 0; row < PANEL_H; row++) {
		panel1Lines.push(' '.repeat(PANEL_W));
	}

	return ['---', ...panel0Lines, '---', ...panel1Lines].join('\n');
}

describe('maps -- loadMap basic structure', () => {
	it('parses 2 panels from fixture', () => {
		const map = loadMap(makeFixture(), 'test');
		expect(map.panels.length).toBe(2);
	});

	it('widthTiles is panels.length * PANEL_W', () => {
		const map = loadMap(makeFixture(), 'test');
		expect(map.widthTiles).toBe(2 * PANEL_W);
	});

	it('heightTiles is PANEL_H', () => {
		const map = loadMap(makeFixture(), 'test');
		expect(map.heightTiles).toBe(PANEL_H);
	});

	it('name is preserved', () => {
		const map = loadMap(makeFixture(), 'mymap');
		expect(map.name).toBe('mymap');
	});
});

describe('maps -- tile lookups', () => {
	it('panel 0 row 11 col 0 is ground', () => {
		const map = loadMap(makeFixture(), 'test');
		expect(map.panels[0][11][0]).toBe('ground');
	});

	it('panel 0 row 0 col 0 is air', () => {
		const map = loadMap(makeFixture(), 'test');
		expect(map.panels[0][0][0]).toBe('air');
	});

	it('panel 1 all tiles are air', () => {
		const map = loadMap(makeFixture(), 'test');
		for (let row = 0; row < PANEL_H; row++) {
			for (let col = 0; col < PANEL_W; col++) {
				expect(map.panels[1][row][col]).toBe('air');
			}
		}
	});
});

describe('maps -- special tile chars', () => {
	it('parses spike_down from v', () => {
		// One panel with a single spike_down in row 0 col 0
		const line0 = 'v' + ' '.repeat(PANEL_W - 1);
		const restLines = Array.from({ length: PANEL_H - 1 }, () => ' '.repeat(PANEL_W));
		const text = ['---', line0, ...restLines].join('\n');
		const map = loadMap(text, 'spikes');
		expect(map.panels[0][0][0]).toBe('spike_down');
	});

	it('parses spike_up from X', () => {
		const line0 = 'X' + ' '.repeat(PANEL_W - 1);
		const restLines = Array.from({ length: PANEL_H - 1 }, () => ' '.repeat(PANEL_W));
		const text = ['---', line0, ...restLines].join('\n');
		const map = loadMap(text, 'spikes');
		expect(map.panels[0][0][0]).toBe('spike_up');
	});

	it('parses eggnogg from E', () => {
		const line0 = 'E' + ' '.repeat(PANEL_W - 1);
		const restLines = Array.from({ length: PANEL_H - 1 }, () => ' '.repeat(PANEL_W));
		const text = ['---', line0, ...restLines].join('\n');
		const map = loadMap(text, 'egg');
		expect(map.panels[0][0][0]).toBe('eggnogg');
	});

	it('unknown char defaults to air', () => {
		const line0 = '?' + ' '.repeat(PANEL_W - 1);
		const restLines = Array.from({ length: PANEL_H - 1 }, () => ' '.repeat(PANEL_W));
		const text = ['---', line0, ...restLines].join('\n');
		const map = loadMap(text, 'unk');
		expect(map.panels[0][0][0]).toBe('air');
	});
});

describe('maps -- title line skipping', () => {
	it('skips a title comment before the first separator', () => {
		const fixture = makeFixture();
		const textWithTitle = 'level1\n' + fixture;
		const map = loadMap(textWithTitle, 'titled');
		expect(map.panels.length).toBe(2);
	});
});
