# VFX Kit - Cookbook

## CSS Classes (import auto via layout)

| Class | When to use | Example |
|---|---|---|
| `.vfx-shake` | Light hit/wrong answer (~350ms) | `<div class:vfx-shake={wrong}>` |
| `.vfx-shake-hard` | Big impact/explosion (~500ms) | `<div class:vfx-shake-hard={bust}>` |
| `.vfx-slam-in` | Stamp text: LIAR! BLACKJACK (~280ms) | `<span class="vfx-slam-in">LIAR!</span>` |
| `.vfx-pop-in` | Cards/chips appearing (~240ms) | `<div class="vfx-pop-in">` |
| `.vfx-breathe` | Active-turn highlight, infinite pulse | `<div class:vfx-breathe={myTurn}>` |
| `.vfx-flash-green` | Correct/win flash (~450ms) | `<div class:vfx-flash-green={won}>` |
| `.vfx-flash-red` | Error/loss flash (~450ms) | `<div class:vfx-flash-red={lost}>` |
| `.vfx-flash-gold` | Jackpot/bonus flash (~450ms) | `<div class:vfx-flash-gold={jackpot}>` |
| `.vfx-sparkle-text` | Big-win label with shimmer sweep | `<span class="geo-title vfx-sparkle-text">WINNER</span>` |
| `.vfx-dissolve-out` | Destroyed card/influence (~700ms) | `<div class:vfx-dissolve-out={eliminated}>` |

### Standalone keyframes (use in component `<style>`)

| Keyframe | Use case |
|---|---|
| `vfx-tumble` | Dice rolling (apply to dice element, ~800ms) |
| `vfx-deal-arc` | Card flying in from offscreen (~500ms) |
| `vfx-ring` | Expanding ring at any element center |
| `vfx-float-up` | Rising text/icon, 36px travel |

---

## Transition-detection pattern (re-trigger animations)

CSS classes only animate on first render. To re-trigger on state change, toggle the class via a derived key:

```svelte
<script lang="ts">
  let score = $state(0);
  let flashKey = $state(0);
  let prevScore = score;

  $effect(() => {
    const s = score;
    if (s !== prevScore) {
      prevScore = s;
      flashKey++;
    }
  });
</script>

{#key flashKey}
  <div class="vfx-flash-green score-box">{score}</div>
{/key}
```

The `{#key}` block destroys and recreates the element, restarting the animation.

---

## Timer-cleanup pattern (self-removing overlays)

Always return the cleanup from `$effect` so timers are cancelled on component destroy:

```svelte
<script lang="ts">
  let visible = $state(true);

  $effect(() => {
    const id = setTimeout(() => { visible = false; }, 700);
    return () => clearTimeout(id);
  });
</script>
```

---

## Components

### `<Shockwave>`

Expanding ring burst. Absolutely positioned (in-place) or fixed (x/y supplied).

```svelte
<script lang="ts">
  import Shockwave from '$lib/vfx/Shockwave.svelte';
  let hits = $state(0);
</script>

<div style="position:relative">
  <Shockwave trigger={hits} color="var(--red)" size={100} />
  <button onclick={() => hits++}>Hit</button>
</div>
```

Props: `trigger` (number, increment to fire), `x?` / `y?` (fixed px coords), `color` (default `var(--accent)`), `size` (default 120).

---

### `<FloatUp>`

Rising "+250" / score label. Place inside a `position:relative` container.

```svelte
<script lang="ts">
  import FloatUp from '$lib/vfx/FloatUp.svelte';
  let floats: number[] = $state([]);
</script>

<div style="position:relative">
  {#each floats as id (id)}
    <FloatUp text="+250" color="var(--green)" />
  {/each}
  <button onclick={() => floats = [...floats, Date.now()]}>Award</button>
</div>
```

Props: `text` (string), `color` (default `var(--green)`). Self-removes after ~900ms.

---

### `<Spotlight>`

Full-screen dim backdrop for dramatic reveals (impostor reveal, coup challenge).

```svelte
<script lang="ts">
  import Spotlight from '$lib/vfx/Spotlight.svelte';
  let revealing = $state(false);
</script>

<Spotlight active={revealing}>
  <div class="reveal-card">THE IMPOSTOR IS: Nick</div>
</Spotlight>
<button onclick={() => revealing = true}>Reveal</button>
```

Props: `active` (boolean), `children` snippet (rendered centered above dim layer). Dim layer is `pointer-events:none`.

---

## burst.ts functions

```ts
import {
  fireGoldBurst,
  fireBurstAt,
  fireLoss,
  fireWinConfetti,
  fireImpostorVfx,
} from '$lib/vfx/burst';
```

| Function | When to use | Signature |
|---|---|---|
| `fireGoldBurst` | Casino jackpot, big chip win | `fireGoldBurst(origin?)` |
| `fireBurstAt` | Localized burst on a UI element | `fireBurstAt(xFrac, yFrac, colors)` |
| `fireLoss` | Sad loss/bust puff | `fireLoss(origin?)` |
| `fireWinConfetti` | General round win (from vfx.ts) | `fireWinConfetti()` |
| `fireImpostorVfx` | Impostor reveal win (from vfx.ts) | `fireImpostorVfx()` |

`origin` is `{ x: number; y: number }` in viewport fractions (0-1).

To get pixel coords for `fireBurstAt`:
```ts
const rect = el.getBoundingClientRect();
fireBurstAt(
  (rect.left + rect.width / 2) / window.innerWidth,
  (rect.top + rect.height / 2) / window.innerHeight,
  ['#f0c030', '#ffe680']
);
```
