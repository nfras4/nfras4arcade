# Monkey Table Art Bible (v1, Phase 0)

The visual contract for the 3D table. Every table-related build is reviewed against this document. Companion roadmap lives at `.omc/plans/monkey-table-roadmap.md` in the main worktree (untracked).

## Identity

Chunky, toy-like, mischievous. Crossy Road fidelity, not Pixar, not Fall Guys squish. A monkey must read clearly at 200px tall, because the real audience is a phone filming a TV across a living room. If a detail does not survive that test, it does not exist.

## The monkey

- **Head and hands only.** No body; the torso is implied below the table edge. Hands appear contextually (shaking the cup, pushing chips) and are hidden by default.
- **Proportions:** head is a rounded cube, wider than tall (about 1.2 : 1). Muzzle is a second, smaller rounded box on the lower front half. Ears are large flat discs set high on the sides. Eyes are flattened white spheres with black disc pupils, no iris.
- **Rounding is mandatory (reasserted 2026-06-12, Nick: "very blocky"):** head, muzzle, and jaw use rounded-box geometry (RoundedBoxGeometry from three addons, 2 to 3 segments, corner radius about 0.10 on the head and proportionally less on muzzle/jaw), NOT plain BoxGeometry. Flat shading stays on; the goal is chunky toy, not shipping crate. The mouth cavity softens with the muzzle so the open jaw reads as a snout, not a drawer.
- **Jaw:** the bottom third of the muzzle is a separate mesh hinged at its back edge, rotating on X from 0 (closed) to 0.45 rad (max open).
- **Poly budget:** 1,500 triangles max per head including ears and jaw; 400 max per hand.
- **Flat shading.** Faceted normals everywhere; the visible low-poly facets are the style, not a limitation to hide.

## Materials and palette

- Toon or flat-lit materials with solid colours. No PBR texture maps, no normal maps, ever.
- **Fur:** six player colours derived from the app's existing player accent CSS vars so 3D seats match 2D UI identity. Muzzle and inner ears: cream `#F2E3C9`.
- **Table:** deep casino-green felt (sample the existing casino accent), barrel sides in warm walnut.
- Background: near-black. The table is a stage, not a room.

## Rig contract (load-bearing)

These node names are the permanent interface. The Phase 0 procedural placeholder and every future Blender GLB must use them exactly, so models swap with zero code changes.

| Node | Purpose |
|---|---|
| `Root` | Seat origin, faces table centre |
| `Head` | Look-at and reaction rotations |
| `Jaw` | X-rotation, 0 closed to 0.45 rad open |
| `EyeL`, `EyeR` | Y-scale for blink and squint |
| `BrowL`, `BrowR` | Raise/lower/angle offsets |
| `AnchorCrown` | Top-centre hat mount |
| `AnchorBrow` | Headband/glasses mount |
| `AnchorMouth` | Cigar-class props |
| `HandL`, `HandR` | Hidden by default |

## Expressions (Phase 0 ships four)

Expressions are pose presets (sets of node transforms), not blend shapes.

- **neutral:** jaw 0, eyes 100%, brows level.
- **grin:** jaw 0.12 rad, eyes squint to 85%, head tilts 4 degrees.
- **shock:** jaw 0.40 rad, eyes scale to 130%, brows up, head pulls back 6 degrees.
- **sweat:** eyes 70%, brows pinched in, subtle head tremor (about 0.5 degree noise at 8Hz).

Transitions tween over 120 to 180ms with ease-out. Expressions never snap (except under reduced motion, below).

## Jaw flap

Input is a scalar amplitude 0 to 1 (Phase 0: a test slider and auto-oscillator; Phase 3: an AnalyserNode on received voice audio). Jaw target = amplitude x 0.35 rad, lerped at roughly 0.3 per frame at 60fps, with a head bob of amplitude x 2 degrees. The flap should look like a muppet, not a lip-sync.

## Lighting and camera

Theatrical staging: one warm key spotlight above table centre, low ambient fill, a cool rim from behind the far seats. Camera authored, slightly above seated eye level; the frame is composed like a film set and players never get free orbit.

**Seated parallax (approved 2026-06-12):** the camera leans subtly toward the mouse to sell "I am sitting at this table". Constrained to about +/-6 degrees yaw and +/-2.5 degrees pitch around the authored framing, eased (lerp ~0.08/frame), drifting back to centre when the pointer leaves the stage. Disabled under prefers-reduced-motion. Touch devices stay static (TV mode revisits this in Phase 2). The constraint is the point: it must feel like turning your head at a chair, never like a camera tool.

## Motion rules

- Nothing moves linearly. Cartoon timing: tiny anticipation (about 50ms), fast action (about 150ms), settle with a 1.05 to 1.1 overshoot.
- `prefers-reduced-motion`: expressions become instant swaps, no tremor, no head bob, no idle motion.
- **Idle UI is static (Nick, 2026-06-12: pulsing grey highlight and blur "too much, tone down a lot").** Motion belongs to events (bids, slams, rituals, confetti), never to ambience. No breathing/pulsing affordances on controls at rest, no glow loops, no backdrop-filter blur on persistent bars or overlays; persistent surfaces use solid dark backgrounds. The 3D monkeys may idle (that is presence); the 2D chrome may not.

## Performance budget

- 60fps on a mid-range phone with 7 monkeys (6 players plus a future dealer).
- 15k triangles max for the whole scene. At most one shadow-casting light (Phase 0 may ship with no shadows). No postprocessing in Phase 0.
- All 3D code lazy-loads with its route. Zero impact on the hub bundle and zero impact on the worker bundle (client-only).

## Code conventions

- Shared scene code in `src/lib/table3d/`. Rig node names and expression presets as constants in `src/lib/table3d/rig.ts`; nothing references node names as inline strings.
- The placeholder monkey is built procedurally from primitives, strictly to the rig contract.
- Svelte 5 runes throughout; `$effect`, never `onMount`. Scoped styles and CSS vars, no Tailwind. No em dashes in copy.
- Imperative Three.js rigs mount via `<T is={root} />`, NOT `scene.add(root)`. Mounting imperatively bypasses Threlte parent transforms; every monkey would stack at the origin. The `$effect` only disposes GPU resources on unmount.

## Table staging datum (canonical, Phase 0 tuned)

These numbers are the approved staging values. Future scenes derive from them; do not adjust without art direction sign-off.

| Parameter | Value | Notes |
|---|---|---|
| Felt surface Y | 0.06 | Top face of felt disc (`BarrelTable.svelte`) |
| Felt radius | 2.0 | `CylinderGeometry` top/bottom radius |
| Barrel body radius | 1.85 | Slightly inset from felt edge |
| Base flare | r=1.90 bottom / r=2.10 top | Foot ring |
| Seat root Y | 0.35 | `SEAT_Y` in `core/seats.ts`; head centre ~0.85 world-Y |
| Arc radius | 2.30 | `ARC_RADIUS` in `core/seats.ts` |
| Half-arc angle | 65 deg | `HALF_ARC_DEG`; total spread 130 deg, all seats on far half |
| Monkey root scale | 0.62 | `MONKEY_SCALE` in `core/seats.ts`; heads clear neighbours on the arc |
| Camera position | `[0, 1.5, 3.6]` | Eye level slightly above seat root |
| Camera FOV | 42 deg | Horizontal field of view |
| Camera lookAt | `[0, 0.2, -0.6]` | Slightly below and behind table centre |
| Key light | 55 candela, pos `[0, 4.2, 1.4]`, angle 0.55 | Warm `#ffe8c0` spotlight |
| Nameplate anchor | (seat root Y + 0.95) * MONKEY_SCALE | Offset scaled by MONKEY_SCALE; clears crown with margin |
| Nameplate left clamp | 6% to 94% | Prevents edge-seat plates clipping stage bounds |

## TV full-table arc (provisional)

For Phase 2 TV mode, the 6-seat spectator view uses `FULL_TABLE_ARC` (all players rendered, including local):

| Parameter | Value | Notes |
|---|---|---|
| Arc radius | 2.60 | Larger than desktop (2.30) to accommodate 6 players |
| Half-arc angle | 75 deg | Total spread 150 deg, wider than desktop (130 deg) |
| Max slots | 6 | Includes local player in rendering |
| TV camera position | `[0, 1.9, 4.6]` | Frames 6-seat arc for 16:9 landscape viewing |
| TV camera FOV | 46 deg | Wider than desktop (42 deg) for TV distance |
| TV camera lookAt | `[0, 0.2, -0.5]` | Slightly elevated sight line |

Clearance maths: adjacent chord ~1.35 scene units (2 x 2.60 x sin(150/5/2 deg)) versus scaled head width ~1.28 (head+ears ~2.07 x MONKEY_SCALE = 0.62).

**Note:** These values are PROVISIONAL, pending art director tuning for final show framing and far-field legibility on actual TV hardware.
