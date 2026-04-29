/**
 * ASCII map parser for Eggnogg+ level files.
 * Panels are separated by lines starting with three or more dashes.
 * Each panel is PANEL_H rows x PANEL_W columns.
 * Panels stack horizontally (left to right) to form the world.
 */

import type { MapDef, Tile } from './types.js';
import { PANEL_W, PANEL_H } from './types.js';

const CHAR_MAP: Record<string, Tile> = {
	' ': 'air',
	'@': 'ground',
	v: 'spike_down',
	X: 'spike_up',
	m: 'mine',
	w: 'wave_kill',
	'^': 'wave_win',
	E: 'eggnogg',
	'*': 'sword',
	I: 'pillar_bg',
	F: 'vline_bg',
	f: 'dither_bg',
	O: 'sun_bg',
	Q: 'skull_bg',
};

function charToTile(ch: string): Tile {
	return CHAR_MAP[ch] ?? 'air';
}

function isSeparator(line: string): boolean {
	return /^-{3,}/.test(line);
}

/**
 * Returns true if the line looks like a title comment rather than tile data.
 * Titles start with non-space, non-dash text (e.g. "level1" or "The Palace").
 */
function looksLikeTitle(line: string): boolean {
	if (line.length === 0) return false;
	const ch = line[0];
	return ch !== ' ' && ch !== '-' && !(ch in CHAR_MAP);
}

/**
 * Parse a panel block (array of raw text lines) into a 2D tile grid.
 * Grid is [row][col], size PANEL_H x PANEL_W.
 */
function parsePanel(lines: string[]): Tile[][] {
	const grid: Tile[][] = [];
	for (let row = 0; row < PANEL_H; row++) {
		const line = lines[row] ?? '';
		const tileRow: Tile[] = [];
		for (let col = 0; col < PANEL_W; col++) {
			const ch = col < line.length ? line[col] : ' ';
			tileRow.push(charToTile(ch));
		}
		grid.push(tileRow);
	}
	return grid;
}

/**
 * Parse an ASCII map file into a MapDef.
 * Panels are delimited by separator lines (---+).
 * An optional title line at the very top (before first separator) is skipped.
 */
export function loadMap(text: string, name: string): MapDef {
	const rawLines = text.split('\n').map((l) => l.replace(/\r$/, ''));

	// Collect panel line-blocks separated by separators.
	// Each entry in panelBlocks is an array of tile lines for one panel.
	const panelBlocks: string[][] = [];
	let current: string[] = [];
	let preambleSkipped = false;

	for (const line of rawLines) {
		if (isSeparator(line)) {
			if (current.length > 0) {
				panelBlocks.push(current);
			}
			current = [];
			preambleSkipped = true;
			continue;
		}

		// Skip a title line that appears before any separator has been seen
		if (!preambleSkipped && looksLikeTitle(line)) {
			continue;
		}

		current.push(line);
	}
	// Flush trailing block
	if (current.length > 0) {
		panelBlocks.push(current);
	}

	const panels = panelBlocks.map(parsePanel);

	return {
		name,
		panels,
		widthTiles: panels.length * PANEL_W,
		heightTiles: PANEL_H,
	};
}
