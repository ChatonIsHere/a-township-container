# Resource monitoring

A minimal monitoring stack for `a-township-container`:

- **collector** (Python) polls Docker's stats API, the host's load average, and the kernel's conntrack table every `POLL_INTERVAL_SECONDS` (default 5s), and writes one row per poll into Postgres.
- **web** is a custom-written, read-only, dark-only dashboard (React + shadcn/ui) served by a small Node/Express backend. It serves historical data over HTTP and pushes new points to the page live over a WebSocket (backed by Postgres `LISTEN`/`NOTIFY`, so the collector never has to know the frontend exists).
- **caddy** terminates TLS for `DOMAIN` (default `att.doxbox.org`, Let's Encrypt via automatic HTTPS) and reverse-proxies to `web`, with per-IP rate limiting via the [caddy-ratelimit](https://github.com/mholt/caddy-ratelimit) plugin. It's the only service with published ports on all interfaces — `web` and `postgres` are both localhost-only.

Must run on the same Docker host as `a-township-container` (the collector talks to `docker.sock` and needs to see the host's conntrack table to count players). `DOMAIN` needs a DNS A/AAAA record pointing at this host's public IP before Caddy can issue a certificate for it, and ports 80/443 need to be reachable from the internet (check your firewall/cloud security group, not just this compose file).

## Running

```
docker compose up -d --build
```

The dashboard is public and read-only (no login) at `https://<DOMAIN>/` — `https://att.doxbox.org/` by default, override with `DOMAIN` in `.env`. Time range is selectable (past 24 hours / 3 days / week / month); the backend downsamples longer ranges server-side (1 min buckets for 24h, up to 1 hour buckets for 30d) so the browser never has to render an unreasonable number of points.

## Rate limiting

Caddy enforces two per-client-IP zones (see `caddy/Caddyfile`), both apply together:

- `site`: 120 requests/minute for the whole site (page shell, static assets, websocket upgrade)
- `api`: 30 requests/minute specifically for `/api/*`, since each of those hits Postgres

Requests over the limit get an HTTP 429 with `Retry-After`. Adjust `events`/`window` per zone directly in the Caddyfile if these don't fit your traffic.

## How "players online" works

The collector queries the kernel's connection-tracking table over netlink: it `nsenter`s into a read-only bind mount of the host's network namespace (`/proc/1/ns/net`, mounted read-only, `NET_ADMIN` + `SYS_ADMIN` capabilities added) and runs `conntrack -L -p udp`, which includes the DNAT'd sessions on the game port's published port. Every poll it tracks which source IPs are currently present; an IP only counts toward "players online" once it's been continuously present for `PLAYER_ONLINE_THRESHOLD_SECONDS` (default 10s), so a brief connection attempt or a stray packet doesn't count as a player.

Netlink was used instead of reading `/proc/net/nf_conntrack` directly because some kernels (recent Ubuntu among them - confirmed on the real VPS this runs on) ship without `CONFIG_NF_CONNTRACK_PROCFS`, so that file never exists no matter what, even with the `nf_conntrack` module loaded. The netlink interface (`nf_conntrack_netlink`, the `conntrack` CLI) works regardless.

**Do not switch this to `network_mode: host` for the whole container** — that was an earlier design and it repeatedly crashed/restarted a WSL2 dev host (confirmed by disabling it: restarts stopped immediately), most likely a conflict with WSL's mirrored networking mode. `nsenter`-ing into the host's net namespace for just the one conntrack query achieves the same thing without the container ever joining the host network itself.

## How the live feed works

The collector's insert and its `pg_notify('metrics_update', ...)` call happen in the same transaction, so a listener never sees a notification for a row it can't yet query. `web/server/index.js` holds one dedicated (non-pooled) Postgres connection with `LISTEN metrics_update` and rebroadcasts each payload verbatim to every connected WebSocket client — no polling anywhere in the chain.

## Development

`web/frontend` is a normal Vite app (`npm run dev` inside it proxies `/api` and `/ws` to `web/server` running on `:8080`). Components under `src/components/ui` are real shadcn/ui components added via `npx shadcn@latest add <name>` from within `web/frontend` — edit them in place same as any shadcn project, or add more with the CLI.

## Config

All in `.env` (see `.env.example`): `DOMAIN`, `TARGET_CONTAINER`, `GAME_PORT`, `POLL_INTERVAL_SECONDS`, `PLAYER_ONLINE_THRESHOLD_SECONDS`, `POSTGRES_PASSWORD`.

## Note

Only `caddy` publishes ports on all interfaces (80/443, plus 443/udp for HTTP/3). `web` (`127.0.0.1:3000`) and `postgres` (`127.0.0.1:5432`) are both bound to localhost only — reachable from this host itself (e.g. over an SSH tunnel for debugging) but not externally. The dashboard has no authentication by design (it's meant to be a public read-only page); rate limiting is Caddy's job, not a substitute for auth if that assumption ever changes.
