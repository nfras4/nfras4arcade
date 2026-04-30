// Pure helpers extracted from src/routes/poker/[code]/+page.svelte for reuse
// across ControllerView, TableView, MobilePokerView, and the route file.
// Each function takes its dependencies as explicit parameters; no closures.

export type CardLike = { suit: string; rank: string };

export interface PlayerLike {
  id: string;
  name: string;
}

export function playerName(playerId: string, players: PlayerLike[] | null | undefined): string {
  return players?.find((p) => p.id === playerId)?.name ?? 'Unknown';
}

export function getBlindLabel(
  playerId: string,
  sbPlayerId: string | null | undefined,
  bbPlayerId: string | null | undefined,
): string | undefined {
  if (playerId === sbPlayerId) return 'SB';
  if (playerId === bbPlayerId) return 'BB';
  return undefined;
}

const RANK_VAL: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

const RANK_LABEL: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export function evaluateHandName(holeCards: CardLike[], community: CardLike[]): string {
  const all = [...holeCards, ...community];
  if (all.length < 2) return '';
  const vals = all.map((c) => RANK_VAL[c.rank] ?? 0).sort((a, b) => b - a);
  const suits = all.map((c) => c.suit);

  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const suitCounts = new Map<string, number>();
  for (const s of suits) suitCounts.set(s, (suitCounts.get(s) ?? 0) + 1);
  let flushSuit: string | null = null;
  for (const [s, c] of suitCounts) {
    if (c >= 5) { flushSuit = s; break; }
  }

  const unique = [...new Set(vals)].sort((a, b) => a - b);
  if (unique.includes(14)) unique.unshift(1);
  let straightHigh = 0;
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i + 4] - unique[i] === 4) {
      straightHigh = unique[i + 4];
    }
  }

  if (flushSuit && straightHigh) {
    const flushCards = all.filter((c) => c.suit === flushSuit);
    const fv = [...new Set(flushCards.map((c) => RANK_VAL[c.rank]))].sort((a, b) => a - b);
    if (fv.includes(14)) fv.unshift(1);
    let sfHigh = 0;
    for (let i = 0; i <= fv.length - 5; i++) {
      if (fv[i + 4] - fv[i] === 4) sfHigh = fv[i + 4];
    }
    if (sfHigh === 14) return 'Royal Flush';
    if (sfHigh > 0) return 'Straight Flush';
  }

  if (groups[0][1] >= 4) return `Four of a Kind, ${RANK_LABEL[groups[0][0]]}s`;
  if (groups[0][1] >= 3 && groups.length > 1 && groups[1][1] >= 2) return 'Full House';
  if (flushSuit) return 'Flush';
  if (straightHigh) return 'Straight';
  if (groups[0][1] >= 3) return 'Three of a Kind';
  if (groups[0][1] >= 2 && groups.length > 1 && groups[1][1] >= 2) return 'Two Pair';
  if (groups[0][1] >= 2) return `Pair of ${RANK_LABEL[groups[0][0]]}s`;
  return `High Card ${RANK_LABEL[groups[0][0]]}`;
}
