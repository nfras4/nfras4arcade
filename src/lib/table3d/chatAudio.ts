/**
 * Chat blip audio scheduler for the Monkey Table.
 *
 * Separated from core/chatVoice.ts so it can import audio.ts (which
 * references Web Audio API and localStorage -- browser-only, not SSR-safe).
 *
 * Call playChatBlips() once per new chat message in whichever view is active.
 * The route's $effect handles all views; ChatBubble is purely visual.
 */

import { playSting } from './audio.js';
import { buildBlipRecipe, revealSchedule, type VoiceParams } from './core/chatVoice.js';

const REVEAL_SPEED_CPS = 18;

/**
 * Play the Undertale-style blip sequence for a chat message.
 * Non-blocking: schedules setTimeouts and returns immediately.
 * Mute state is respected inside playSting().
 *
 * @param text   The message text (same string sent to ChatBubble).
 * @param voice  Voice params for the sender (from voiceParamsFor).
 * @returns      A cancel function that clears all pending timeouts.
 */
export function playChatBlips(text: string, voice: VoiceParams, startTs?: number): () => void {
  const { delaysMs } = revealSchedule(text, REVEAL_SPEED_CPS);
  const ids: ReturnType<typeof setTimeout>[] = [];

  // Audit fix #28: if startTs is provided, treat the schedule as anchored to
  // that wall-clock moment. Blips whose delay has already passed are skipped
  // (already audible to whoever was on the page); remaining ones fire at
  // delaysMs[i] - offsetMs. Without startTs we preserve the old behaviour.
  const offsetMs = startTs != null ? Math.max(0, Date.now() - startTs) : 0;

  // Iterate by Unicode code points so astral-plane emoji fire one blip,
  // not two (audit fix #8). Skip any whitespace (space, tab, newline)
  // so tab/newline don't produce audible square waves (audit fix #27).
  const codePoints = Array.from(text);
  for (let i = 0; i < codePoints.length; i++) {
    const char = codePoints[i];
    if (/\s/.test(char)) continue; // all whitespace is silent
    if (delaysMs[i] <= offsetMs) continue; // already past

    const id = setTimeout(() => {
      const recipe = buildBlipRecipe(char, voice, i);
      playSting(recipe);
    }, delaysMs[i] - offsetMs);

    ids.push(id);
  }

  return () => ids.forEach((id) => clearTimeout(id));
}
