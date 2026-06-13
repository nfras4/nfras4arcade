<script lang="ts">
  import type { RitualBanner } from './TableDirector.svelte.js';

  interface Props {
    banner: RitualBanner | null;
    names: Record<string, string>;
  }

  let { banner = null, names = {} }: Props = $props();

  // Dice glyphs for die faces 1-6
  const diceGlyphs: Record<number, string> = {
    1: '⚀',
    2: '⚁',
    3: '⚂',
    4: '⚃',
    5: '⚄',
    6: '⚅',
  };

  function getDieGlyph(face: number): string {
    return diceGlyphs[face] ?? '?';
  }

  function renderDice(dice: number[], matchFace: number, onesWild: boolean): { glyph: string; isMatch: boolean }[] {
    return dice.map((die) => {
      const isExactMatch = die === matchFace;
      const isWildMatch = onesWild && matchFace !== 1 && die === 1;
      const isMatch = isExactMatch || isWildMatch;
      return {
        glyph: getDieGlyph(die),
        isMatch,
      };
    });
  }
</script>

{#if banner}
  <div class="ritual-overlay" aria-hidden="true">
    {#if banner.kind === 'liar-call'}
      <div class="banner-content">
        <div class="stamp">LIAR!</div>
        <div class="subline">{names[banner.callerId] ?? banner.callerId} calls out {names[banner.accusedId] ?? banner.accusedId}</div>
      </div>

    {:else if banner.kind === 'showdown'}
      <div class="banner-content">
        <div class="heading">The bid: {banner.bid.count} x {getDieGlyph(banner.bid.face)}</div>
        <div class="subline">
          Counting {getDieGlyph(banner.bid.face)}s...
          {#if banner.onesWild && banner.bid.face !== 1}
            <span> (1s are wild)</span>
          {/if}
        </div>
      </div>

    {:else if banner.kind === 'tally'}
      <div class="banner-content">
        <div class="counter">{banner.runningCount} / {banner.bidCount}</div>
        <div class="subline">
          {names[banner.playerId] ?? banner.playerId}:
          <span class="dice-display">
            {#each renderDice(banner.dice, banner.face, banner.onesWild) as item, i (i)}
              <span class:matching={item.isMatch}>{item.glyph}</span>
            {/each}
          </span>
        </div>
      </div>

    {:else if banner.kind === 'hold'}
      <div class="banner-content">
        <div class="hold-text">{banner.runningCount} found... {banner.bidCount} needed</div>
      </div>

    {:else if banner.kind === 'verdict'}
      <div class="banner-content">
        <div class="stamp" class:caught={banner.liarCaught} class:cleared={!banner.liarCaught}>
          {#if banner.liarCaught}LIAR CAUGHT!{:else}NOT A LIE!{/if}
        </div>
        <div class="subline">{names[banner.loserId] ?? banner.loserId} loses a die</div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .ritual-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 10vh;
    z-index: 50;
  }

  .banner-content {
    animation: vfx-slam-in 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @media (prefers-reduced-motion: reduce) {
    .banner-content {
      animation: none !important;
    }
  }

  /* ─── Stamp styles (liar-call, verdict) ───────────────────────── */

  .stamp {
    font-size: clamp(2.5rem, 6vw, 5rem);
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    transform: rotate(-6deg);
    background: rgba(0, 0, 0, 0.72);
    color: #e5484d;
    padding: 1rem 2rem;
    border-radius: 8px;
    text-align: center;
    margin-bottom: 0.5rem;
    text-shadow: 0 0 16px rgba(229, 72, 77, 0.4);
  }

  .stamp.caught {
    color: #e5484d;
    text-shadow: 0 0 16px rgba(229, 72, 77, 0.4);
  }

  .stamp.cleared {
    color: var(--green, #3dd68c);
    text-shadow: 0 0 16px rgba(61, 214, 140, 0.4);
  }

  /* ─── Heading styles (showdown) ────────────────────────────────── */

  .heading {
    font-size: clamp(1.5rem, 5vw, 3rem);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    background: rgba(0, 0, 0, 0.72);
    color: var(--text, #d8dce8);
    padding: 1rem 1.5rem;
    border-radius: 8px;
    text-align: center;
    margin-bottom: 0.5rem;
  }

  /* ─── Counter styles (tally) ─────────────────────────────────── */

  .counter {
    font-size: clamp(2rem, 5vw, 4rem);
    font-weight: 700;
    font-family: 'Rajdhani', monospace;
    background: rgba(0, 0, 0, 0.72);
    color: var(--text, #d8dce8);
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    text-align: center;
    margin-bottom: 0.5rem;
  }

  /* ─── Hold text ────────────────────────────────────────────────── */

  .hold-text {
    font-size: clamp(1.25rem, 4vw, 2rem);
    font-weight: 600;
    background: rgba(0, 0, 0, 0.72);
    color: var(--text, #d8dce8);
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    text-align: center;
  }

  /* ─── Subline ──────────────────────────────────────────────────── */

  .subline {
    font-size: clamp(0.875rem, 2.5vw, 1.25rem);
    font-weight: 500;
    color: var(--text-muted, #a8b8c4);
    background: rgba(0, 0, 0, 0.72);
    padding: 0.5rem 1rem;
    border-radius: 8px;
    text-align: center;
  }

  /* ─── Dice display (tally subline) ─────────────────────────────── */

  .dice-display {
    display: inline-flex;
    gap: 0.3em;
    margin-left: 0.5em;
    font-family: monospace;
    font-size: 1.1em;
    font-weight: 600;
  }

  .dice-display .matching {
    color: #f0c030;
    text-shadow: 0 0 8px rgba(240, 192, 48, 0.4);
  }

  .dice-display span {
    display: inline-block;
    min-width: 1.2em;
    text-align: center;
  }
</style>
