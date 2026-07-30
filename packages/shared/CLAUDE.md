# packages/shared — wire protocol and domain types

Read `../../CLAUDE.md` first for overall repo context. This package is the
**single source of truth for everything that crosses the backend/frontend
boundary**: REST shapes, WebSocket message shapes, config shape, and shared
domain types (serial settings, port info, session/write-token state). It has
no runtime logic beyond a couple of constant tables — it's types plus a
handful of default-value exports.

## When to change something here

Any time a change touches something backend and frontend both need to agree
on, **start here first**, then let TypeScript's compile errors in the other
two packages tell you everywhere else that needs updating. Never
hand-duplicate a message shape or a domain type locally in backend or
frontend — import it from `@ttymux/shared` instead. If you're tempted to
duplicate, that's a sign the type belongs here and doesn't yet.

## File map

- `index.ts` — barrel, re-exports everything below. This is the entire
  public surface of `@ttymux/shared`.
- `ports.ts` — `PortId` (just `string`), `PortConnectionStatus`
  (`'online'|'offline'|'connecting'|'error'`), `PortWriter`, `PortInfo` (the
  big composite DTO the backend assembles per port — see
  `packages/backend/CLAUDE.md`'s note on `buildPortInfo`). **The doc comment
  here describing port-id priority is a simplified subset of the real logic
  in `packages/backend/src/registry/discovery.ts::computeStableId`** (it's
  missing the USB-serial-number and PnP-id tiers) — if you're touching
  either, update both to match, and don't trust this comment alone as a
  complete description of id derivation.
- `serial.ts` — `SerialSettings` and everything that constrains it (`Parity`,
  `DataBits`, `StopBits`, `FlowControl`), `DEFAULT_SERIAL_SETTINGS` (115200
  8N1, no flow control), `COMMON_BAUD_RATES`, `SERIAL_PRESETS` (backs the
  frontend's settings-panel presets dropdown).
- `session.ts` — `ViewerInfo`, `WriteTokenState` (`holder`, `holderName?`,
  `since?`, `freeForAll`). This is the shape `SessionHub` (backend) produces
  and the console UI (frontend) renders as the writer banner. See
  `packages/backend/CLAUDE.md` for the write-token arbitration rules this
  shape encodes.
- `auth.ts` — `AuthMode` (`'none'|'token'|'basic'`), `BasicAuthUser`,
  `AuthConfig`. **The `passwordHash` doc comment here says "bcrypt hash" —
  this is wrong/stale.** The actual implementation
  (`packages/backend/src/auth/password.ts`) uses **scrypt**, format
  `scrypt:<saltHex>:<hashHex>`. Fix this comment if you're in this file for
  any reason; don't let it mislead someone into hand-crafting a bcrypt hash
  that will silently fail verification.
- `config.ts` — the full YAML config shape as TS interfaces
  (`TtymuxConfig`, `ServerConfig`, `AuthConfig`, `LoggingConfig`,
  `ScrollbackConfig`, `DiscoveryConfig`, `PersistenceConfig`,
  `PortOverride`). This is the compile-time counterpart to
  `packages/backend/src/config/schema.ts`'s zod runtime schema — the two are
  **hand-kept in sync with no code link enforcing it**. If you add a config
  field, update both files, plus `docs/config-reference.md` and
  `config.example.yaml` (four places, every time, per
  `CONTRIBUTING.md`).
- `rest.ts` — the REST surface as request/response types
  (`GetPortsResponse`, `GetPortResponse`, `UpdatePortRequest`,
  `GetServerInfoResponse`, `HealthResponse`, `ApiErrorResponse`), plus a doc
  comment explaining why rename/group-editing is REST while console I/O is
  WebSocket (administrative action on the port record itself, vs. a live
  session). `UpdatePortRequest.name`/`group` are tri-state: omit = leave
  unchanged, `null` = clear back to auto-discovered, string = set. This
  `null`-clears convention recurs elsewhere in the stack — see root
  `CLAUDE.md`'s cross-cutting invariants.
- `ws-messages.ts` — `ConsoleClientMessage`/`ConsoleServerMessage` (the
  `/ws/console/:portId` protocol) and `EventsServerMessage` (the
  `/ws/events` dashboard-wide protocol). Binary console data travels as
  base64 inside JSON frames (`dataBase64` fields) rather than as separate
  binary WS frames — deliberate, because serial data isn't guaranteed valid
  UTF-8 and one JSON-frame-type protocol is simpler than a binary/text dual
  scheme. **Every case in `ConsoleClientMessage` must be handled in
  `packages/backend/src/transport/wsConsole.ts`'s `handleClientMessage`
  switch; every case in `ConsoleServerMessage`/`EventsServerMessage` must
  have both a sender in the backend and a handler in the frontend's
  `useConsoleSocket`/`connectEventsSocket` message switches.** Since these
  message types are hand-authored (not derived from a schema), TypeScript's
  exhaustiveness checking on `switch` statements at each of those sites is
  the only real safety net for "did I handle every message type" — if you
  add a case, deliberately go check all three switch sites rather than
  relying on a compile error to find them for you (a `switch` without a
  `default` won't error on a missing case unless the calling code also
  asserts exhaustiveness).

## Nothing to build-test here beyond typecheck

This package has no logic worth unit-testing on its own — it's `tsc -b` (via
the root `npm run build`) and `tsc --noEmit` (typecheck) that matter. The
real verification that a shared-types change is correct happens in
backend/frontend: if both packages compile after your change, you've
probably done it right; if either doesn't, that's the point of putting the
type here in the first place.
