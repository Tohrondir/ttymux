# Configuration reference

ttymux needs no config file at all — it auto-discovers every serial port and
listens on `127.0.0.1:9000` with no authentication. A config file only
*refines* that default behavior. See [config.example.yaml](../config.example.yaml)
for a copy-pasteable, fully-commented starting point.

## Finding the config file

ttymux looks for a config file in this order:

1. `--config <path>` passed on the command line
2. the `TTYMUX_CONFIG` environment variable
3. `ttymux.config.yaml` or `ttymux.config.yml` in the current directory

If none of those exist, ttymux runs with built-in defaults (see below) —
this is the normal, expected zero-config path, not an error.

## `server`

```yaml
server:
  port: 9000
  host: 127.0.0.1
```

| Key | Default | Notes |
| --- | --- | --- |
| `port` | `9000` | |
| `host` | `127.0.0.1` | Loopback-only by default. Set to `0.0.0.0` (or a specific interface) to accept connections from other machines — see the [security section of the README](../README.md#security) before you do. |

## `auth`

```yaml
auth:
  mode: none # none | token | basic
  token: "..."
  users:
    - username: alice
      passwordHash: "scrypt:..."
```

| Key | Default | Notes |
| --- | --- | --- |
| `mode` | `none` | `none`, `token`, or `basic`. |
| `token` | — | Required when `mode: token`. Sent as `Authorization: Bearer <token>` for REST calls, or `?token=<token>` for WebSocket connections (browsers can't set custom headers during a WS handshake). |
| `users` | — | Required when `mode: basic`. Each entry is a `username` and a `passwordHash` — never a plaintext password. |

Regardless of `mode`, connections from loopback (`127.0.0.1`/`::1`) are
always authenticated — this is what makes the zero-config default safe, and
keeps local tooling/health checks working once you've configured auth for
network exposure.

**Generating a password hash for `mode: basic`:**

```sh
npx ttymux hash-password
```

This prompts for a password (input is not masked) and prints a
`scrypt:<salt>:<hash>` string to paste into `users[].passwordHash`.

There is no full user-account system or RBAC — everyone who authenticates
(with the shared token, or any one of the configured basic-auth users) has
equal read/write access to every console.

## `logging`

```yaml
logging:
  enabled: true
  directory: ./logs
  maxSizeMb: 10
  maxFiles: 5
```

Raw per-port disk logs, rotated by size. Each port gets its own file named
after its stable id (or path-derived id, with `/`, `\`, and `:` replaced by
`_`), e.g. `logs/usb-FTDI_FT232R_A12BC3XY-if00.log`, rotating to `.log.1`,
`.log.2`, etc. up to `maxFiles`.

## `scrollback`

```yaml
scrollback:
  bytes: 200000
```

Size of the in-memory ring buffer kept per port, replayed to a viewer's
terminal the moment they attach (or re-attach after a dropped connection).
This is separate from disk logging — it's what makes "join a console
mid-session and see recent history" work.

## `discovery`

```yaml
discovery:
  includeLegacyPorts: false
```

On Linux, the kernel always exposes `/dev/ttyS0` through `/dev/ttyS31` for
legacy 8250/16550 UART headers, almost none of which are wired to real
hardware on modern machines — opening them fails immediately. ttymux
excludes them from discovery by default. If you have genuine hardware on one
of these (some industrial PCs have a real onboard RS-232 port), set this to
`true`.

## `ports`

```yaml
ports:
  "usb-FTDI_FT232R_USB_UART_A12BC3XY-if00":
    name: "Router console"
    group: "Lab rack 1"
    defaultSettings:
      baudRate: 9600
    hidden: false
```

Per-port overrides, layered on top of auto-discovery — a port with no entry
here still shows up, using its auto-discovered identity and default serial
settings. Keyed by the port's **id**, which you can read off the dashboard
or `GET /api/ports` for a port you've already plugged in:

- Ports with a stable USB identifier get an id like
  `by-id:usb-FTDI_FT232R_USB_UART_A12BC3XY-if00` (Linux, from
  `/dev/serial/by-id`) or `usb-<manufacturer>_<product>_<serial>` (other
  platforms, from the USB serial number). These ids survive a replug, even
  across a reboot.
- Ports with no stable identifier available fall back to
  `path:<os-path>` (e.g. `path:/dev/ttyUSB0` or `path:COM3`) — **not**
  stable across replug, since the OS may re-enumerate the same physical
  device under a different path next time.

| Key | Effect |
| --- | --- |
| `name` | Friendly name shown on the dashboard instead of the raw path. |
| `group` | Groups ports together on the dashboard under a heading. |
| `defaultSettings` | Baud/data bits/stop bits/parity/flow control applied the first time this port is opened. Anyone can change settings live from the console view afterward. |
| `hidden` | Excludes the port from the dashboard and `GET /api/ports` listing entirely. It's still reachable directly by id (e.g. a bookmarked console URL) — this is a declutter option, not an access control. |

## Docker device access

Containers don't see host devices by default. The simplest option is
[docker-compose.yml](../docker-compose.yml) — `docker compose up -d` grants
access to whole classes of USB serial devices via `device_cgroup_rules` plus
a `/dev` bind mount, so devices plugged in after the container starts are
picked up automatically, without editing the file or restarting.

With plain `docker run`, grant access to one specific, already-connected
device:

```sh
docker run --device=/dev/ttyUSB0 -p 9000:9000 ttymux
```

Repeat `--device` for multiple known devices, or use
`--device-cgroup-rule='c 188:* rmw'` (adjust the major number for your
device class — see the comments in docker-compose.yml) to allow a whole
class of devices including ones that appear after the container starts. On
Linux hosts without Docker, add your user to the `dialout` group instead of
using `sudo`:

```sh
sudo usermod -aG dialout $USER
```
