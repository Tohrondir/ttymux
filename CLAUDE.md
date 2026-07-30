# ttymux — root architecture guide

This file orients an agent (or a new contributor) working anywhere in this
repo. Package-specific detail lives in each package's own `CLAUDE.md`:
`packages/shared/CLAUDE.md`, `packages/backend/CLAUDE.md`,
`packages/frontend/CLAUDE.md`. Read this one first, then the one for
whichever package you're actually touching.

## What this is

A web dashboard for managing serial-console connections from a single
browser: point it at a host with USB serial devices, it auto-discovers every
port, and gives anyone on the team a live shared terminal per port instead of
SSHing in to run `screen`/`minicom`/`picocom`. See `README.md` for the
user-facing feature list and `docs/config-reference.md` for the config
schema — both are accurate and worth reading before making product decisions
(e.g. "should this be a new feature or a variant of an existing one").

## Repo layout

npm workspaces monorepo, three packages:

- `packages/shared` — the TypeScript contract (REST + WebSocket message
  shapes, config shape, domain types) that both other packages import.
  **This is the single source of truth for the wire protocol.** If a change
  crosses the wire (new message type, new REST field, new config key), start
  here and let TypeScript's compile errors guide you to every place in
  backend/frontend that needs updating.
- `packages/backend` — Node/Fastify server: port discovery, serial I/O,
  session/write-token arbitration, REST + WebSocket transport, disk logging,
  auth, config.
- `packages/frontend` — React/Vite dashboard + xterm.js console UI.

Backend and frontend never share code directly with each other — only
through `packages/shared`. If you catch yourself hand-duplicating a type or
a message shape instead of importing it from shared, stop and fix that.

## Build, test, lint

```sh
npm install
npm run dev         # backend :9000 + frontend dev server, both live-reloading
npm run build        # build all three packages, in dependency order
npm run lint
npm run typecheck
npm test             # backend only right now — see "Test coverage" below
```

Root scripts fan out to every workspace via `--workspaces --if-present`.
`npm run build` matters more than in a typical repo: `packages/shared` and
`packages/backend` both go through `tsc -b` (project references), and the
frontend's own `npm run build` is `tsc --noEmit && vite build` — so a
frontend-only source edit still needs `npm run build` (not just `vite build`)
to catch type errors before you consider something done.

CI (`.github/workflows/ci.yml`) runs exactly `npm ci && npm run build && npm
run lint && npm run typecheck && npm test` on Node 20.x and 22.x. Run the
same four commands locally before considering a change finished — this
project doesn't have a pre-commit hook enforcing it, so it's on you.

**Test coverage is backend-only.** `packages/backend/test/*.test.ts` (vitest)
covers `SessionHub`, `SerialManager` (reconnect/backoff/scrollback-seeding),
`LogWriter`, and backoff math, using `test/mocks/MockSerialPort.ts` so tests
never touch real hardware. `packages/frontend` has **no test runner
configured at all** — verification there is manual: run the app for real
(see "Live-verifying a change" below) or, for logic with zero DOM
dependency (e.g. `LineHighlighter`), a throwaway `npx tsx script.mjs` against
the `.ts` file directly works fine without any project setup.

## Live-verifying a change

There's no real serial hardware available in most dev/agent environments.
The established pattern for exercising the full stack anyway:

1. Point the backend at a config with `discovery.includeLegacyPorts: true`.
   This makes it enumerate Linux's virtual `/dev/ttyS0`–`/dev/ttyS31` UART
   devices, which exist on most Linux boxes/VMs/containers even with no
   physical hardware attached. Most of them fail to open (`I/O error setting
   custom baud rate`) and show as `status: 'error'`, but a couple (in this
   environment, historically `/dev/ttyS4`) open successfully and report
   `status: 'online'` — that's enough to drive the full attach/session/log
   pipeline even though nothing ever writes real bytes to it.
2. Run the built backend directly against that config on a scratch port:
   `node packages/backend/dist/index.js --config ./scratch-config.yaml --port 9999`
   (remember to `npm run build` first — running against stale `dist/` after
   a source edit is a real, easy-to-make mistake that produces confusing
   "why doesn't my change show up" results).
3. Drive it with Playwright (`playwright-core`, resolved via a
   `node_modules` symlink into whichever npx cache dir has it installed, if
   it's not otherwise available) to click through the real UI, or hit the
   REST/WS endpoints directly with `curl`/a small script.
4. To exercise **live serial data** flowing through the highlighter/session
   pipeline (as opposed to REST-only checks), seed a port's on-disk log file
   directly and either let scrollback-rehydration-on-startup pick it up, or
   send scrollback/output over the WS by hand — there's no way to make the
   fake `/dev/ttyS*` devices actually emit bytes, since nothing is wired to
   their RX side.
5. **Always tear down the background server process afterward** and remove
   any debug-only files/harnesses you added for the verification (see "Debug
   harnesses" in `packages/frontend/CLAUDE.md` for the frontend-specific
   version of this).

Don't claim a UI or protocol change works without having actually exercised
it this way — type-checking and unit tests verify code correctness, not
feature correctness.

## Cross-cutting invariants

These hold across package boundaries; breaking one usually causes a subtle,
hard-to-notice bug rather than a compile error.

- **The wire protocol lives in `packages/shared` only.** Backend and
  frontend both import from it; neither re-declares a message shape locally.
- **Double-broadcast on any `PortInfo`-affecting mutation.** There are two
  independent WS channels: per-console (`SessionHub.broadcastStatus`, only
  reaches viewers of that one console) and dashboard-wide
  (`EventsBroadcaster.broadcast`, reaches the sidebar/port-list view). Any
  code path that changes something reflected in `PortInfo` (a rename, a
  status change, a settings change) needs to hit both, or some open view
  goes stale. `packages/backend/src/transport/restRoutes.ts`'s `PATCH
  /api/ports/:id` handler is the reference example to copy.
- **`null` clears a field back to its auto-discovered/default value;
  `undefined`/omitted leaves it unchanged.** This tri-state convention
  recurs everywhere a value can be overridden: `UpdatePortRequest.name`/
  `group`, `PortOverridesStore.applyField`, the rename-to-empty-string UI
  path (which sends `null`, not `''`), `TokenPrompt`'s empty-input-clears
  behavior. Keep new override-style fields consistent with this rather than
  inventing a different "clear" sentinel.
- **Two persisted, on-disk-by-default data sets, both bind-mounted in
  Docker:** `./logs` (raw per-port serial output, `LogWriter`, rotated) and
  `./data` (currently just `port-overrides.json`, `PortOverridesStore`).
  Both are gitignored and survive `docker compose up -d --build` (rebuilding
  the image never touches host bind-mounted directories) as long as the
  compose command is always run from the same host directory. If a user
  reports "my data disappeared after an update," check working-directory
  consistency and any `git clean`/volume-removal step in their update
  script before assuming ttymux itself lost something — these directories
  are deliberately designed to survive routine updates.
- **Config schema is hand-duplicated, not derived.** `packages/backend/src/
  config/schema.ts` (zod, runtime validation) and `packages/shared/src/
  config.ts` (TS interfaces, compile-time shape) describe the same YAML
  config shape independently, with no code link forcing them to match.
  Adding a config field means updating **both**, plus
  `docs/config-reference.md` and `config.example.yaml`. Nothing will fail to
  compile if you forget one of these; you have to remember by hand.
- **Auth: loopback always bypasses whatever `auth.mode` is configured.**
  This is *the* mechanism that makes the zero-config, no-auth default safe
  (`packages/backend/src/auth/AuthProvider.ts`'s `isLoopbackAddress` +
  `LoopbackBypassAuthProvider` wrapper). If a reverse-proxy setup or a change
  to how `remoteAddress` gets populated ever causes non-loopback traffic to
  be reported as loopback, that's a real security regression — treat any
  change touching `request.ip`/how addresses are derived as security-
  sensitive.
- **Port ids are computed once and then baked into user-facing artifacts.**
  `packages/backend/src/registry/discovery.ts`'s `computeStableId` decides
  each port's id (preferring `/dev/serial/by-id`, then `by-path`, then USB
  serial number, then USB location, then PnP id, then a raw-path fallback).
  That id becomes both the YAML `ports:` config key *and* the on-disk log
  filename (slugified). Changing the id-computation priority or slug format
  breaks continuity with existing users' config files and log history — treat
  this function as something with a real backward-compatibility cost to
  change, not just an implementation detail.

## Style and workflow conventions established in this repo

These came from explicit, repeated user feedback across many prior sessions
— follow them without being asked again:

- **Commit messages: short and to the point, no em dashes, no
  `Co-Authored-By` trailer.** One line is usually enough; this project does
  not want the standard Claude Code commit template.
- **No em dashes in README/docs/comments either** (a general written-style
  preference for this project, not just commits).
- **Don't abbreviate user-facing labels for space** (e.g. "Free-for-all" was
  explicitly reverted after being shortened to "FFA" — ask before
  abbreviating anything the user sees, don't just do it to save pixels).
- **Verify features live** (see "Live-verifying a change" above) before
  reporting a UI/protocol change as done, using the Playwright-against-a-
  real-running-instance pattern this repo has used throughout its history.
- **When something breaks that you just "fixed," re-derive the fix from
  first principles instead of tuning a knob again.** The highlighting
  latency bug in `packages/frontend/src/utils/LineHighlighter.ts` was
  "fixed" three times in a row by adjusting a timeout value before the
  actual root cause (chunk-splitting across separate WS messages, not
  timing-sensitivity per se) was properly diagnosed and fixed — see that
  file's `CLAUDE.md` entry and its own doc comments for the full story.
  Don't repeat that pattern: when a fix doesn't hold, write a real
  reproduction (a script, a test, an isolated harness) before changing
  numbers again.
