import { writable, derived } from 'svelte/store';
import type { GameState, ServerMessage } from './types';
import { socket } from './ws';

export const gameState = writable<GameState | null>(null);
export const playerId = writable<string | null>(null);
export const chatMessages = writable<Array<{ name: string; text: string; timestamp: number }>>([]);
export const error = writable<string | null>(null);
export const connected = writable(false);
export const votesIn = writable(0);
export const isSpectator = writable(false);

export const isHost = derived(
  [gameState, playerId],
  ([$state, $pid]) => $state?.hostId === $pid
);

export const myTurn = derived(
  [gameState, playerId],
  ([$state, $pid]) => {
    if (!$state || $state.phase !== 'hints') return false;
    return $state.turnOrder[$state.currentTurnIndex] === $pid;
  }
);

export const currentTurnPlayer = derived(
  gameState,
  ($state) => {
    if (!$state || $state.phase !== 'hints') return null;
    const id = $state.turnOrder[$state.currentTurnIndex];
    return $state.players.find(p => p.id === id) || null;
  }
);

let errorTimeout: ReturnType<typeof setTimeout>;

export function initSocketListeners(): () => void {
  const unsub = socket.onMessage((msg: ServerMessage) => {
    switch (msg.type) {
      case 'joined':
        playerId.set(msg.playerId);
        gameState.set(msg.state);
        connected.set(true);
        isSpectator.set(msg.isSpectator === true);
        break;

      case 'state_update':
        gameState.update(prev => {
          if (prev?.phase !== 'voting' && msg.state.phase === 'voting') {
            votesIn.set(0);
          }
          return msg.state;
        });
        if ('isSpectator' in msg) {
          isSpectator.set(msg.isSpectator === true);
        }
        break;

      case 'chat_message':
        chatMessages.update(msgs => [
          ...msgs,
          { name: msg.name, text: msg.text, timestamp: msg.timestamp }
        ]);
        break;

      case 'round_result':
        gameState.update(s => s ? { ...s, roundResult: msg.result, phase: 'reveal' } : s);
        break;

      case 'error':
        error.set(msg.message);
        clearTimeout(errorTimeout);
        errorTimeout = setTimeout(() => error.set(null), 4000);
        break;

      case 'vote_cast':
        votesIn.update(n => n + 1);
        break;

      case 'lobby_dissolved':
        error.set(msg.message);
        gameState.set(null);
        connected.set(false);
        break;
    }
  });

  return unsub;
}

export function resetStores(): void {
  gameState.set(null);
  playerId.set(null);
  chatMessages.set([]);
  error.set(null);
  connected.set(false);
  votesIn.set(0);
  isSpectator.set(false);
}
