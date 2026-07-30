# packages/backend — server architecture

Read `../../CLAUDE.md` first for overall repo context and cross-cutting
invariants (double-broadcast, `null`-clears convention, loopback-auth-bypass,
port-id persistence). This file covers the backend's internal structure.

## Bootstrap / entry points

- `src/index.ts` — CLI entry (`commander`), parses `--config`/`--port`/
  `--host`, calls `loadConfig` then `startServer`. Also hosts the
  `hash-password` subcommand used to generate scrypt hashes for
  `auth.mode: basic` config (see `src/auth/password.ts`).
- `src/server.ts` — `startServer(config)`: constructs every subsystem
  (`PortRegistry`, `LogWriter`, `SerialManager`, `SessionHub`,
  `AuthProvider`, `EventsBroadcaster`, `PortOverridesStore`), wires their
  events together, registers REST + WS routes, serves the built frontend
  (`packages/frontend/dist`) as static files with an SPA fallback for
  non-`/api`/`/ws` 404s. **Construction order matters**: `LogWriter` is
  constructed *before* `SerialManager` specifically so `SerialManager`'s
  `scrollbackSeed` option can close over `logWriter.readTail(...)` — don't
  reorder these without checking that dependency.
- `TransportDeps` (`src/transport/types.ts`) is the dependency-injection bag
  threaded into every route-registration function. Any new subsystem that
  transport code needs to reach must be added here and to the `deps` object
  built in `server.ts`.

## Data flow, end to end

```
PortRegistry (polls listRawPorts every 2s)
  --'added'/'removed'-->  server.ts wiring
                            --> SerialManager.handlePortAdded/handlePortRemoved
                            --> broadcaster.broadcast (dashboard-wide)

SerialManager (owns one connection per port, auto-opens, reconnects w/ backoff)
  --'data'-->  server.ts wiring  --> LogWriter.append (disk)
                                  --> SessionHub.fanOutData (live viewers)
  --'status'-->  server.ts wiring --> sessionHub.broadcastStatus (per-console)
                                   --> broadcaster.broadcast (dashboard-wide)

SessionHub (per-console viewer tracking + write-token arbitration)
  --'changed'--> server.ts wiring --> broadcaster.broadcast (dashboard-wide)

wsConsole.ts (/ws/console/:portId) <---> one browser tab
wsEvents.ts  (/ws/events)          <---> dashboard/sidebar view
restRoutes.ts (/api/*)             <---> REST clients (rename, log download, etc.)
```

The two WS routes are deliberately separate channels for two different
audiences: `/ws/console/:portId` is a live per-console session (I/O,
write-token requests); `/ws/events` is dashboard-wide (port list/status,
doesn't care about any particular console's viewer/writer state). Anything
that changes a port's externally-visible state needs to reach both —
that's the double-broadcast invariant from the root `CLAUDE.md`.

## `src/registry/` — port discovery

- `discovery.ts::listRawPorts` wraps `SerialPort.list()`. By default filters
  out Linux's `/dev/ttyS0`–`/dev/ttyS31` legacy UART ports
  (`isLikelyPhantomLegacyPort`) since almost no one has real hardware there;
  `discovery.includeLegacyPorts: true` in config disables that filter — this
  is also the trick used to get *something* to enumerate/open successfully
  for manual testing/live-verification when there's no real serial hardware
  in the environment (see root `CLAUDE.md`'s "Live-verifying a change").
- `discovery.ts::computeStableId` picks the most stable available id, in
  priority order: `/dev/serial/by-id` symlink → `/dev/serial/by-path`
  symlink → USB serial number (`usb-<vendor>_<model>_<serial>`) → USB
  location (`usb-loc-...`) → PnP id (`pnp-...`) → raw path fallback
  (`path:<path>`, with `stableId: false`). By-id/by-path lookup is
  Linux-only; other platforms fall through to USB-serial-number-or-path.
  **This id gets slugified and used as both the YAML `ports:` config key and
  the on-disk log filename** — see root `CLAUDE.md`'s note on why this
  function has real backward-compat weight. `packages/shared/src/ports.ts`'s
  doc comment describing this priority list is a simplified/stale subset;
  don't treat it as the full spec, `computeStableId` here is authoritative.
- `PortRegistry` polls every 2000ms (not OS hotplug events — deliberate,
  documented in-file, for cross-platform simplicity) and diffs against its
  last-known `Map<PortId, PortDescriptor>`, emitting `'added'` (covers both
  genuinely-new ids *and* an existing id whose `path` changed, e.g. same
  stable id but OS reassigned `/dev/ttyUSB1`→`/dev/ttyUSB2`) and `'removed'`.
  Consumers should treat `'added'` as "(re)appeared or changed," not
  strictly "brand new."

## `src/serial/` — connection management

- `SerialManager` owns exactly one connection per port id, auto-opens as
  soon as a port is discovered (so scrollback/logging accumulate even before
  any viewer attaches), and reconnects with jittered exponential backoff
  (`backoff.ts`, injectable `random` for deterministic tests) on unexpected
  drops.
- **Scrollback**: each port has a `RingBuffer` (fixed-capacity byte ring,
  `scrollback.bytes` config, default 200_000) holding recent output for
  instant replay to a newly-attached viewer (`getScrollback`).
- **Scrollback rehydration on startup**: `SerialManager` accepts an optional
  `scrollbackSeed(portId) => Buffer` callback (wired in `server.ts` to
  `logWriter.readTail(portId, config.scrollback.bytes)`), called exactly
  once per port the first time it's ever seen (not on reconnects of an
  already-known port — checked via `!managed` in `handlePortAdded`). This is
  what makes reopening a console after a process/container restart show
  recent history immediately instead of starting blank — the on-disk log
  was never actually lost, the in-memory ring buffer just used to start
  empty on every restart. If you touch `handlePortAdded`, preserve the
  "only seed on first-ever-attach" check; seeding again on every reconnect
  would duplicate history in the ring buffer.
- `SerialPortLike` is a thin interface abstraction over the real
  `serialport` library so `SerialManager` can be tested against
  `test/mocks/MockSerialPort.ts` without touching hardware.
  `createRealSerialPort` always constructs with `autoOpen: false` —
  `SerialManager` explicitly controls when opens happen (its reconnect/
  backoff logic depends on this).

## `src/session/SessionHub.ts` — viewer tracking + write-token arbitration

This is the trickiest piece of backend logic and the one most likely to
regress subtly if changed without re-reading it fully. Per-console state:
set of attached viewers, and a `WriteTokenState` (`holder`, `holderName?`,
`since?`, `freeForAll`).

Rules, as currently implemented (see `test/sessionHub.test.ts` for the
authoritative behavioral spec — every rule below has a matching test):

- **Auto-claim on attach**: whoever attaches to a console whose write token
  is currently unclaimed (`holder === null`) and not in free-for-all mode
  automatically becomes the writer. This is keyed off **the token being
  unclaimed**, not off "am I the first viewer" — a console can still be
  unclaimed after several viewers have already attached, if all of them
  were lurkers (see below). Getting this distinction backwards (checking
  viewer count instead of token state) was a real regression once: a
  non-lurker joining after a lurker had no one to auto-claim from because
  they weren't "first."
- **Lurker mode**: `attach(portId, client, { lurker: true })` skips the
  auto-claim step entirely for that specific client — they attach as a pure
  observer. They can still manually call `requestControl` later; lurker-ness
  only affects the automatic behavior on attach, it's not a permanent
  read-only restriction. The flag is per-connection (sent as a `?lurker=true`
  WS query param, see `wsConsole.ts`), not persisted server-side beyond the
  connection's lifetime.
- **`requestControl` always succeeds**, taking over from whoever currently
  holds it — there's no "only if free" gate and no requirement for the
  previous holder to release first. This was an explicit product decision
  (removing an earlier "release control" step entirely) — don't reintroduce
  a denial path for `requestControl` without checking whether that's
  actually wanted.
- **`releaseControl`** only does anything if the caller is the current
  holder (no-op otherwise) — goes back to unclaimed (`holder: null`), *not*
  auto-reassigned to another viewer.
- **Detach auto-releases** if the disconnecting client was the holder.
- **`canWrite`** returns true if `freeForAll` is on, or if the caller
  currently holds the token — this is the single gate checked before
  forwarding `input` to the serial device and before allowing
  `changeSettings`.
- **`free-for-all`** is a per-console toggle (`setFreeForAll`), independent
  of who holds the token; turning it on doesn't clear the holder, it just
  makes `canWrite` return true for everyone regardless.
- Every mutating method broadcasts full write-token + viewer-list state to
  every attached viewer (not a diff) — deliberate, so a newly-attached
  viewer gets authoritative state on `attach()` without needing to infer it
  from a partial summary.

## `src/logging/LogWriter.ts` — disk logging + rotation

- Per-port append-only log file (`<slug>.log`), size-based rotation
  (`logging.maxSizeMb`) up to `logging.maxFiles` rotated generations
  (`.log.1`, `.log.2`, ...), oldest deleted once the cap is exceeded.
- `listExistingLogFiles` returns paths oldest-first, current-file-last —
  every other method that reads log history (`createLogReadStream`,
  `readTail`) depends on this ordering being correct.
- `createLogReadStream` streams all existing files concatenated in
  chronological order via an async generator — backs the "Download log"
  button (`GET /api/ports/:id/log` in `restRoutes.ts`), which sets
  `Content-Disposition: attachment`.
- `readTail(portId, maxBytes)` reads only the tail bytes needed (walking
  backwards from the newest file, using `openSync`/`readSync` with an
  offset rather than loading whole files into memory) — this is what feeds
  `SerialManager`'s scrollback-rehydration-on-startup. If you touch this,
  keep the "don't read more than necessary" property; log files can be
  many MB and this gets called once per port at every process start.
- Log filenames use the same slugified port id as the config `ports:` key
  (`sanitizeFileName` here mirrors `discovery.ts`'s slug logic conceptually,
  though it's a separate small implementation — keep them producing
  equivalent output if either changes).

## `src/auth/` — authentication

- Three modes (`none`/`token`/`basic`), all wrapped in
  `LoopbackBypassAuthProvider` — **loopback traffic always bypasses auth
  regardless of configured mode**, see root `CLAUDE.md`'s security note.
  `isLoopbackAddress` checks `127.0.0.1`, `::1`, `::ffff:127.0.0.1`, or
  anything starting with `127.`.
- Token mode checks both the `Authorization: Bearer` header (REST) and a
  `?token=` query param (WS handshakes from a browser can't set custom
  headers) — every WS route (`wsConsole.ts`, `wsEvents.ts`) has to check
  both for this reason.
- `createAuthProvider` fails fast at startup if `mode: token` has no
  `token` configured, or `mode: basic` has no `users` — this validation
  lives here, not in the zod schema.
- Password hashing (`password.ts`) is **scrypt**, format
  `scrypt:<saltHex>:<hashHex>`, verified via `timingSafeEqual`. Note: token
  comparison in `AuthProvider.ts` is a plain `===`, **not** constant-time —
  an inconsistency with the password path worth being aware of if hardening
  auth further. `packages/shared/src/auth.ts`'s doc comment incorrectly says
  "bcrypt" for the password hash — fix that comment if you're touching
  either file, it's stale and could mislead someone into generating the
  wrong hash format.

## `src/config/` — config loading and overrides

- `loadConfig(explicitPath?)` resolution order: explicit path (throws if
  missing) → `TTYMUX_CONFIG` env var → `ttymux.config.yaml`/`.yml` in cwd →
  built-in defaults (silently, if neither of the last two exist — this is
  the "zero-config" path, not an error). Only the **explicit** path source
  throws on a missing file; the other two sources fail open to defaults.
  Merging config sections onto defaults is a shallow per-section spread, not
  a deep merge — fine while every section is flat; revisit if a nested
  object field is ever added.
- `schema.ts` (zod) validates the parsed YAML at runtime and is **hand-kept
  in sync with `packages/shared/src/config.ts`'s TS interfaces, with no
  derivation link**. New config field → update both, plus
  `docs/config-reference.md` and `config.example.yaml`.
- `PortOverridesStore` — two-layer resolution: config-file overrides
  (immutable at runtime) merged with a runtime JSON file
  (`<persistence.directory>/port-overrides.json`), runtime layer winning
  per-field. This split exists specifically so a UI rename never rewrites a
  hand-edited `config.yaml`. `applyField`'s tri-state semantics
  (`undefined` = unchanged, `null`/`''` = clear back to auto-discovered,
  anything else = set) backs the `UpdatePortRequest` REST contract — see
  root `CLAUDE.md`'s `null`-clears convention. `load()` silently swallows
  JSON parse errors and returns `{}` on a corrupted overrides file — no
  error surfaced, just silent loss of persisted overrides on the next
  write; worth hardening if this becomes a real support issue.

## `src/transport/` — REST + WebSocket routes

- `portInfo.ts::buildPortInfo`/`listAllPortInfo` are the assembly point that
  merges `SerialManager` (status/settings), `SessionHub` (write-token/
  viewer-count), and `PortOverridesStore` (name/group/hidden) into the wire
  `PortInfo` shape used by both REST and WS. **`listAllPortInfo` filters out
  `hidden` ports; `buildPortInfo` (single-port lookup) does not** —
  intentional (hidden is a declutter option, not access control, per
  `docs/config-reference.md`), but a hidden port is still fully reachable by
  id via `GET /api/ports/:id` and its console WS. Don't "fix" this
  asymmetry without checking that's actually wanted.
- `restRoutes.ts` — all `/api/*` routes. The `PATCH /api/ports/:id` handler
  is the reference example for the double-broadcast invariant (calls both
  `sessionHub.broadcastStatus` and `broadcaster.broadcast`) — copy that
  pattern for any new mutating endpoint. `VERSION` here is a hardcoded
  string, not read from `package.json` — bump it by hand if it matters.
- `wsConsole.ts` — `/ws/console/:portId`. `clientId` is **client-supplied**
  (via `?clientId=` query param, generated client-side once and kept in a
  ref) rather than server-generated, specifically so a browser tab can
  recognize its own entries in `viewers`/`writeToken` without a round trip.
  `?lurker=true` maps straight to `SessionHub.attach`'s lurker option.
  `input` messages are silently dropped (no feedback) if the sender doesn't
  hold the write token — deliberate, to avoid spamming a `controlDenied`
  message on every rejected keystroke; `changeSettings` *does* send
  `controlDenied` back, since that's a deliberate one-off action rather than
  continuous typing. Malformed JSON gets an `{type:'error'}` reply, not a
  socket close.
- `wsEvents.ts` — `/ws/events`, the dashboard-wide channel, backed by
  `EventsBroadcaster` (a plain `Set<WebSocket>` fan-out, no backpressure
  handling).
- Both WS routes close with app-defined codes on auth/lookup failure:
  `4401` (unauthorized), `4404` (not found) — any frontend reconnect logic
  needs to treat `4401` as non-retryable (bad token), not a transient drop.

## Testing conventions

- Backend tests mock the serial layer via `test/mocks/MockSerialPort.ts` —
  never write a test that needs real hardware.
- `SessionHub`/`SerialManager` tests use plain synchronous assertions after
  driving the class directly (no WS/HTTP layer involved) — keep new
  behavioral tests at this level rather than spinning up a full server,
  unless you're specifically testing route-level wiring.
- When adding a `LogWriter` test that needs pre-existing files on disk, use
  `writeFileSync` directly rather than going through `LogWriter`'s own
  async `append`/`close` — there's a known async-race footgun there (a
  pending write can race the test's `afterEach` directory cleanup) that's
  easy to reintroduce if you go through the public API for test setup.
