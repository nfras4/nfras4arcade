/** Bot player types and utilities for all card games. */

export interface BotPlayer {
  id: string;
  name: string;
  isBot: true;
  difficulty: 'easy';
}

const BOT_NAMES = [
  'Banana Joe',
  'Sir Chomps',
  'Agent Gibbon',
  'Dr Baboon',
  'Captain Chimp',
  'Lord Macaque',
  'The Orangutan',
  'Professor Howler',
  'Baron von Ape',
  'Monkey Business',
  'Gorilla Grodd',
  'Tamarin Tim',
  'Mandrill Max',
  'Lemur Larry',
  'Bonobo Bob',
  'Capuchin Carl',
  'Spider Monk',
  'Gibby the Gibbon',
  'Marmoset Mike',
  'Baboon Benny',
];

let botCounter = 0;

/** Generate a unique bot ID prefixed with "bot_". */
export function generateBotId(): string {
  botCounter++;
  const rand = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  return `bot_${rand}_${botCounter}`;
}

/** Pick a random monkey-themed name from the pool. */
export function generateBotName(usedNames?: Set<string>): string {
  const available = usedNames
    ? BOT_NAMES.filter(n => !usedNames.has(n))
    : BOT_NAMES;
  const pool = available.length > 0 ? available : BOT_NAMES;
  const idx = crypto.getRandomValues(new Uint32Array(1))[0] % pool.length;
  return pool[idx];
}

/** Random delay between 1200-2500ms for bot think time. */
export function botThinkDelay(): number {
  const rand = crypto.getRandomValues(new Uint32Array(1))[0];
  return 1200 + (rand % 1301); // 1200 to 2500
}
