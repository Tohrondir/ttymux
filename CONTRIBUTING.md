# Contributing to ttymux

Thanks for considering a contribution. This document covers the repo layout
and the mechanics of getting a change merged.

## Repo layout

Monorepo, npm workspaces:

- `packages/shared`: the TypeScript contract (REST + WebSocket types) that
  both other packages import. Change the protocol here first.
- `packages/backend`: Node.js/Fastify server: port discovery, serial
  connection management, session/write-token arbitration, REST + WebSocket
  transport, logging, auth.
- `packages/frontend`: React/Vite dashboard and console UI.

If you're changing anything that crosses the wire (a new message type, a new
REST field), start in `packages/shared` and let TypeScript guide you to every
place that needs to handle it.

## Setup

```sh
npm install
npm run dev      # backend on :9000 + frontend dev server, both live-reloading
```

The frontend dev server proxies `/api` and `/ws` to the backend, see
`packages/frontend/vite.config.ts` if you're running the backend on a
different port.

## Before opening a PR

```sh
npm run build
npm run lint
npm run typecheck
npm test
```

CI runs the same four commands on Node 20 and 22. Please add or update tests
for behavioral changes. `packages/backend/test/` mocks the serial layer
(`test/mocks/MockSerialPort.ts`) so tests run without real hardware.

## Making changes

- Keep `packages/shared` as the single source of truth for the wire
  protocol. Don't let backend and frontend drift into their own private
  understanding of a message shape.
- Sensible defaults, everything overridable: new config options should have
  a working zero-config default and be documented in
  `docs/config-reference.md` and `config.example.yaml`.
- Prefer small, focused PRs. If a change is large, opening an issue to
  discuss the approach first is welcome.

## Reporting bugs / requesting features

Use the issue templates, they ask for the details that are usually needed
to reproduce a serial-hardware-adjacent bug (platform, device type, whether
the port has a stable id).
