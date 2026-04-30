# nfras4arcade - Multiplayer Party Games Platform

## Project Overview
nfras4arcade is a multi-game party platform with seven games:
- **Impostor** — Social deduction game where one player is secretly the "impostor" who doesn't know the secret word but gets a vague hint. Players give clues and vote.
- **President** — Multiplayer card game (climb/shedding style).
- **Chase the Queen** — Card passing game where players avoid the queen of spades.
- **Connect 4** — Classic 2-player strategy game on a 7×6 grid with multi-round scoring.
- **Wavelength** — Team-based party game where players guess where a concept falls on a spectrum.
- **Texas Hold'em Poker** — Multiplayer poker with betting rounds, hand evaluation, side pots, and persistent chip balances.
- **Snap** — Real-time card-matching race where players slap matching cards as fast as possible.

All card games (President, Chase the Queen, Connect 4, Texas Hold'em Poker) extend a shared `CardRoom` base Durable Object class. Snap and Wavelength are standalone Durable Objects.

## Tech Stack
- **Frontend:** SvelteKit 5 (runes mode) with `adapter-cloudflare`
- **Backend:** Cloudflare Workers + Durable Objects (WebSocket Hibernation API)
- **Database:** Cloudflare D1 (SQLite)
- **Auth:** PBKDF2-SHA256 via Web Crypto, cookie-based sessions (7-day expiry)
- **Package Manager:** Bun (always use `bun add`, never `npm install`)

## Architecture

```
src/                        # SvelteKit frontend
  lib/
    types.ts                # Shared TypeScript types (Player, GameState, messages)
    ws.ts                   # WebSocket client singleton (supports guest mode)
    cardSocket.ts           # WebSocket client for card games (supports guest mode)
    stores.ts               # Svelte stores + message handlers
    auth.ts                 # Auth client (login, register, fetchUser)
    guest.ts                # Guest identity (sessionStorage-based guest IDs)
    server/auth/
      password.ts           # PBKDF2-SHA256 password hashing (Web Crypto)
      session.ts            # Session management (D1 + cookies)
    components/
      FeedbackWidget.svelte # Global feedback button + modal
      poker/                # Poker UI components (PokerTable, PlayerSeat, BettingControls, HandDisplay)
      snap/                 # Snap UI components (CardStack, CenterPad, RaceOverlay)
  routes/
    +layout.svelte          # Global nav + FeedbackWidget
    +page.svelte            # nfras4arcade hub (game cards, guest banner)
    impostor/
      +page.svelte          # Impostor lobby (create/join room)
      [code]/+page.svelte   # Main game UI (all phases incl. post-game)
    president/              # President card game
    chase-the-queen/        # Chase the Queen card game
    connect-four/
      +page.svelte          # Connect 4 lobby (create/join)
      [code]/+page.svelte   # Game board UI (interactive grid, hover preview, scores)
      tutorial/+page.svelte # Rules and strategy tips
    poker/
      +page.svelte          # Poker lobby (create/join, chip balance display)
      [code]/+page.svelte   # Game table UI (hole cards, community cards, betting controls)
    snap/
      +page.svelte          # Snap lobby (create/join)
      [code]/+page.svelte   # Game UI (center pad, card stack, race resolution)
    login/+page.svelte      # Login form + "Continue as Guest"
    register/+page.svelte   # Registration form + "Continue as Guest"
    profile/+page.svelte    # Player profile, stats, badges
    admin/
      feedback/             # Admin feedback viewer (sortable table)
    api/                    # SvelteKit server routes
      auth/                 # Auth endpoints (login, register, logout, me, profile)
      create/               # Room code generation (no auth required)
      create-solo/          # Solo game creation with bots
      feedback/             # Feedback submission endpoint
      categories/           # Word categories list
      room/[code]/          # Room info via DO
worker/
  impostor/
    room.ts                 # ImpostorRoom Durable Object (reconnect, guest, leave)
    types.ts                # DO state types
    words.ts                # Word bank (8 categories)
  cards/
    cardRoom.ts             # Base CardRoom DO (abstract, shared card game logic + badge awarding)
    president.ts            # PresidentRoom DO
    chaseTheQueen.ts        # ChaseTheQueenRoom DO
  connectFour/
    room.ts                 # ConnectFourRoom DO (extends CardRoom, 7×6 grid, win/draw detection)
  poker/
    room.ts                 # PokerRoom DO (extends CardRoom, betting rounds, hand eval, chip persistence)
    handEvaluator.ts        # Hand ranking logic (royal flush → high card, side pot splitting)
    potCalculator.ts        # Pot and side pot calculation for all-in scenarios
  snap/
    room.ts                 # SnapRoom DO (standalone, multi-device roles, real-time race resolution)
  bots/
    connectFourBot.ts       # Connect 4 bot AI (win/block/center priority chain)
    pokerBot.ts             # Poker bot AI (hand strength estimation, betting strategy)
    # + other bot files for card games
  index.ts                  # Placeholder (overwritten by adapter-cloudflare)
scripts/
  patch-worker.ts           # Post-build: patches worker with DO export + WS upgrade + guest auth
migrations/
  0001_initial.sql          # D1 schema (users, sessions, profiles, badges, game_sessions)
  0002_lone_monkey_badge.sql # Badge migration
  0003_feedback.sql         # Feedback table for in-game feedback system
  0004_badge_update.sql     # 6 new badges (connect_four_win, social_butterfly, card_shark, night_owl, stalemate, speed_demon)
  0005_poker_chips.sql      # Adds `chips` column to player_profiles for persistent poker currency
```

## Key Commands
```bash
bun install                 # Install dependencies
bun run dev                 # Dev mode via wrangler dev
bun run build               # Build SvelteKit + patch worker
bun run db:migrate:local    # Run D1 migrations locally
bun run db:migrate:prod     # Run D1 migrations in production
```

## Game Flow (Impostor)
1. **Lobby** - Players join via 4-letter room code, host sets category + mode
2. **Hints** - 2 standard hint rounds (+ optional 3rd). Players take turns giving text hints or speaking (voice mode)
3. **Discussion** - Host chooses: next hint round or start voting
4. **Voting** - Single-click lock-in vote for who you think is the impostor
5. **Reveal** - Shows impostor, word, hint, vote breakdown. D1 stats updated. Non-host can leave.
6. **Game Over** - Full post-game screen with player list, votes. Host clicks "Play Again" or everyone can "Leave".

## Game Flow (Connect 4)
1. **Lobby** - 2 players join via room code, can add 1 bot for solo play
2. **Playing** - Players alternate dropping pieces into columns. Hover preview shows where piece will land.
3. **Round Over** - Win detected (4 in a row horizontal/vertical/diagonal) or draw (board full). Scores update.
4. **Next Round** - First player alternates each round. Play continues until players leave.
5. **Game Over** - Final scores shown. D1 stats + badges awarded for logged-in players.

## Game Flow (Texas Hold'em Poker)
1. **Lobby** - Players join via room code; chip balance (persistent via D1 `player_profiles.chips`) shown per seat
2. **Pre-flop** - Blinds posted, hole cards dealt, first betting round (fold/call/raise)
3. **Flop / Turn / River** - Community cards revealed one stage at a time, betting round after each
4. **Showdown** - `handEvaluator.ts` ranks surviving hands; `potCalculator.ts` splits main pot and any side pots for all-in players
5. **Round End** - Chips transferred, D1 balances updated; bust-out players can rebuy or leave
6. **Architecture notes** - PokerRoom extends CardRoom (inherits deck management, reconnection, badge hooks). Betting state machine lives in `room.ts`. Hand evaluation and pot calculation are pure functions in separate files for testability.

## Game Flow (Snap)
1. **Lobby** - Players join; one device can act as the shared "center pad" display, others are player devices
2. **Dealing** - Deck split evenly; players flip cards onto a central pile in turn order
3. **Snap** - When the top two cards match, first player to tap their device wins the pile (race resolved server-side in SnapRoom DO to avoid client timing disputes)
4. **Win** - Player who collects all cards (or most cards when time runs out) wins
5. **Architecture notes** - SnapRoom is a standalone DO (no CardRoom inheritance, same pattern as Wavelength). Multi-device roles (center pad vs. player) handled via a `role` field in the WebSocket join message. Real-time race resolution uses DO request serialization to guarantee a single winner per snap event.

## Badge System (13 badges)
Badges are stored in D1 and awarded via `INSERT OR IGNORE` (idempotent). Guest players (`guest_` prefix) are skipped.

**Regular badges (visible before earning):**
- First Game, Champion (first win), Veteran (10 games), Impostor Win, Perfect Detective
- Going Bananas, Lone Monkey, Four in a Row (C4 win), Social Butterfly (all 4 game types), Card Shark (10 card wins)

**Easter egg badges (hidden until earned):**
- Night Owl (play midnight–5am UTC), Stalemate (C4 draw), Speed Demon (win in <2 minutes)

**Badge awarding architecture:**
- Shared logic in `CardRoom.recordGameEnd()` → calls `checkPostGameBadges()` for cross-game badges (veteran, night_owl, speed_demon, social_butterfly, card_shark)
- Game-specific badges in subclass methods (e.g. `awardConnectFourBadges()` for connect_four_win, stalemate)
- Profile page (`/profile`) shows emoji icons with CSS hover tooltips (name, description, earned date)

**Adding a new badge:** D1 migration INSERT → award logic in relevant DO → add to `allBadges` array in profile page

## Owner Crown
The `nfras4` account gets a crown emoji (👑) next to their name in all game lobbies. Checked client-side by display name match. CSS class: `.owner-crown`.

## Durable Object Bindings
- `IMPOSTOR_ROOM` — ImpostorRoom
- `PRESIDENT_ROOM` — PresidentRoom
- `CHASE_QUEEN_ROOM` — ChaseTheQueenRoom
- `CONNECT_FOUR_ROOM` — ConnectFourRoom
- `POKER_ROOM` — PokerRoom (extends CardRoom)
- `SNAP_ROOM` — SnapRoom (standalone DO, same pattern as Wavelength)

**WebSocket routes:** `/ws` (Impostor), `/ws/president`, `/ws/chase-the-queen`, `/ws/connect-four`, `/ws/poker`, `/ws/snap`

## Auth & Guest Mode
- Login is **optional**. All gameplay is accessible to guests.
- Guests get a session-persistent identity via `sessionStorage` (e.g. `Guest_a1b2`).
- Guest player IDs are prefixed with `guest_` — D1 stats/badges are skipped for guests.
- WebSocket auth: logged-in users authenticate via session cookie; guests pass `guestId` URL param.
- Login/register pages show "Continue as Guest" button with benefit explanation.

## Player Reconnection
- On disconnect mid-game, players get 45 seconds to reconnect (shown as "Reconnecting..." to others).
- After timeout, player is marked "Disconnected" — their turn is skipped in hints phase.
- Host promotion: if the host disconnects/leaves, the next connected player becomes host.
- If no connected players can be promoted, the lobby is dissolved with a message.
- Guests reconnect via the same `guestId` stored in `sessionStorage`.

## Feedback System
- Persistent feedback widget (bottom-right corner) available on every page via `+layout.svelte`.
- Players submit feedback with category (Bug/Suggestion/Other) + free text (max 2000 chars).
- Stored in D1 `feedback` table, tagged with player info, room code, game type, timestamp.
- Admin view at `/admin/feedback` — sortable table (TODO: add auth protection).

## Svelte 5 Runes
- **Do NOT use `onMount`/`onDestroy`** - they get tree-shaken in production builds. Use `$effect` instead.
- Always use runes syntax: `$state`, `$derived`, `$effect`, `$props`
- Use `{@render children()}` not `<slot />`

## Workers Runtime Constraints
- No Node built-ins, no native modules
- Use Web Crypto API (not oslo/bcrypt)
- No ORMs - raw D1 SQL queries only, all parameterised

## Word Categories
Clash Royale Cards, Animals, Food & Drinks, Movies & Shows, Professions, Sports, Landmarks, Video Games

## Recent deployments
- **2026-04-30** - Deployed to nfras4arcade (version `b7867317-994b-4373-947f-e23f2558416d`). Summary: Phase 6 of the paired-device migration (UI polish + cleanup). 19 in-scope items shipped across 4 waves. Wave A1 titleText sweep across 11 non-poker game DOs (snap, president, chaseTheQueen, connectFour, coup, blackjack, roulette, baccarat, wavelength, liarsDice, impostor) plus casino type/resolver chain (CasinoPlayer interface + casinoRoom resolver line) and src/lib/types.ts shared Player interface; consistent emission pattern `titleText: p.titleText ?? null` next to titleBadgeId mirrors the Phase 5 poker reference. Wave A2 CSS-only animations P6-2 (chip slide-in 300ms via reactive bet diff and seatXY-based --from-x/--from-y CSS vars), P6-3 (dealer-button slide ~600ms with separate floating "D" token and seat math, transition on transform), P6-4 (showdown card flip 200ms rotateY with 100ms staggered delay via animation-delay from card index). All animation classes use phase6- prefix to avoid collision; all gated by prefers-reduced-motion. Wave B cleanup: deleted /api/pair/remember and /api/pair/check_remembered route files, scrubbed `remembered` state + `$effect` fetches + template conditionals + CSS in both src/routes/pair/+page.svelte and src/lib/components/pairing/PairButton.svelte (the second consumer was an architect-flagged miss in the original brief), deleted orphaned src/lib/components/pairing/deviceFingerprint.ts (zero remaining imports after Wave B), added unmount-cleanup `$effect(() => () => clearTimeout(dropoutHideTimer))` at src/routes/poker/[code]/+page.svelte (P6-17 retargeted from DropoutToast.svelte per recon - the toast component already cleans its own interval), confirmed P6-18 casino spectator promotion gate is a no-op (no canPromoteSpectator path exists in worker/casino/), P6-19 PlayerSeat min-width override deferred pending real-device QA. Wave C P6-1 paired_fold_animation: new WebSocket message type emitted via `this.broadcast(...)` (the actual cardRoom.ts:1129 method, replacing nonexistent broadcastToAll/hasPairedDevice from initial draft) immediately after fold mutation in BOTH the case 'fold' branch (worker/poker/room.ts:350) AND handlePlayerTimeout (line 878), positioned BEFORE each early-return path so the animation fires even when fold ends the hand; client-side 3-layer wiring chain in src/routes/poker/[code]/+page.svelte (`tick` import + `foldAnimation = $state<{playerId, fromSeat} | null>(null)` + async onMessage handler with `await tick()` guard at line 89 to prevent Svelte 5 reactive batching from coalescing the animation trigger and subsequent state_update into a single DOM flush) plus prop pass-through `foldAnimation={foldAnimation} onfoldAnimationDone={() => { foldAnimation = null; }}` to both TableView and MobilePokerView; views render a transient phase6-fold-arc card-back element animated from seat to muck pile center over 500ms, with `onanimationend` invoking the callback plus a 500ms setTimeout fallback inside `$effect` so reduced-motion users (animation: none) still clear foldAnimation. Pipeline: existing kickoff brief at .omc/plans/phase6-kickoff-brief.md → ralplan consensus iteration 2 (Architect + Critic both APPROVE after 9 fixes applied across 1 iteration including replacing phantom method names, specifying full client wiring chain, adding await tick() guard, expanding cleanup scope to PairButton.svelte, real-player resolver lines for 4 standalone DOs, wave restructure, ADR honesty correction, fold-animation clearing mechanism, and emit-before-early-return positioning) → autopilot Phase 2 execution (3 parallel executors for waves A1+A2+B then sequential opus executor for wave C with await tick guard correctness as the load-bearing constraint) → Phase 4 validation (architect APPROVE on functional completeness across 7 checks; security-reviewer APPROVE with confirmation that titleText is admin-curated D1-sourced and Svelte-escaped not {@html}'d, that paired_fold_animation leaks no data beyond what broadcastState already broadcasts, that device_pairings table retention is intentional per logout cleanup at api/auth/logout/+server.ts:16, and that no new D1 mutations or auth paths were introduced; code-reviewer APPROVE-WITH-MINOR-FIXES → all 5 fixes applied in a follow-up pass: $derived → $derived.by for arrow-function-bodied derived values to restore reactivity tracking [TableView lines 154/173 plus 4 template call-site removals], dead `toRemove` variable removal, dunder __foldSeat/__timeoutFoldSeat renamed to plain locals, orphaned deviceFingerprint.ts deletion, and one explanatory "what" comment removed). Final test baseline preserved exactly: 339 pass / 28 pre-existing fail in server/ (unrelated standalone Bun impostor server). Build 29.23s, tsc clean. Phase 7 (3D rendering update) gated on real-play feedback that 2D table view feels flat; kickoff brief at .omc/plans/phase7-kickoff-brief.md needs deep-interview before ralplan. Branch: `main`, commit: `019cb8c`.
- **2026-04-30** - Deployed to nfras4arcade (version `f69204ee-07d6-477e-96ca-c295858f4cff`). Summary: Phase 5 of the paired-device migration (polish + correctness invariants + tests). 16 items shipped across 5 waves: spectator buy-in atomic D1 gate via new `canPromoteSpectator` hook on CardRoom (default true; PokerRoom override does atomic `UPDATE chips = chips - ? WHERE chips >= ?` with `meta.changes` guard for insufficient funds; casual mode short-circuits with no D1 round-trip; error toast via existing `sendTo`); `scheduleBotTurn` alarm overwrite guard mirroring `scheduleDisconnectCheck` pattern so a sooner disconnect/grace alarm is never clobbered; `titleText` resolver via LEFT JOIN badges in `cosmetics.ts` (server-side; bots get null) plumbed through types.ts to PlayerSeat across TableView + MobilePokerView, fixing a pre-existing bug where opponents had no title text; surface dropout grace toast UX (new DropoutToast.svelte using Svelte 5 runes countdown via $effect interval, position fixed, single page-level mount; cardRoom emits `paired_grace_expired` inside the `if (stillEmpty)` branch after `handleDisconnect`; `paired_device_removed` payload includes `graceDurationMs` so the client uses authoritative server duration; page handlers gate on `roleParam` in `{controller,table}` so non-paired users never see false toasts); HoleCards muck-arc `'offscreen-top'` wiring (extended `isReleaseOverMuck` to commit fold when pointer release is in upper 30% of viewport for paired-mode controller throw-up gesture); hidden the "Remember 7 days" pair checkbox + state + POST + orphaned CSS (backend `device_pairings` table kept for future re-enable; endpoint deletion deferred to Phase 6); `Object.hasOwn` fix on `betPlayers.eliminated` derivation prevents flash of all-eliminated opponents for fresh spectators; removed dead `{#if !state}` block in MobilePokerView (parent already gates); PlayerSeat 150ms transition documented as intentional; `.armed-dimmed` CSS deduped to global `app.css` utility. 13 new tests in `worker/poker/__tests__/{fairness,alarmGuard,cleanup}.test.ts` + `src/routes/api/pair/__tests__/pair.test.ts`: fairness invariant asserts `union(controller, table) === both` with no field-conflict assertion (treats both `null` and empty arrays as "stripped" to catch truncated-hand divergence); alarm guard tests sooner-alarm-preserved with deterministic 200ms/5s comparison; cleanup tests device-removal accounting + auto-fold timeout pipeline; pair tests auth-mismatch 403 + happy 200 + mismatch-does-not-consume + expired. Pipeline: brief at `.omc/plans/phase5-kickoff-brief.md` (16 items P5-1 through P5-16) → ralplan consensus iter 1 ACCEPT-WITH-RESERVATIONS (5 critic clarifications applied inline) → autopilot Phase 2 execution (one opus executor across 5 waves) → Phase 4 validation (architect APPROVE on chip atomicity + fairness invariant; code-reviewer COMMENT with 1 HIGH dropout-toast partner-inference guard + 3 MED tests-and-docs all fixed inline). Wave 6 manual QA items (P5-3 bot rendering on TableView, P5-12 mobile lobby callback binding, P5-16 slow-network redirect verification) deferred to post-deploy. Phase 6 (UI polish + cleanup; 19 items, ralplan-direct ready) and Phase 7 (3D rendering update; needs deep-interview) kickoff briefs filed at `.omc/plans/phase{6,7}-kickoff-brief.md`. Build 25.69s, tsc clean, 339 pass / 28 pre-existing fail (server/ baseline maintained, +12 new tests since prior deploy). Branch: `main`, commit: `22b8fc4`.
- **2026-04-30** - Deployed to nfras4arcade (version `b84cc337-6591-45af-9af1-9e35efc7aadd`). Summary: Hotfix #1 against the just-deployed paired-device migration. Three QA bugs from real-device testing. (BLOCKER) Mobile login form submitted empty `{email:"", password:""}` body even though both fields were visibly filled, causing the server's "Email and password are required" rejection; root cause was iOS/mobile-Chrome autofill not firing the `input` events that Svelte 5's `bind:value` requires to sync the rune state. Fixed by reading values via `new FormData(form)` with the rune as fallback in both `/login` and `/register` submit handlers, plus added `name=` attributes to all auth inputs (email, password, displayName, confirmPassword) so FormData can pick them up. The bug only surfaced now because the new /pair → auth-redirect flow funnels guest scanners through /login on mobile much more often than before. (Bug 2) Guest user in a poker lobby who clicked "Pair my phone" got a generic "Pair request failed" message because PairButton rendered for everyone (no auth gate) and `/api/pair/issue` returned 401 which the client error mapping didn't handle. Fixed at two layers: (a) gated PairButton render on `$isLoggedIn` at both PC lobby (`+page.svelte:321`) and mobile lobby (`MobilePokerView` got new `isLoggedIn` prop, gate at line 191), and (b) added `status === 401` branch to PairButton's onclick handler returning "Sign in to use paired mode" plus the same branch in /pair page's `describeError` returning "Sign in to pair this device" as defense in depth. (Bug 3) Guest spectator clicking an in-progress poker room (host already playing) was stuck on "Connecting..." forever; the server-side spectator-add path at `cardRoom.ts:573-578` correctly emits `joined` with `isSpectator: true, state: getStateFor(playerId, role)`, but the client dispatcher overwrote `gameState` even when `msg.state` was null/undefined for some edge cases, leaving the parent `{#if !state}` loading gate triggered. Fixed by gating `gameState.set(msg.state)` on `msg.state` being truthy, logging a warn + re-issuing `socket.joinRoom(code)` after 500ms if `joined` arrives without state, and also unblocking the loading gate on `state_update` so a state-only update can recover from a missed `joined`. Investigation captured at `.omc/state/phase4-spectator-bug.md` per the document-then-fix rule. Build 27.00s, tsc clean, 327 pass / 28 pre-existing fail. Branch: `main`, commit: `4a71444`.
- **2026-04-30** - Deployed to nfras4arcade (version `19ec8345-5511-4031-9b31-3d0f8dc84a13`). Summary: Paired-device migration Phases 1-4 + pre-Phase-3 security gates landed in a single comprehensive commit. Phases 1-2 + 2.5 backfill: device-set primitive (`Player.devices: Device[]`) across 13 game DOs (cardRoom, casinoRoom, poker, president, chase-the-queen, connect-four, coup, blackjack, baccarat, roulette, snap, wavelength, impostor, liarsDice) with role-aware `getStateFor(playerId, deviceRole)` filter that nulls hole cards / private state for `role='table'`; per-`(userId, role)` F4 socket eviction so phone+PC for the same userId coexist; shared `worker/shared/deviceManager.ts` (armReconnectGrace, removeDevice, hasRemainingDevices, pushDevice with `legacy:*` cleanup); 3-tag `acceptWebSocket(server, [userId, role, socketId])`. Phase 3 pairing flow: in-memory `worker/shared/pairingTokens.ts` with 60s TTL + 6-char shortCode index + 10k FIFO eviction; four `/api/pair/*` endpoints (issue, consume, remember, check_remembered) with per-(user,IP) rate limit + auth-mismatch 403 + existence-leak prevention; new `/pair` mobile-first route with QR-token auto-submit + 6-char alphanumeric fallback; `PairButton.svelte` lobby component with QR display + 60s countdown + WS `paired_device_added` listener; 60s reconnect-grace via `ctx.storage` `grace:*` keys with FIRST-block `alarm()` handler + fall-through (controller-only arm, `phase != 'lobby'` gate); `cardSocket.setRole()` helper for PC auto-demotion to 'table' on phone pair (with `demotedToTable` single-shot latch); logout clears `arcade-guest-id` localStorage + `device_pairings` D1 rows. Phase 4 per-surface UI: three layout components selected by `$derived(role x viewport)` in `+page.svelte` (1012 -> 558 lines) - `TableView.svelte` (PC felt, top-down with seat-around-perimeter math `step = 360 / (totalOpponents + 1)`, side-pot HUD, conditional own-hand+actions for solo PC), `ControllerView.svelte` (phone compact: chip strip + HoleCards + BetControls + game_over panel), `MobilePokerView.svelte` (phone solo: vertical 100dvh stack + lobby with Add Bot button + PairButton + side-pot HUD + owner crown for `nfras4`). All three handle game_over with results panel + Back to Lobby. Pure helpers extracted to `src/lib/utils/pokerHelpers.ts` (playerName, getBlindLabel, evaluateHandName). Reuses existing `PlayerSeat.svelte` (no new OpponentSeat needed; existing `.seat.active` style provides the static colored ring). isMobile detection via `$effect` with `matchMedia('(pointer: coarse)')` + window resize listener (cleanup returned). Cosmetics now correctly use FLAT field paths (`opp.frameSvg` not nested) - fixes a pre-existing bug where opponents had never had cosmetics in poker. Security gates G1-G5 (pre-Phase-3 unblockers): G1 PBKDF2 100k -> 600k via prefixed hash format `${iter}:${salt}:${hash}` with rehash-on-login (legacy 2-field still verifies); G2 in-process per-IP rate limit on `/login` (5/60s) + `/register` (3/hour) + per-(user,IP) on `/api/pair/issue`; G3 session token SHA-256 hashed in `sessions.token_hash` (migration 0022) with constant-time validate (forces re-login for all existing sessions); G4 logout clears `arcade-guest-id` from localStorage + sessionStorage; G5 register `db.batch` atomicity ratified with WHY comment. D1 migrations applied to remote: 0022 session_token_hash, 0023 device_pairings, 0024 pairing_tokens (the contingency artifact, applied as inert table; flip-the-switch is now deploy-code-only). Pipeline: deep-interview Phase 3 (4 rounds, 9% ambiguity) -> ralplan consensus (Architect+Critic APPROVE iter 2) -> autopilot Phase 3 (3 sequential opus executors + Phase 4 fix pass for 3 reviewer-flagged blockers); deep-interview Phase 4 (4 rounds, 8% ambiguity) -> ralplan consensus (APPROVE iter 1) -> autopilot Phase 4 (1 opus executor + Phase 4 fix pass for 8 validation findings including 2 architect blockers). Phase 5 kickoff brief filed at `.omc/plans/phase5-kickoff-brief.md` with 13 polish items (surface dropout toast, spectator buy-in gate, fairness invariant test, bot rendering, titleText resolver, scheduleBotTurn alarm guard, etc.) ready to ralplan-direct after real-device QA. Build 26.74s, tsc clean, 327 pass / 28 pre-existing fail (server/ baseline maintained), worker/index.js regenerated. Branch: `main`, commit: `da8e091`.
- **2026-04-29** - Deployed to nfras4arcade. Summary: Hotfix #4 (poker server hardening + showdown render fix). Three rounds of bug-hunt agents (round 4 multi-device + connectivity audit; round 5 LSP + cross-game + database + security + end-to-end flow) surfaced 4 BLOCKER + 8 MAJOR + 11 MEDIUM findings. Per the new document-then-fix rule, all findings were aggregated into `.omc/plans/master-fix-plan.md` BEFORE any patch was applied. This commit ships P0 + P1 + P2 (8 fixes from the plan): (F1) folded player can now see their own hole cards at showdown - the `committed` reset $effect was only firing on `gameState === 'in-hand'`, so showdown left `committed=true` and blocked `showCards`; reset now also fires on showdown. (F2 BROKEN) chip-wipe on reconnect: poker DO was overwriting in-DO `playerChips` with the stale D1 `chipsHeader` value in competitive mode, so winning a hand and dropping mid-flush wiped the win on reconnect; now only uses header when DO state is undefined. (F3 BROKEN) disconnect timeout was a no-op for poker because the base `handlePlayerTimeout` advances `currentTurn` while poker uses `actionOnPlayerId`; PokerRoom now overrides to fold the timed-out player, advance the action, end the betting round if complete, save state, reschedule bot turns. Phones losing signal no longer freeze tables. (F4 BROKEN) per-socket dedup added to `acceptWebSocket`; previously two tabs / phone+pc for the same userId coexisted as parallel sockets racing on chip persistence. Now: enumerate `getWebSockets(userId)` and close prior sockets with code 4001 ('replaced') before accepting the new one. (F5 MAJOR) replaced 4 bare `catch {}` blocks with logging catches in `persistChips`, `recordBiggestWin`, gameSession insert, and `recordGameEnd` - real D1 failures were invisible. (F6 MAJOR) `checkAllInShowdown` made `async`, awaiting `allInRunout` and `saveState` so state survives DO hibernation; `recordGameEnd.catch(() => {})` becomes a logging catch. (F8/F9) deleted 6 dead constants in HoleCards.svelte and unused `detectInputModeSafe`; `viewportContext` documented as paired-phone-reserved. Build 25.22s, tsc clean, 31 unit + 6 fuzz tests pass. Deferred separate initiatives (in master-fix-plan.md): cross-game chip atomicity refactor, security hardening (rate-limit auth endpoints, verify session token, raise PBKDF2 to 600k iterations, add CSP/HSTS), DB schema constraints, auth/session hygiene. Branch: `main`, commits: `6f29836` (client) + `e112f05` (server).
- **2026-04-29** - Deployed to nfras4arcade. Summary: Hotfix hole-cards gesture #3 (8 fixes from a third-round bug-hunt agent battery: showdown spec revert + gesture hot-path perf restructure). (A) BLOCKER: hotfix #2 had excluded `'showdown'` from `showCards`, hiding the player's own hole cards at the moment of the reveal, contradicting plan §Step 9. Reverted; the original collision concern was moot because BetControls is already gated by `bettingRound !== 'showdown'` at +page.svelte:498. Added an `$effect` that forces `faceUp = [true, true]` at showdown so the cards reveal alongside opponents. (B) `faceUp` $state was leaking across hands; added a $effect that resets it on `gameState === 'pre-deal'` or when the cards-identity key changes. (C) Moved `currentY` and `velocityBuffer` out of the gesture $state into module-scoped plain `let` so pointermove (60-240Hz) no longer triggers reactive invalidation of every $derived reading `gesture`. Plus `gesture.zone` only assigned on actual transitions. (D) Imperative pointerdown $effect was reactive to `allowGesture` and re-attached on every gesture-state change; added `allowGestureRef` object so the listener-attaching effect depends only on the ref slot. (E) `will-change: transform` was unconditional and never cleared, retaining a permanent GPU layer; now class-bound to `willChangeActive` $derived. (F) `runThrowAnimation` re-read `getBoundingClientRect()` at commit causing a synchronous layout in the most performance-sensitive frame; now uses the muckRectSnapshot from pointerdown unless null/zero/offscreen. (G) Added `contain: layout paint` to `.hole-cards-root`. (H) IME guard on `onCardKeyDown`. Build 26.63s, tsc clean, 31 unit + 6 fuzz tests pass. Perf changes are static-analysis-motivated, not yet real-device-profiled. Branch: `main`, commit: `3a47673`.
- **2026-04-29** - Deployed to nfras4arcade. Summary: Hotfix hole-cards gesture #2 (6 fixes from a second-round bug-hunt agent battery). (1) Phone layout BLOCKER: cards (`position: fixed; bottom: 0; z-index: 50`) overlapped BetControls (also fixed bottom: 0 at <= 420px), blocking taps on Fold/Check/Call. Pushed `:global(.bet-controls)` mobile bottom to `calc(env(safe-area-inset-bottom) + 140px)` so the action bar sits above the cards (matches the original "buttons live above cards" layout). BetControls.svelte itself untouched per spec. (2) Page padding-bottom BLOCKER: `.game-page` mobile padding was 7rem, hiding ~200px of content behind the stacked fixed layers; bumped to 18rem. (3) Animation leak MAJOR: `commitStyles()` was baking `transform`/`opacity` into inline style; with the `{#each ... (i)}` keyed by index, next-hand cards rendered invisible until full reload. Now `removeProperty('transform')` + `removeProperty('opacity')` after `commitStyles + cancel`, plus stronger key `(card.suit + card.rank + i)`. (4) Screen-reader BLOCKER: static `aria-label="Hole card"` was the same for both cards; now dynamic ("Ace of hearts, hole card, tap to flip face down"). (5) Keyboard BLOCKER: `role="button"` + `tabindex=0` had no key handler; added `onkeydown` for Enter/Space that mirrors tap-to-flip. (6) Showdown overlap: `showCards` now excludes `'showdown'`. Build 26.18s, tsc clean, 31 unit + 6 fuzz tests pass. Branch: `main`, commit: `4c9ec61`.
- **2026-04-29** - Deployed to nfras4arcade. Summary: Hotfix hole-cards gesture (5 fixes from post-deploy edge-case audit + cross-browser research). (1) `onaction({type:'fold'})` wrapped in try/catch so a synchronous parent throw can't strand the gesture in `tracking`. (2) Pointerdown reentrancy guard now blocks `committing` and `returning` (not just `tracking`); the previous "structurally impossible" claim was wrong because `committed=true` is set in `arc.onfinish` ~450ms after gesture-commit. (3) Pointerdown attached imperatively via `addEventListener(..., { passive: false })` so `event.preventDefault()` can stop iOS Safari from hijacking vertical drift as page scroll before `setPointerCapture` locks; `preventDefault` fires only after reentrancy/visibility guards pass. (4) `muckTarget.ref.getBoundingClientRect()` snapshotted at pointerdown rather than at gesture-commit to dodge iOS Safari's stale fixed-position rect during scroll. (5) New `finalizeAnim()` calls `animation.commitStyles()` then `.cancel()` (guarded by `playState !== 'idle'`) on arc/flip/reduced-motion onfinish + unmount cleanup, releasing the WAAPI `fill: 'forwards'` cascade hold so subsequent CSS transitions on transform/opacity aren't silently blocked. Plus exported `ZONE_IDLE_DEADBAND` for tests. Build 26.05s, tsc clean, all 31 gesture tests pass. Branch: `main`, commit: `65ed55c`.
- **2026-04-29** - Deployed to nfras4arcade. Summary: Add physical hole-card gesture for poker. New `src/lib/components/poker/HoleCards.svelte` (surface-agnostic, Svelte 5 runes, native PointerEvents, Web Animations API). Three-zone drag (resting / lift-peek / armed-throw) commits the fold via the existing `onaction` callback at gesture-commit time, before the throw arc finishes. Tap a card to flip, slow drag up to peek, drag past 40% viewport while it is your turn to arm and release in the muck zone (or flick) to fold. Idle drift, prefers-reduced-motion fallback, reentrancy guard, defensive `cards.length !== 2` warn, `$effect` cleanup cancels live animations on unmount. Surface-agnostic component contract reserves `muckTarget.kind === 'offscreen-top'` for the future phone-as-remote architecture without a rewrite. New `src/lib/utils/inputMode.ts` (capability detection) and `src/lib/utils/holeCardsGesture.ts` (pure-function gesture state machine, single source of truth for gesture constants, 31 bun:test cases). +page.svelte wires `<CommunityCards>` as the muck target via `bind:this`, wraps `<BetControls>` in `armed-dimmed` so the action bar fades during arm. Pipeline: deep-interview (ambiguity ~14%) -> ralplan consensus (Architect + Critic, 16 improvements applied) -> autopilot (Phase 2 execution + Phase 4 multi-perspective validation, 4 follow-up fixes applied). Build 25.05s, tsc clean. Branch: `main`, commit: `22f42de`.
- **2026-04-29** - Deployed to nfras4arcade. Summary: Fix impostor late-joiner spectator trap reported by friends on mobile (only 3 of 4-7 players got to play). Root cause was compound: (1) `src/lib/guest.ts` used sessionStorage which Instagram/Messenger in-app WebViews wipe on refresh, generating fresh guest IDs that arrived after `phase !== 'lobby'` and got auto-shunted to spectator mode at `worker/impostor/room.ts:330`; (2) the existing spectator UI was a single uppercase word "Spectating" with zero explanation. Fixes: switched guest ID storage to localStorage with sessionStorage fallback, replaced the cryptic banner with explanatory copy + sticky positioning, and added a quiet hint under host's Start Game button warning that late arrivals will spectate until next round. Also removed the platformer game (DO, routes, lib, bots, tests, wrangler binding v13 deletion). Branch: `main`, commit: `c097792`.
- **2026-04-29** - Deployed to nfras4arcade. Summary: Platformer balance pass. Knockback now actually launches victims: stepPlayer ignores left/right/jump/attack input while hitstunMs > 0 (320ms) so the impulse carries the player instead of being cancelled by their own movement. Smash-style ramp via hitsTaken counter (each prior hit this life adds 12% knockback multiplier; resets on respawn). Tuning: KNOCKBACK_X 380->620, KNOCKBACK_Y -360->-520, ATTACK_RANGE 56->72, ATTACK_COOLDOWN_MS 600->450. Client renders damage % under each player. 29 platformer tests pass (1 new hitstun test); 214/28 full suite (no regressions). Branch: `main`, commit: `cb23411`.
- **2026-04-29** - Deployed to nfras4arcade. Summary: Platformer feature pack (autopilot): bot AI (host spawns 0-3 bots, "Play Solo" works), 4 maps + lobby vote, 3 powerups (speed/damage/triple-jump, 8s effects, 10s spawn cadence, max 2 simultaneous), procedural Web Audio sound (jump/double-jump/hit/death/victory/powerup, defaults muted, HUD toggle), and pure-fn integration test harness (simulator + 5 invariant-checking tests). Validator hardening: disconnectTimestamps now persisted across DO hibernation; powerup IDs deterministic; bot vote guard; bot IDs use crypto.randomUUID. 28 platformer tests pass; full suite 213/28 (16 new tests, 0 regressions). Branch: `main`, commit: `ec8b148`.
- **2026-04-29** - Deployed to nfras4arcade. Summary: Add experimental PvP Platformer game at /platformer (2-4 players, last fighter wins). New PlatformerRoom Durable Object runs ~15Hz physics simulation via DO alarm; client renders to canvas at requestAnimationFrame. Move A/D, Space jump (double-jump), J/K attack with knockback. First to 2 round wins takes the match. XP +100 winner / +50 others mirrors snap pattern. New /games hub card with EXPERIMENTAL gold tag. Migration v12 creates the new SQLite DO class. 12 new bun:test physics cases pass; tsc + build clean. Branch: `main`, commit: `336e764`.
- **2026-04-27** - Deployed to nfras4arcade. Summary: Add `/about` case study page (hero, live D1 stats from new `+page.server.ts`, featured games, engineering highlights, stack chips, timeline) + corner "About" link in `+layout.svelte` (hidden inside game rooms). Soften background pattern legibility: `body::before` opacity 0.6→0.28 dark / 0.9→0.5 light, and replaced the subtle radial vignette in `body::after` with a linear tint toward `--bg` so text on transparent containers (about timeline, lobby pages) stays readable. Build 25.48s, tsc clean. Branch: `main`, commit: `b32ff42`.
