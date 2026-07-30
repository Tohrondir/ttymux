# packages/frontend — dashboard + console UI architecture

Read `../../CLAUDE.md` first for overall repo context. React 19 + Vite +
Tailwind + xterm.js, no test runner configured (see root `CLAUDE.md`'s "Test
coverage" section for how to verify changes here anyway — live-run the app,
or for pure-logic files, run them directly with `npx tsx` outside any
project setup).

## App-level structure and the "lift shared state to App" pattern

`App.tsx` is the single source of truth for every piece of state that more
than one component needs to read or write. It owns:
`useRoute()` (which top-level view is showing), `useSessionPorts()` (which
ports are pinned to the grid view), and every `useLocalStorageState` call for
a cross-component preference (`highlightEnabled`, `lurkerMode`, ...). These
get passed down as props to `Sidebar`, `ConsolePane`/`GridView`, etc.

**This is load-bearing, not just tidiness.** `useLocalStorageState` (a
`useState` wrapper that also persists to `localStorage`) does *not* cause
other components' independent calls with the same key to re-render — writing
to `localStorage` doesn't notify other React state within the same tab.
Calling the same `useLocalStorageState('some.key', ...)` independently in
two different components (e.g. once in `Sidebar`, once in `GridView`) gives
each one its **own disconnected copy** of that state — toggling it in one
place silently doesn't affect the other. This was a real bug (pinned-ports
state desync between `Sidebar` and `GridView`) before the fix, which was
exactly "lift the hook call to `App`, pass state+setter down as props."
**Any new shared, cross-component preference must follow this same
pattern** — call the stateful hook once in `App`, thread props down; never
call `useLocalStorageState`/`useSessionPorts` independently in more than one
place for the same logical piece of state.

`useRoute.ts` is a from-scratch `pushState`/`popstate` router (no library),
three routes: `/console/:id`, `/grid`, anything else falls through to
`'none'` (no 404 route — the sidebar is always shown regardless, only the
main pane content depends on the route). `navigate()` manually dispatches a
synthetic `popstate` event since `pushState` doesn't fire one on its own.

`ErrorBoundary.tsx` wraps the whole app in `main.tsx` and is **not
boilerplate you can remove**: without it, an uncaught render error anywhere
unmounts the entire tree, including the router's `popstate` listener,
freezing the page and even breaking the browser back button until a manual
reload. It exists specifically because that exact failure mode happened once
(traced back to `crypto.randomUUID()` throwing in non-secure contexts, see
`generateClientId` below) and was confusing to debug without a boundary in
place to at least show a fallback UI.

## Console I/O pipeline: `useConsoleSocket` → `Terminal` → `LineHighlighter`

This is the most failure-prone part of the frontend and the one to be most
careful with. Data flow for one console:

```
api/client.ts::connectConsoleSocket (raw WS, auto-reconnect w/ backoff)
  --'output'/'scrollback' messages-->
useConsoleSocket (decodes base64, exposes onOutput/onScrollback callbacks)
  --Uint8Array bytes-->
ConsolePane/GridPane's onOutput/onScrollback handlers
  --calls terminalRef.current.write(bytes)-->
Terminal.tsx's imperative write()
  --if highlightEnabled: highlighterRef.current.push(bytes); else: term.write(bytes) directly-->
LineHighlighter.push() (line-buffering, pattern-matching, ANSI-wrapping)
  --writeRaw callback-->
xterm.js Terminal.write()
```

- `useConsoleSocket(portId, dataHandlers, { displayName?, lurker? })` wraps
  `connectConsoleSocket`, manages a per-tab `clientId` (generated once via
  `useState(() => generateClientId())`, **not** a `useRef` mutated during
  render — `react-hooks/refs` correctly flags reading/writing `ref.current`
  during render, this is the fix for that, not a style preference), and
  exposes `requestControl`/`changeSettings`/`setFreeForAll`/`sendInput`/
  `isWriter` (computed as `writeToken.holder === clientId`).
- `connectConsoleSocket` (`api/client.ts`) sends `clientId`/`name`/`lurker`
  as WS query params on connect, auto-reconnects with exponential backoff on
  drop, queues outgoing messages if the socket isn't open yet.
- `generateClientId` falls back to `crypto.getRandomValues` if
  `crypto.randomUUID` isn't available — **`crypto.randomUUID()` throws in
  non-secure contexts** (plain `http://<lan-ip>:9000`, not `localhost`, is
  not a secure context), and that throw inside a hook body used to take down
  the entire render tree via the (then-absent) lack of an error boundary.
  Both this fallback and `ErrorBoundary` exist because of the same incident;
  don't remove either without understanding why they're both there.
- `Terminal.tsx` wraps xterm.js + `@xterm/addon-fit` + `@xterm/addon-search`.
  **`allowProposedApi: true` is required in the `Terminal` constructor
  options** — `@xterm/addon-search` calls `registerDecoration`/
  `registerMarker`, which xterm.js gates behind that flag; without it,
  search silently returns zero results with no visible error (a real
  regression once). If you ever see search "just doesn't find anything,"
  check this flag is still present before looking anywhere else.
- Ctrl+F for search is wired via `onKeyDownCapture` on `ConsolePane`/
  `GridPane`'s wrapper div, **not** `onKeyDown`. xterm.js's own keydown
  handling on its internal hidden textarea consumes/stops the event before
  it would otherwise bubble to a normal (bubble-phase) `onKeyDown` handler
  on an ancestor — capture phase runs top-down, before xterm's own handler,
  which is why it has to be capture and not bubble.

## `LineHighlighter` — read this before touching timing here again

`packages/frontend/src/utils/LineHighlighter.ts` feeds raw terminal bytes
through `highlightLine()` (pattern-based ANSI coloring for log-style text:
severity words, timestamps, IPs, hex, quoted strings — see
`utils/highlightLine.ts`) on a **line-buffered** basis: it splits incoming
text on `\n`, immediately colors and writes any segment that's already
newline-terminated, and holds the still-open trailing remainder (`carry`) to
give it a chance to complete before giving up and writing it raw
(uncolored).

**This exact file was "fixed" three times in a row, each fix creating or
missing a different failure mode, before the real root cause was properly
diagnosed. Read this whole section before changing the timing/buffering
logic here again — it will save you from repeating the same mistakes:**

1. **Original design** (60ms give-up timeout, cross-chunk buffering via
   `carry`): correct, but the 60ms wait was perceptible/felt "sluggish" when
   watching fast-scrolling structured logs — the user's actual complaint was
   almost certainly about *that* scenario, not slow interactive typing.
2. **First "fix" attempt**: removed the `carry` buffer entirely and wrote
   every still-open trailing segment raw+immediately, with zero delay. This
   broke correctness outright: a serial device's `'data'` event very often
   delivers one logical line as *multiple separate chunks* (a few hundred
   microseconds to tens of milliseconds apart — real device/OS/browser
   behavior, not a contrived edge case). Without buffering across `push()`
   calls, a line split across two chunks never sees its own newline within
   a single call and **silently and permanently loses its highlighting**,
   even though it would have completed fine a moment later. This regression
   shipped and was reported by the user directly ("the highlighting doesn't
   work anymore").
3. **Second fix attempt**: restored `carry`-based cross-chunk buffering, but
   with a *much shorter* give-up timeout (16ms) to address the original
   "sluggish" complaint while (supposedly) still tolerating chunk-splitting.
   This was **still wrong**, just less obviously: 16ms is not generous
   enough for realistic jitter, especially under *bursty/high-throughput*
   log output specifically — which is exactly the scenario where you most
   need correct reassembly, and exactly the scenario most likely to also
   have larger inter-chunk gaps (device-side buffering delays, OS scheduling
   pressure, or the browser's own event loop being backed up processing a
   flood of other queued WS messages before it gets around to the chunk that
   would have completed a line). Shortening the timeout makes correctness
   *worse* precisely when output is fastest — the opposite of what "make it
   feel snappier" was going for. This also shipped and was reported by the
   user with a screenshot showing systematically-missing highlighting on a
   real, busy log stream.
4. **Actual fix, after properly diagnosing instead of guessing again**:
   before touching the timeout value a third time, first *ruled out* the
   other plausible explanation — that the device's own logger was already
   emitting ANSI codes (which `highlightLine` deliberately defers to,
   bailing out entirely on any line containing an ESC byte) — by having the
   user check the raw downloaded log for escape bytes (`cat -A` /
   `grep -c $'\x1b'`; none were found). Then confirmed via a standalone,
   React-free `npx tsx` script exercising `LineHighlighter` directly (no
   browser, no StrictMode double-invocation artifacts to confuse the
   result) that a single complete chunk highlights correctly, proving the
   core matching logic itself was sound and the failure was specifically
   about cross-chunk timing. **Then, and only then**, changed the design:
   raised the give-up timeout back up to a generous 200ms (verified against
   the user's exact real log line, deliberately split with gaps up to
   190ms, still reassembles and highlights correctly), and added a
   **separate, non-time-based safety valve** — `MAX_UNTERMINATED_BYTES`
   (8192): if `carry` grows past that with no newline in sight regardless of
   timing, flush it immediately, so a genuinely non-line-oriented stream
   (binary data, or an interactive session sitting with no `\n` for a long
   time) can't make memory grow unbounded. This is the current, believed-
   correct design.

**The lesson, if you're changing this file again**: a fixed wall-clock
timeout is fundamentally in tension between two needs — reassembling a
log line that's split across chunks (wants a long, forgiving wait) and
showing typed/interactive character-echo promptly (wants a short wait,
since that has no newline until Enter is pressed at all). This codebase
currently resolves that tension by favoring correctness (long timeout) on
the theory that this product's primary use case is passively watching
structured log output, not interactive typing, and that a modest,
imperceptible-most-of-the-time delay before a line "settles" into color is
far less bad than a line that silently never colors at all. If you want to
revisit that trade-off, **write a reproduction first** (either a real
multi-chunk example from an actual affected user, or a synthetic
`npx tsx` script simulating the gap sizes you're worried about) rather than
adjusting the number and hoping. A pure Node script exercising the class
directly (no `Terminal`/React/xterm involved) is the fastest, least
confounded way to verify any change here — see the isolated-test pattern
described in root `CLAUDE.md`'s "Test coverage," and specifically avoid
testing timing-sensitive async behavior through a React `<StrictMode>` tree
(it deliberately double-invokes effects in dev mode, which will make an
async multi-step test harness produce misleading duplicate-write artifacts
that look like real bugs but aren't).

## `ConsolePane` vs `GridPane`

Two components render essentially the same console (header with status/
control/actions + `Terminal` + optional `TerminalSearchBar`) at two
different scales: `ConsolePane` is the full single-console view (more header
controls: Find via Ctrl+F, Download log, Highlight toggle, Settings gear),
`GridPane` is the compact multi-console-at-once tile (fewer controls, no
Download log/Highlight/Settings — those live at the single-console level
only). They're deliberately separate components, not one component with a
`compact` prop — the layout/header differences are substantial enough that
a shared component would need heavy conditional branching. If you add a
console-header feature, decide deliberately whether it belongs in both or
just `ConsolePane` (the pattern so far: viewing controls that only make
sense with one console in focus, like search or settings, stay
`ConsolePane`-only; controls that matter regardless of how many consoles are
visible, like the write-token banner, go in both).

Console header layout (in `ConsolePane`) is grouped into three visually
separated clusters, left to right: **status** (online dot, viewer count,
reconnecting indicator) → **control** (`WriterBanner`: writer status,
free-for-all checkbox, take-control button) → **actions** (download log,
highlight toggle, settings gear), separated by thin vertical dividers. There
used to be a redundant "Find" button here too — it was removed since Ctrl+F
already does the same thing and the button was clutter; don't re-add a
button for something already reachable by an existing, more discoverable
mechanism without a real reason.

## Other components/hooks worth knowing about

- `Sidebar.tsx` — port list (grouped via `utils/groupPorts.ts`, ungrouped
  ports always sort first, then groups alphabetically), resizable
  (`useSidebarLayout.ts`, 200–480px clamped, drag-resize implemented with
  raw `mousemove`/`mouseup` window listeners plus a `draggingRef` guard —
  not React synthetic events after mousedown, and the ref (not state) guard
  is necessary because plain `useState` closures captured at drag-start
  would go stale; don't "simplify" this to plain state without
  understanding why it's a ref), collapsible, and hosts the lurker-mode
  toggle (a global preference — affects the *next* console opened, not
  retroactively, per its own tooltip).
- `SidebarPortItem.tsx` — inline rename-in-place. `commitRename` sends
  `name: trimmed || null` (empty string → `null` → clears the override, per
  the `null`-clears convention) and is optimistic: the edit UI closes before
  the API call resolves, so a failed rename shows an inline error but
  doesn't roll back the displayed name locally (it just won't update on the
  next real `PortInfo` push, since the write never happened) — a known,
  accepted rough edge, not a bug to silently "fix" without considering
  whether proper rollback is worth the complexity.
- `StatusDot.tsx` — the "In use" (amber) vs "Free" (green) distinction for
  `status: 'online'` is a **frontend-only derived state**, not part of the
  shared `PortConnectionStatus` union — it's computed from `status` plus a
  separate `hasWriter` boolean. If you add a new connection status, you must
  handle it in `STATUS_META` (TypeScript enforces this via
  `Record<Exclude<PortConnectionStatus, 'online'>, ...>`), but the "online +
  writer" special case sits outside that record and won't be caught by the
  compiler if you forget to update it.
- `useSessionPorts.ts` — same "must be a singleton hook call" rule as
  `useLocalStorageState` above (it's built on top of it under
  `ttymux.sessionPorts`).
- `api/base64.ts` — `atob`/`btoa`-based, operates on "binary strings" (one
  char = one byte). This is correct as long as every caller passes actual
  `Uint8Array` byte values (which is the case throughout this codebase,
  since serial data isn't guaranteed UTF-8) — don't feed it a raw JS string
  expecting UTF-8 encoding first, it has no `TextEncoder` step and will
  corrupt multi-byte text if misused that way.

## Debug harnesses (for live-verifying frontend-only logic)

When a change needs verifying against the real `Terminal`/xterm.js pipeline
but doesn't need a real backend (e.g. testing `LineHighlighter` timing
against synthetic multi-chunk input), the established pattern used
throughout this project's history is:

1. Add a throwaway `DebugXyzHarness.tsx` component that renders `Terminal`
   directly and drives it with `write()` calls in a `useEffect`.
2. Temporarily branch `main.tsx` on a query param (e.g.
   `location.search.includes('debugxyz')`) to render the harness instead of
   `<App />`.
3. Run `npx vite --port <scratch-port>` and drive it with Playwright.
4. **Delete the harness file and revert `main.tsx` before committing** —
   these are never meant to ship. `git status`/`git diff` before every
   commit in this repo has consistently caught leftover debug files; keep
   doing that check.

For anything with zero React/DOM dependency (like `LineHighlighter` or
`highlightLine`), skip the harness entirely and run the `.ts` file directly
with `npx tsx some-test-script.mjs` importing straight from the source path
— faster, and immune to React `<StrictMode>` double-invocation artifacts
that can make async test harnesses produce misleading results (see the
`LineHighlighter` section above for a concrete case where this mattered).
