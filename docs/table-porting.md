# Table Porting Notes: Browser Now, Steam Someday

Standing intent (2026-06-12): the 3D table experience may one day ship as a native game on Steam, most plausibly in Godot 4 (first-class GLB import, cheap indie licensing, C# or GDScript, also exports back to web). We build for the browser today, but every table feature is structured so the port is a rewrite of thin interpreters, not of the game.

## The boundary rule

`src/lib/table3d/core/` is engine-agnostic: pure TypeScript, **no imports from svelte, three, threlte, or SvelteKit**. Everything that defines how the game feels lives there as data and pure functions. Everything that draws lives outside core/ and is allowed to be disposable.

| Portable (core/, survives the port) | Disposable (interpreters, rewritten per engine) |
|---|---|
| Rig contract: node names, expression poses, jaw-flap and tremor constants (`core/rig.ts`) | Threlte/three scene components (PlaceholderMonkey, BarrelTable, TableLayer) |
| Seat math: arc transforms, stable playerId seat assignment, fur hashing (`core/seats.ts`) | HTML nameplate overlays |
| Semantic events: state-diff to event derivation, event type definitions (`core/events.ts`) | Svelte `$effect` wiring that feeds state snapshots in |
| Ritual choreography: timeline as data (steps, durations, light cues, expression cues, variant ids) (`core/ritual.ts`) | The timeline player that maps cues to three.js lights |
| Emote registry: ids, expression bursts, bubble glyphs, sting recipes as parameter data (`core/emotes.ts`) | Web Audio synthesis implementation, DOM emote strip |
| Game rules: liars-dice logic already lives in `worker/liarsDice/logic.ts` as mostly pure functions | The Durable Object transport around it |

The test for any new module: "could a Godot script consume this file's contents after a mechanical TS-to-C# translation?" If it needs a renderer or a framework to mean anything, it does not belong in core/.

## Contracts that make the port cheap

1. **The rig is the asset contract.** Node names (Root/Head/Jaw/eyes/brows/anchors) are defined once in core/rig.ts and mirrored by any model. The eventual Blender-authored GLB is itself engine-neutral: the same file imports into Godot/Unity directly. Expressions are pose data applied to named nodes, not baked animations, so they replay identically anywhere.
2. **The wire protocol is documented schema, not incidental shape.** The liars-dice client state (`LDState`) and message types in/out of `LiarsDiceRoom` constitute the netcode contract. A Steam build either talks to the same Cloudflare DO over WebSocket (cheapest: ship the web netcode), or reimplements the message schema over Steam networking. Keep the schema documented next to the DO; never let presentation code depend on undocumented message fields.
3. **Presentation consumes semantic events, not UI diffs.** `core/events.ts` derives events (BID_PLACED, BIG_BID, LIAR_CALLED, REVEAL_STEP, VERDICT, PLAYER_ELIMINATED, EMOTE) from consecutive state snapshots. The browser feeds it snapshots from the WebSocket; a native build feeds it snapshots from whatever transport it has. All choreography hangs off events, so the entire reaction layer ports as data plus one derivation function.
4. **Audio is recipes, not files.** Stings are parameter data (oscillator types, envelopes, pitch curves) in core/emotes.ts interpreted by a small Web Audio player. A native build interprets the same recipes with its own synth, or renders them once to .wav assets. No licensing baggage, no asset drift.

## What a port would actually entail (estimate, for planning honesty)

- Rewrite interpreters: monkey rig applier, timeline player, synth player, scene/lighting. Small, well-specified work because everything they play is data.
- Game logic: translate `worker/liarsDice/logic.ts` pure functions, or keep an authoritative server and ship the existing protocol client.
- New work the browser never needed: Steamworks integration, lobbies/invites, packaging, input. This is the real cost of the port; nothing we do now changes it, which is exactly why we spend nothing on it today beyond this document.

## Standing review rule

Every table-feature PR review (art director pass) checks: no svelte/three/threlte import crept into `core/`, and any new feel-defining behaviour (timing, poses, choreography, sting shapes) landed as core/ data rather than inline in a component.
