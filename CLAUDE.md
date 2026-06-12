# nfras4arcade - Multiplayer Party Games Platform

## Project Overview
nfras4arcade is a multi-game party platform with seven games:
- **Impostor** — Social deduction game where one player is secretly the "impostor" who doesn't know the secret word but gets a vague hint. Players give clues and vote.
- **President** — Multiplayer card game (climb/shedding style).
- **Chase the Queen** — Card passing game where players avoid the queen of spades.
- **Connect 4** — Classic 2-player strategy game on a 7×6 grid with multi-round scoring.
- **Wavelength** — Team-based party game where players guess where a concept falls on a spectrum.
- **Texas Hold'em Poker** — RETIRED 2026-05-12. Server code remains dormant (DO binding kept, /ws/poker returns 503, /poker page shows retired notice). Removed from casino hub. Code lives in `worker/poker/` for archaeology but is unreachable from the UI. See deploy log 2026-05-01 for the original DO usage runaway that prompted the kill switch.
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
- **2026-06-12** - Deployed to nfras4arcade (version `69ab4773-f69c-4436-a5a6-5c25d1646092`). Summary: VFX/juice pass across all 12 games, completion deploy. Shared kit at `src/lib/vfx/` (vfx.css utility classes vfx-shake/-slam-in/-pop-in/-breathe/-flash-*/-sparkle-text/-dissolve-out + keyframes vfx-tumble/-deal-arc/-ring/-float-up; Shockwave/FloatUp/Spotlight components; burst.ts gold/loss confetti wrappers; USAGE.md cookbook) imported once in +layout. Per-game effect hooks (presentation-only, no logic/WS changes, runes + prev-value transition detection): impostor role-flip + spotlight reveal + CAUGHT/ESCAPED stamps + glitch flicker + word letter cascade; president pile shockwaves + QUAD shake + coronation sparkle; chase-the-queen queen vignette + trick banner slam + MOON SHOT + score FloatUps; connect-four squash-stretch drops + sequential win-line ignite; wavelength dial target unveil + BULLSEYE moment; snap speed-lines + slap shake + champion banner; liars-dice full treatment (tumble reveal cascade, match ignite, LIAR! slam, dissolving lost dice, pot FloatUps); coup crosshair flicks + challenge spotlight + influence burn; blackjack BLACKJACK/BUST stamps + payout floats; roulette spin motion-blur + green 14x mega-moment; baccarat winner glow wall + NATURAL shimmer; slots tiered 5x/15x JACKPOT celebrations + payline draw-in. Built by a 26-agent Workflow (12 sonnet builders w/ per-game work orders + strict file ownership, 12 haiku QA, kit + gate agents). NOTE: this work collided with the parallel security-audit session (its 09:41 C4 + 10:02 consolidation deploys shipped most VFX mid-recovery); the session stash-trampled in-flight work, dropped liars-dice entirely (recovered from dangling stash commit ca5ec7d via git fsck), and its consolidation commit f52f6c3 carried two timer-hygiene bugs fixed here (president combo-hide effect, chase-the-queen FloatUp forEach no-op cleanup). Lesson recorded: one session per repo; use worktree isolation for write-heavy workflows. tsc clean, build clean. Branch: `main`, commit: `833f6d7`.
- **2026-06-11** - Deployed to nfras4arcade (version `7780f3f7-82cf-4153-b4b5-d57185f68730`). Summary: New customer-facing `/store` bundle storefront (single new file `src/routes/store/+page.svelte`, ~990 lines, nothing else touched). Bento grid selling the 8 party games as packs: Full Party Pack hero 2x2 tile ($31.92 struck to $12.99, SAVE 59%, rotated BEST VALUE ribbon, looping shine sweep), Bluffer's Bundle (Impostor + Liar's Dice + Coup, $8.99, blue), Card Night (President + Chase the Queen + Snap, $8.99, yellow), Head-to-Head (Connect 4 + Wavelength, $5.99, casino orange), animated savings-meter tile, stats tile, promise tile with inline SVG glyphs, full-width solo strip ($3.99 chips with type-color glow). Static draft: no checkout backend, buy CTAs fire a coming-soon toast (role=status, aria-live). Per-tile accent theming via element-level CSS custom props (--tile-accent/--tile-faint/--tile-border) over the standard clip-path + ::before gradient-border tile base; the border gradient's z-index:0 produces a translucent accent wash per tile face, kept deliberately. Light mode + mobile verified by screenshot; ribbon text uses var(--bg) so it stays readable in both themes. Built via Workflow orchestration (sonnet builder + 2 haiku QA + sonnet check-runner, Opus PM review pass caught duplicate copy on Bluffer's title, hardcoded ribbon hex, role=listitem on button, dead .tile-strip selector masking a stacking gap). svelte-check clean for the route, tsc clean, build 30s. Branch: `main`, commit: `bd8d382`.
- **2026-05-12** - Deployed to nfras4arcade (version `f657bf2b-dbd6-4c47-9dac-dd443a671989`). Summary: Formal retirement of Texas Hold'em poker. UI + docs only per chosen scope. `/poker` page now shows a permanent retirement notice with a link to `/casino` (replacing the prior "temporarily disabled while we investigate" message that had been live since the 2026-05-01 kill switch). `/casino` removed the greyed-out poker tile entirely (was a confusing dead row). Hub Casino card description: "Blackjack, Roulette, Baccarat & more" / "4 Games" (was 5). Server code stays dormant: `worker/poker/` lives in repo for archaeology, DO binding kept in wrangler.jsonc, `/ws/poker` still returns 503. Reversible if poker is ever re-enabled (flip `POKER_DISABLED`, restore casino entry, undo count). Chip economy untouched: blackjack/roulette/baccarat all use the same chips column on player_profiles, so historical poker winnings stay meaningful. Phase 7 (3D rendering) brief at `.omc/plans/phase7-kickoff-brief.md` is now obsolete in its current form (was poker-scoped). Branch: `main`, commit: `b3f11b6`.
- **2026-05-12** - Deployed to nfras4arcade (version `77b93cc9-478c-4f58-aa3a-2c5378b3667d`). Summary: Lobby ghost-player bug fix + mobile UI sweep, 14 files changed (301 insertions, 20 deletions). Root cause of the long-standing "players are in the lobby but don't appear until refresh" complaint: `CardRoom.loadState()` at `worker/cards/cardRoom.ts:161-166` and `CasinoRoom.loadState()` at `worker/casino/casinoRoom.ts:93-95` unconditionally marked every non-bot player `connected:false` when the Durable Object woke from hibernation. The WebSocket Hibernation API keeps sockets alive across hibernation, so this is wrong: only the player whose message woke the DO got re-marked connected, and the subsequent broadcastState told every other client they were disconnected. ImpostorRoom, SnapRoom, WavelengthRoom, LiarsDiceRoom already reconciled correctly against `ctx.getWebSockets()`; only the CardRoom + CasinoRoom hierarchies had the bug. Fix mirrors the reference pattern at `worker/impostor/room.ts:118-132`. Affected games: President, Chase the Queen, Connect 4, Coup (via CardRoom); Blackjack, Roulette, Baccarat (via CasinoRoom). Secondary fix: `play_again` / `resetToLobby` now prunes disconnected players in CardRoom (line 326-352), CasinoRoom (line 252-266), Snap (line 1015-1039), Wavelength (line 1348-1376), LiarsDice (line 957-970). Only ImpostorRoom (line 1248-1253) had this correct. LiarsDice also gains spectator promotion in resetToLobby (was missing entirely, every other game had it) and disconnectTimestamps clearing. Mobile UI sweep across 8 files: profile badge tooltips now tap-toggleable with outside-click + Escape handlers (were `:hover`-only, completely invisible on touch); profile/friends/FeedbackWidget input font-size raised to 1rem to stop iOS auto-zoom (had been 0.875rem-0.9rem); FeedbackWidget mobile trigger moved from bottom-left to bottom-right to avoid corner-about overlap; admin feedback sort buttons get 44px min-height tap target; leaderboard winners table wrapped in overflow-x:auto; liars-dice in-game gets safe-area-inset-bottom for iPhone home indicator; snap `100vw` to `100%` (scrollbar-induced desktop overflow); about highlight-grid `minmax(280px, 1fr)` to `250px` for 375px viewport. Deferred: global `button { clip-path }` change as too risky for the scope. Audits filed at `.omc/plans/lobby-audit.md` and `.omc/plans/mobile-audit.md`. Pipeline: two parallel architect agents produced punch lists, two parallel opus executors applied fixes, code-reviewer agent gave APPROVE-WITH-MINOR-FIXES (the one MEDIUM follow-up applied in same commit), test-engineer added `tests/lobby-hibernation.test.ts` (4 tests) and verified by revert-and-rerun that the test catches the regression. tsc clean, build clean. Branch: `main`, commit: `aa0029d`.
- **2026-05-10** - Deployed to nfras4arcade (version `474e8553-bca8-43c5-9fc2-fd02e0cdef68`). Summary: Hotfix to the auth bundle shipped earlier today (`72fa5ac`). Live curl test surfaced the real root cause of the original "can't register" report: Cloudflare Workers' WebCrypto runtime hard-caps PBKDF2 at 100_000 iterations and throws `Pbkdf2 failed: iteration counts above 100000 are not supported (requested N)` for anything higher. Both the original 600k (from `da8e091` security gate G1) and my just-shipped 210k were over the cap, so every register attempt 500'd. Existing users were unaffected because `verifyPassword` reads iter from the stored prefix and all stored hashes were still legacy 100k two-part format; the rehash-on-login path silently swallowed the bump failure inside an empty catch. Drop `ITERATIONS` to 100_000 (the platform ceiling, also matches the existing `LEGACY_ITERATIONS` constant) with a load-bearing WHY comment so a future security pass doesn't raise it again without first confirming the runtime cap was lifted. Verified end-to-end on `arcade.nickwfraser.dev`: register → 201 + session cookie, login with same creds → 200 + fresh session; test user cleaned out of D1 (sessions, player_profiles, users in FK-safe order). The previous deploy's `auth.ts` `data.error || data.message` fallback is what made the 500 detail visible to curl in the first place — without it I'd have gotten a generic "Registration failed" string with no diagnostic. Branch: `main`, commit: `8bbcb85`.
- **2026-05-10** - Deployed to nfras4arcade (version `ce2a0fd1-2a0b-4a13-9c6e-56991d78133f`). Summary: Auth fix bundle. PBKDF2 iterations 600k -> 210k (600k overran CF Workers' 50ms CPU budget on register, surfacing as opaque 500s; verifyPassword's prefix-aware decode keeps older 600k hashes valid). Rate limiter split into `peek`/`record` so validation errors don't burn buckets; register loosened to 100/hr per IP + 20/hr per email (was 3/hr per IP); login loosened to 30/min and now only counts FAILED attempts so a busy NAT can keep signing in. Client `auth.ts` falls back to response.message when `error` is missing, so SvelteKit framework errors surface instead of generic 'Registration failed'. .gitignore adds Obsidian junction artifacts (.obsidian/, .trash/, Trash/, *.tmp, .obsidian.vimrc) so cross-mounted vault files stay out of git. Build 51.92s, tsc clean. Branch: `main`, commit: `72fa5ac`.
- **2026-05-01** - Deployed to nfras4arcade (version `bb306fc7-9542-4d2c-8df4-a28971a865a7`). Summary: Disable poker end-to-end behind a kill switch after Durable Object usage runaway. Worker patch rejects `/ws/poker` upgrades before the DO is touched; `PokerRoom.fetch` returns 503 for all traffic and `alarm()` drains pending alarms without rescheduling so the room-expiry watchdog stops billing; `webSocketMessage` force-closes leftover hibernated sessions; `/api/{create-solo,add-bot,remove-bots}` reject `game=poker` with 503; `/poker` page short-circuits to a "temporarily disabled" notice instead of opening a socket; casino hub greys out the Poker game card (no link, disabled "Unavailable" button, desaturated, pointer-events disabled) and the entire Open Tables list (rows disabled, heading "Open Tables (unavailable)"). tsc clean, build clean. Branch: `main`, commit: `f998f6c`.
- **2026-04-30** - Deployed to nfras4arcade (version `b7867317-994b-4373-947f-e23f2558416d`). Summary: Phase 6 of the paired-device migration (UI polish + cleanup). 19 in-scope items shipped across 4 waves. Wave A1 titleText sweep across 11 non-poker game DOs (snap, president, chaseTheQueen, connectFour, coup, blackjack, roulette, baccarat, wavelength, liarsDice, impostor) plus casino type/resolver chain (CasinoPlayer interface + casinoRoom resolver line) and src/lib/types.ts shared Player interface; consistent emission pattern `titleText: p.titleText ?? null` next to titleBadgeId mirrors the Phase 5 poker reference. Wave A2 CSS-only animations P6-2 (chip slide-in 300ms via reactive bet diff and seatXY-based --from-x/--from-y CSS vars), P6-3 (dealer-button slide ~600ms with separate floating "D" token and seat math, transition on transform), P6-4 (showdown card flip 200ms rotateY with 100ms staggered delay via animation-delay from card index). All animation classes use phase6- prefix to avoid collision; all gated by prefers-reduced-motion. Wave B cleanup: deleted /api/pair/remember and /api/pair/check_remembered route files, scrubbed `remembered` state + `$effect` fetches + template conditionals + CSS in both src/routes/pair/+page.svelte and src/lib/components/pairing/PairButton.svelte (the second consumer was an architect-flagged miss in the original brief), deleted orphaned src/lib/components/pairing/deviceFingerprint.ts (zero remaining imports after Wave B), added unmount-cleanup `$effect(() => () => clearTimeout(dropoutHideTimer))` at src/routes/poker/[code]/+page.svelte (P6-17 retargeted from DropoutToast.svelte per recon - the toast component already cleans its own interval), confirmed P6-18 casino spectator promotion gate is a no-op (no canPromoteSpectator path exists in worker/casino/), P6-19 PlayerSeat min-width override deferred pending real-device QA. Wave C P6-1 paired_fold_animation: new WebSocket message type emitted via `this.broadcast(...)` (the actual cardRoom.ts:1129 method, replacing nonexistent broadcastToAll/hasPairedDevice from initial draft) immediately after fold mutation in BOTH the case 'fold' branch (worker/poker/room.ts:350) AND handlePlayerTimeout (line 878), positioned BEFORE each early-return path so the animation fires even when fold ends the hand; client-side 3-layer wiring chain in src/routes/poker/[code]/+page.svelte (`tick` import + `foldAnimation = $state<{playerId, fromSeat} | null>(null)` + async onMessage handler with `await tick()` guard at line 89 to prevent Svelte 5 reactive batching from coalescing the animation trigger and subsequent state_update into a single DOM flush) plus prop pass-through `foldAnimation={foldAnimation} onfoldAnimationDone={() => { foldAnimation = null; }}` to both TableView and MobilePokerView; views render a transient phase6-fold-arc card-back element animated from seat to muck pile center over 500ms, with `onanimationend` invoking the callback plus a 500ms setTimeout fallback inside `$effect` so reduced-motion users (animation: none) still clear foldAnimation. Pipeline: existing kickoff brief at .omc/plans/phase6-kickoff-brief.md → ralplan consensus iteration 2 (Architect + Critic both APPROVE after 9 fixes applied across 1 iteration including replacing phantom method names, specifying full client wiring chain, adding await tick() guard, expanding cleanup scope to PairButton.svelte, real-player resolver lines for 4 standalone DOs, wave restructure, ADR honesty correction, fold-animation clearing mechanism, and emit-before-early-return positioning) → autopilot Phase 2 execution (3 parallel executors for waves A1+A2+B then sequential opus executor for wave C with await tick guard correctness as the load-bearing constraint) → Phase 4 validation (architect APPROVE on functional completeness across 7 checks; security-reviewer APPROVE with confirmation that titleText is admin-curated D1-sourced and Svelte-escaped not {@html}'d, that paired_fold_animation leaks no data beyond what broadcastState already broadcasts, that device_pairings table retention is intentional per logout cleanup at api/auth/logout/+server.ts:16, and that no new D1 mutations or auth paths were introduced; code-reviewer APPROVE-WITH-MINOR-FIXES → all 5 fixes applied in a follow-up pass: $derived → $derived.by for arrow-function-bodied derived values to restore reactivity tracking [TableView lines 154/173 plus 4 template call-site removals], dead `toRemove` variable removal, dunder __foldSeat/__timeoutFoldSeat renamed to plain locals, orphaned deviceFingerprint.ts deletion, and one explanatory "what" comment removed). Final test baseline preserved exactly: 339 pass / 28 pre-existing fail in server/ (unrelated standalone Bun impostor server). Build 29.23s, tsc clean. Phase 7 (3D rendering update) gated on real-play feedback that 2D table view feels flat; kickoff brief at .omc/plans/phase7-kickoff-brief.md needs deep-interview before ralplan. Branch: `main`, commit: `019cb8c`.
- **2026-04-30** - Deployed to nfras4arcade (version `f69204ee-07d6-477e-96ca-c295858f4cff`). Summary: Phase 5 of the paired-device migration (polish + correctness invariants + tests). 16 items shipped across 5 waves: spectator buy-in atomic D1 gate via new `canPromoteSpectator` hook on CardRoom (default true; PokerRoom override does atomic `UPDATE chips = chips - ? WHERE chips >= ?` with `meta.changes` guard for insufficient funds; casual mode short-circuits with no D1 round-trip; error toast via existing `sendTo`); `scheduleBotTurn` alarm overwrite guard mirroring `scheduleDisconnectCheck` pattern so a sooner disconnect/grace alarm is never clobbered; `titleText` resolver via LEFT JOIN badges in `cosmetics.ts` (server-side; bots get null) plumbed through types.ts to PlayerSeat across TableView + MobilePokerView, fixing a pre-existing bug where opponents had no title text; surface dropout grace toast UX (new DropoutToast.svelte using Svelte 5 runes countdown via $effect interval, position fixed, single page-level mount; cardRoom emits `paired_grace_expired` inside the `if (stillEmpty)` branch after `handleDisconnect`; `paired_device_removed` payload includes `graceDurationMs` so the client uses authoritative server duration; page handlers gate on `roleParam` in `{controller,table}` so non-paired users never see false toasts); HoleCards muck-arc `'offscreen-top'` wiring (extended `isReleaseOverMuck` to commit fold when pointer release is in upper 30% of viewport for paired-mode controller throw-up gesture); hidden the "Remember 7 days" pair checkbox + state + POST + orphaned CSS (backend `device_pairings` table kept for future re-enable; endpoint deletion deferred to Phase 6); `Object.hasOwn` fix on `betPlayers.eliminated` derivation prevents flash of all-eliminated opponents for fresh spectators; removed dead `{#if !state}` block in MobilePokerView (parent already gates); PlayerSeat 150ms transition documented as intentional; `.armed-dimmed` CSS deduped to global `app.css` utility. 13 new tests in `worker/poker/__tests__/{fairness,alarmGuard,cleanup}.test.ts` + `src/routes/api/pair/__tests__/pair.test.ts`: fairness invariant asserts `union(controller, table) === both` with no field-conflict assertion (treats both `null` and empty arrays as "stripped" to catch truncated-hand divergence); alarm guard tests sooner-alarm-preserved with deterministic 200ms/5s comparison; cleanup tests device-removal accounting + auto-fold timeout pipeline; pair tests auth-mismatch 403 + happy 200 + mismatch-does-not-consume + expired. Pipeline: brief at `.omc/plans/phase5-kickoff-brief.md` (16 items P5-1 through P5-16) → ralplan consensus iter 1 ACCEPT-WITH-RESERVATIONS (5 critic clarifications applied inline) → autopilot Phase 2 execution (one opus executor across 5 waves) → Phase 4 validation (architect APPROVE on chip atomicity + fairness invariant; code-reviewer COMMENT with 1 HIGH dropout-toast partner-inference guard + 3 MED tests-and-docs all fixed inline). Wave 6 manual QA items (P5-3 bot rendering on TableView, P5-12 mobile lobby callback binding, P5-16 slow-network redirect verification) deferred to post-deploy. Phase 6 (UI polish + cleanup; 19 items, ralplan-direct ready) and Phase 7 (3D rendering update; needs deep-interview) kickoff briefs filed at `.omc/plans/phase{6,7}-kickoff-brief.md`. Build 25.69s, tsc clean, 339 pass / 28 pre-existing fail (server/ baseline maintained, +12 new tests since prior deploy). Branch: `main`, commit: `22b8fc4`.
- **2026-04-30** - Deployed to nfras4arcade (version `b84cc337-6591-45af-9af1-9e35efc7aadd`). Summary: Hotfix #1 against the just-deployed paired-device migration. Three QA bugs from real-device testing. (BLOCKER) Mobile login form submitted empty `{email:"", password:""}` body even though both fields were visibly filled, causing the server's "Email and password are required" rejection; root cause was iOS/mobile-Chrome autofill not firing the `input` events that Svelte 5's `bind:value` requires to sync the rune state. Fixed by reading values via `new FormData(form)` with the rune as fallback in both `/login` and `/register` submit handlers, plus added `name=` attributes to all auth inputs (email, password, displayName, confirmPassword) so FormData can pick them up. The bug only surfaced now because the new /pair → auth-redirect flow funnels guest scanners through /login on mobile much more often than before. (Bug 2) Guest user in a poker lobby who clicked "Pair my phone" got a generic "Pair request failed" message because PairButton rendered for everyone (no auth gate) and `/api/pair/issue` returned 401 which the client error mapping didn't handle. Fixed at two layers: (a) gated PairButton render on `$isLoggedIn` at both PC lobby (`+page.svelte:321`) and mobile lobby (`MobilePokerView` got new `isLoggedIn` prop, gate at line 191), and (b) added `status === 401` branch to PairButton's onclick handler returning "Sign in to use paired mode" plus the same branch in /pair page's `describeError` returning "Sign in to pair this device" as defense in depth. (Bug 3) Guest spectator clicking an in-progress poker room (host already playing) was stuck on "Connecting..." forever; the server-side spectator-add path at `cardRoom.ts:573-578` correctly emits `joined` with `isSpectator: true, state: getStateFor(playerId, role)`, but the client dispatcher overwrote `gameState` even when `msg.state` was null/undefined for some edge cases, leaving the parent `{#if !state}` loading gate triggered. Fixed by gating `gameState.set(msg.state)` on `msg.state` being truthy, logging a warn + re-issuing `socket.joinRoom(code)` after 500ms if `joined` arrives without state, and also unblocking the loading gate on `state_update` so a state-only update can recover from a missed `joined`. Investigation captured at `.omc/state/phase4-spectator-bug.md` per the document-then-fix rule. Build 27.00s, tsc clean, 327 pass / 28 pre-existing fail. Branch: `main`, commit: `4a71444`.
