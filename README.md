# EarthQuest

A narrative role-playing game client built as a Turborepo monorepo. One set of game-state hooks, API
clients and types is shared by a Next.js web app and a React Native (Expo) mobile app.

This is a working prototype of the architecture, not a finished game. See [Status](#status) for exactly
what has and has not been verified.

## What's in it

| Path | What it is |
|---|---|
| `apps/web` | Next.js 14 app: NPC chat (`/`), inventory (`/inventory`), world map (`/world`), multiplayer party (`/party`) |
| `apps/mobile` | Expo / React Native app: NPC chat only, using the same hooks as the web app |
| `apps/server` | Node server: SSE dialogue endpoint, RAG over pgvector, party WebSocket |
| `packages/types` | Shared TypeScript types, including the WebSocket and SSE message shapes |
| `packages/api-client` | Typed client; parses SSE by hand so it also works in React Native (no `EventSource`) |
| `packages/game-state` | Shared hooks and pure logic: chat reducer, A* pathfinding, party prediction and reconciliation |
| `infra/cloudfront` | Terraform for an S3 + CloudFront asset origin (**not applied or validated**) |
| `scripts/check-bundle-budget.mjs` | Fails CI when a route's gzipped first-load JS exceeds `budgets.json` |

## Features

**AI NPC dialogue.** The server streams Claude's reply to the client over Server-Sent Events. Before each
reply it retrieves the nearest lore chunks (global) and the nearest past exchanges (that player and NPC
only) from Postgres with pgvector, and puts them in the system prompt. Embeddings come from
`all-MiniLM-L6-v2` running locally via transformers.js, so no embedding API key is needed. Without
`ANTHROPIC_API_KEY` the server streams a mock reply instead, still showing how much context it retrieved.
If the database is down, the NPC replies without context rather than failing.

**Performance work.** The inventory and world-map screens each have a switch between a naive and an
optimized version so the difference can be measured. Pathfinding runs in a Web Worker. Initial JS is kept
in check by Next's route-level splitting, a preloaded sprite sheet, and a bundle budget enforced in CI.

**Multiplayer party.** The server holds authoritative state with a version number. Clients apply moves
optimistically and keep a queue of unacknowledged moves. The displayed state is always the latest server
snapshot with that queue replayed on top. Moves are numbered per player, so the server can drop duplicates
and the client can tell which of its moves were processed. The same `checkMove` function validates moves
on both sides. Handled races: two players moving onto one cell (first to arrive wins, the loser rolls
back), stale or duplicate snapshots (ignored), and a rejected move invalidating the moves queued after it.

## Getting started

Requirements: Node 22.9+, pnpm 9 (`npm i -g pnpm@9.15.0`), Docker.

```bash
pnpm install
cp .env.example .env            # optional: add ANTHROPIC_API_KEY for real Claude replies
docker compose up -d            # Postgres + pgvector on localhost:5440
pnpm --filter @earthquest/server run setup   # create tables and ingest the seed lore
```

Use `run setup`, not `pnpm setup`: the latter is a built-in pnpm command that edits your shell/PATH config.

The first run downloads the embedding model (about 25 MB) and caches it.

Run each app in its own terminal:

```bash
pnpm --filter @earthquest/server dev    # http://localhost:4000
pnpm --filter @earthquest/web dev       # http://localhost:3000
pnpm --filter @earthquest/mobile dev    # Expo dev server
```

Open the web app at `/`, `/inventory`, `/world` and `/party`. For multiplayer, open `/party?player=alice`
and `/party?player=bob` in two tabs. Add `&latency=300` to simulate a slow connection.

Mobile: the app defaults to `http://10.0.2.2:4000`, which is how an Android **emulator** reaches your
machine. On a physical device set `EXPO_PUBLIC_API_URL` to your computer's LAN address.

### Commands

```bash
pnpm typecheck      # all packages
pnpm test           # all packages
pnpm build          # production builds
node scripts/check-bundle-budget.mjs apps/web/.next budgets.json   # after a web build
```

The server's RAG tests need `docker compose up -d`. Locally they skip themselves when the database is
unreachable; in CI (`CI` set) they fail instead. `DATABASE_URL` is declared in `turbo.json` so Turborepo
forwards it to the tests.

### Configuration

| Variable | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | server | Enables real Claude replies; otherwise a mock is used |
| `ANTHROPIC_MODEL` | server | Model ID (default `claude-sonnet-5-5`) |
| `DATABASE_URL` | server | Postgres connection (default points at the compose database) |
| `SENTRY_DSN` | server | Enables Sentry error reporting |
| `NEXT_PUBLIC_SENTRY_DSN` | web | Enables browser Sentry; the SDK is loaded lazily and only when set |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` | web | Server HTTP and WebSocket URLs |
| `EXPO_PUBLIC_API_URL` | mobile | Server URL for the mobile app |
| `CDN_URL` | web (build time) | Loads `/_next/static` from a CDN |

## Measured results

These are single-machine measurements from this repo's own code, not claims about any other project.

**Inventory re-renders**: equipping one item in a 500-row list (jsdom test, `InventoryList.test.tsx`)

| Mode | Rows re-rendered |
|---|---|
| Naive | 500 |
| Memoized | 1 |

**World map pathfinding**: a party of 12 each searching across a 1000x1000 map, real Chrome, 4 runs each

| | Main thread | Web Worker |
|---|---|---|
| Click event duration | 736 to 1240 ms | 16 ms or less |
| Worst frame gap | 683 to 1166 ms | 17 to 18 ms |
| Search time | about 680 to 1160 ms | about 670 to 770 ms |

The worker does not speed up the search; it keeps it off the UI thread, at a cost of roughly 20 to 25 ms of
messaging. A single search on a 200x200 map takes about 6 ms, so the worker only matters for large worlds or
many simultaneous searches.

**Bundle size**: gzipped first-load JS is 86 to 90 kB per route, against a 96 kB budget.

**Multiplayer**: with 500 ms simulated latency each way, a keypress moved the player immediately and the
queue drained after the round trip. In a 220-keypress run by two players, both views ended identical with
nothing pending.

## Status

**Verified**
- All 6 packages typecheck; 30 tests pass (21 game-state, 7 server, 2 web).
- The GitHub Actions workflow passes on `main` (install, typecheck, tests, web build, bundle budget). It runs the
  RAG integration tests against a pgvector service container, and in CI they fail rather than skip if the
  database is unreachable.
- Web production build works; the budget check passes and fails correctly (including for routes without a budget).
- NPC dialogue streams end to end in a browser, with retrieval: both the web app and the mobile app's code.
- Party movement converges between two real browser pages; contested cells and duplicate or spoofed
  messages are covered by WebSocket tests.
- The mobile app bundles for Android with Metro (552 modules) and runs via Expo's web target.

**Not verified**
- **The mobile app has not run on an Android emulator, iOS simulator or physical device**, and it only has the
  chat screen. There is no inventory, map or party screen on mobile yet.
- **Real Claude replies**: only the mock path has been run, so whether Claude stays consistent with the lore is untested.
- **AWS**: `infra/cloudfront/main.tf` has never been validated or applied, and nothing yet uploads build output to S3.
- **Page-speed metrics**: LCP and INP were not measured on a deployed site. The Chrome numbers above are Event
  Timing durations from a local run.
- Party state is a single in-memory room: no persistence, no multiple parties, no auth. Player IDs are
  self-declared.

## Known limitations

- On reconnect the client discards its queued moves and starts from a fresh server snapshot.
- The world is generated from a fixed seed shared by server and clients; it is not real game data.
- The lore is a small seed set in `apps/server/src/rag/lore.ts`.
