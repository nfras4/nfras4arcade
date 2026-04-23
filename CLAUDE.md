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
- **2026-04-23** - Deployed to nfras4arcade. Summary: Add cosmetic loadout system (frames, emblems, equipped titles, /customize menu). Migration 0018 adds frame_id/emblem_id/title_badge_id on player_equipped + seeds 3 frames + 5 emblems. New PlayerTile dumb component (3 sizes x 2 orientations, 9-slice border-image). Cosmetic payload (frameSvg/emblemSvg/nameColour/titleBadgeId) wired through all 7 DO room classes with per-DO cache. Proof-of-concept card back + table felt rendering in Poker. COSMETIC_TILES_ENABLED feature flag parked in wrangler vars. Branch: `main`, commit: `f0003f3`.
- **2026-04-23** - Deployed to nfras4arcade. Summary: Add Liar's Dice party game (2-6 players) with bots, ones-wild variant, Silver Tongue badge (b_liars_dice_win), dedicated leaderboard (/api/leaderboard/liars-dice), and strict wikiHow common-hand rules (face and count non-decreasing, at least one strict increase). Migration 0017 adds liars_dice_wins column + badge row. 26 bun:test assertions. Branch: `main`, commit: `5b5b05f`.
- **2026-04-20** - Deployed to nfras4arcade. Summary: Fix Ella's World render crash — route every ZONES[] lookup in dungeon +page.svelte and combat.svelte.ts through new getZone(idx) helper in zones.ts, since ELLA_ZONE lives at id 50 and is never appended to ZONES[]. Branch: `main`, commit: `9f9655f`.
- **2026-04-20** - Deployed to nfras4arcade. Summary: Add arcade chip leaderboard on landing page (TOP CHIPS + BIGGEST WINS). Migration 0015 adds biggest_win + biggest_win_game on player_profiles; tracked per-round at settlement for poker/blackjack/roulette/baccarat and on every positive credit in snap/impostor/cards/slots. New /api/leaderboard/chips endpoint. Branch: `main`, commit: `27f83aa`.
- **2026-04-17** - Deployed to nfras4arcade. Summary: Tune slots paytable to 106.7% RTP (cherry 2/7/20, lemon 4/11/26, orange 7/16/40, gem 11/27/65, star 13/40/97); remove RTP display from slots UI. Branch: `main`, commit: `a9fdc74`.
- **2026-04-17** - Deployed to nfras4arcade. Summary: Add Item Manager modal for dungeon loot with sort/filter/multi-select/pagination; boss uniques sellable (tier-5 rate) with confirm gate; compact 5-item preview on LOOT tab. Branch: `main`, commit: `5c3ee57`.
- **2026-04-17** - Deployed to nfras4arcade. Summary: Add dungeon prestige system, HR Department component, and combat tuning (bosses, enemies, player, timers). Branch: `main`, commit: `5f2d666`.
- **2026-04-16** - Deployed to nfras4arcade. Summary: Add who's-voted checklist to impostor voting phase (live ☑/☐ per player); fix &#10003;/&#10007; HTML entities rendering as literal text in Svelte expressions. Branch: `main`, commit: `83c4597`.
- **2026-04-16** - Deployed to nfras4arcade. Summary: Add farm mode toggle to dungeon — checkbox in zone bar loops stages 1-9, skips miniboss/boss, progress bar scales to 9-stage range, persists via localStorage. Branch: `main`, commit: `1c97b21`.
- **2026-04-16** - Deployed to nfras4arcade. Summary: Fix boss special timer one-shot risk — lower getBossSpecialCap (0.65→0.45/0.72→0.50/etc), wound rate 0.70→0.45, 800ms regular-hit mutex after specials, big-hit 2.0x→1.6x, dunk description mismatch fixed. Branch: `main`, commit: `d9e7c27`.
