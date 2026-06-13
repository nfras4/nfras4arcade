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
export function playChatBlips(text: string, voice: VoiceParams): () => void {
  const { delaysMs } = revealSchedule(text, REVEAL_SPEED_CPS);
  const ids: ReturnType<typeof setTimeout>[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === ' ') continue; // spaces produce no blip

    const id = setTimeout(() => {
      const recipe = buildBlipRecipe(char, voice, i);
      playSting(recipe);
    }, delaysMs[i]);

    ids.push(id);
  }

  return () => ids.forEach((id) => clearTimeout(id));
}
