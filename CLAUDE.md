# nfras4arcade - Multiplayer Party Games Platform

## Project Overview
nfras4arcade is a multi-game party platform. The first game is Impostor, a real-time multiplayer browser game where one player is secretly the "impostor" who doesn't know the secret word but gets a vague hint. Players take turns giving clues, then vote on who the impostor is.

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
  routes/
    +layout.svelte          # Global nav + FeedbackWidget
    +page.svelte            # nfras4arcade hub (game cards, guest banner)
    impostor/
      +page.svelte          # Impostor lobby (create/join room)
      [code]/+page.svelte   # Main game UI (all phases incl. post-game)
    president/              # President card game
    chase-the-queen/        # Chase the Queen card game
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
    cardRoom.ts             # Base CardRoom DO (abstract, shared card game logic)
    president.ts            # PresidentRoom DO
    chaseTheQueen.ts        # ChaseTheQueenRoom DO
  bots/                     # Bot player AI for solo/card games
  index.ts                  # Placeholder (overwritten by adapter-cloudflare)
scripts/
  patch-worker.ts           # Post-build: patches worker with DO export + WS upgrade + guest auth
migrations/
  0001_initial.sql          # D1 schema (users, sessions, profiles, badges, game_sessions)
  0002_lone_monkey_badge.sql # Badge migration
  0003_feedback.sql         # Feedback table for in-game feedback system
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
