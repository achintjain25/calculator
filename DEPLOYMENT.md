# RJ Jewellers — Deployment Guide

How to get this running in production, and what to check before you do.

---

## How production differs from development

In development you run two processes: Vite on `:5173` and the API on `:3000`,
with Vite proxying `/api` across.

In production **one** process serves everything. The Express server on `:3000`
serves the compiled React app *and* the API from the same origin. That means:

- no CORS to configure — requests are same-origin
- no second process to keep alive
- deep links like `/customers/<id>` work, because unknown paths fall back to
  `index.html` for React Router

---

## First-time setup

### 1. Install PostgreSQL

Download from <https://www.postgresql.org/download/windows/>. During install,
set a password for the `postgres` user and keep the default port `5432`.

### 2. Configure the server

```cmd
copy server\.env.example server\.env
```

Open `server\.env` and set, at minimum:

```
DB_PASSWORD=<your postgres password>
NODE_ENV=production
```

`server\.env` is git-ignored and must never be committed.

### 3. Create the database and run migrations

```cmd
setup-database.bat
```

This creates the `rj_jewellers` database and applies **every** migration in
order, recording each one in a `schema_migrations` table.

> **If your database already exists** and was set up by hand before the
> migration runner existed, tell the runner which files are already applied so
> it does not replay them over live data:
>
> ```cmd
> cd server
> ..\nodejs\npm.cmd run migrate -- baseline --through 003_bills.sql
> ..\nodejs\npm.cmd run migrate
> ```

Check status any time with:

```bash
cd server && npm run migrate:status
```

### 4. Build and start

```cmd
build-production.bat
start-production.bat
```

The app is then at <http://localhost:3000>.

---

## Everyday commands

| Task | Command |
|---|---|
| Development — backend | `start-server.bat` |
| Development — frontend | `start-client.bat` |
| Build for production | `build-production.bat` |
| Run production | `start-production.bat` |
| Apply new migrations | `cd server && npm run migrate` |
| Check migration status | `cd server && npm run migrate:status` |
| Reconcile settled loans | `cd server && npm run reconcile` |

---

## Pre-deployment checklist

- [ ] `server\.env` exists, has a real `DB_PASSWORD`, and `NODE_ENV=production`
- [ ] `server\.env` is **not** committed to version control
- [ ] `npm run migrate:status` shows every migration applied
- [ ] `curl http://localhost:3000/api/health` returns `"database":"connected"`
- [ ] Nothing private sits in `client\public\` — everything there is published
- [ ] A database backup schedule exists (see below)
- [ ] `npm run reconcile` reviewed — no unexpectedly settled loans
- [ ] `AUTH_PASSWORD_HASH` and `AUTH_SESSION_SECRET` are set, password is strong
- [ ] `AUTH_COOKIE_SECURE=true` if serving over HTTPS
- [ ] Signed out, confirmed `/api/customers` returns 401

---

## Backups

There is no backup automation in this project, and loan ledgers are not
something to lose. At minimum, schedule a daily dump:

```cmd
"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -U postgres -d rj_jewellers -F c -f "D:\backups\rj_jewellers_%DATE%.dump"
```

Add it to Windows Task Scheduler, keep at least 30 days of history, and restore
one into a scratch database occasionally to confirm the dumps are usable.

---

## Exposing the app beyond this machine

`start-production.bat` binds to port 3000 on all interfaces. Before letting
anyone outside the shop reach it, be aware of what this application does **not**
have:

### Authentication is a single shared login

The app requires a sign-in, configured through environment variables. Set it up
before deploying:

```cmd
cd server
npm run set-password -- "your password here"
```

Paste the printed `AUTH_*` lines into `server\.env`. The server **refuses to
start** if auth is enabled and no password is configured, so a deployment
cannot accidentally go out open.

Two things to get right on a public deployment:

1. **Serve over HTTPS and set `AUTH_COOKIE_SECURE=true`.** Without TLS the
   session cookie travels in the clear. Do not set this while serving plain
   HTTP — the browser drops the cookie and login silently fails.
2. **Use a strong password.** One shared credential is the only thing between
   the internet and every customer record.

Because it is a single shared account, there is no per-person audit trail. If
several staff need separate logins, that needs a real users table.

For an extra layer, a VPN or Tailscale keeps the app off the public internet
entirely — worth considering for a shop tool that only staff ever use.

### If you put it behind a reverse proxy

Terminate TLS at the proxy and set in `server\.env`:

```
TRUST_PROXY=true
```

Without it the rate limiter sees every request as coming from the proxy's IP and
throttles all users together. With it set while the server is directly exposed,
anyone can spoof `X-Forwarded-For` and bypass the limiter — so set it only when
a proxy is genuinely in front.

---

## Split deployment (client and API on different hosts)

Only needed if you serve the built client from a static host such as Netlify,
rather than from the Express server.

1. In `client\.env`:
   ```
   VITE_API_BASE_URL=https://api.yourdomain.com/api
   ```
2. In `server\.env`:
   ```
   CORS_ORIGIN=https://app.yourdomain.com
   ```
3. Configure the static host to rewrite all unknown paths to `/index.html`, or
   deep links will 404.

---

## Configuration reference

Every value lives in `server\.env`; see `server\.env.example` for the annotated
list. The ones that matter most in production:

| Variable | Purpose |
|---|---|
| `NODE_ENV=production` | Strict CSP, no internal error details in responses, serves the built client |
| `DB_PASSWORD` | PostgreSQL password |
| `DATABASE_URL` | Full connection string; overrides the individual `DB_*` values |
| `DB_SSL` | `true` for managed PostgreSQL providers |
| `APP_TIMEZONE` | Business timezone for "today" on payments and bills. Defaults to `Asia/Kolkata` |
| `TRUST_PROXY` | `true` only when behind a reverse proxy |
| `RATE_LIMIT_PER_MINUTE` | Read requests per IP per minute (default 300) |
| `RATE_LIMIT_WRITES_PER_MINUTE` | Write requests per IP per minute (default 60) |

---

## Troubleshooting

**`/api/health` returns `"database":"unreachable"`**
The process is up but PostgreSQL is not. Check the Windows service is running
and that `DB_PASSWORD` in `server\.env` is correct.

**Blank page, console shows 404s for `/assets/…`**
The client was not built. Run `build-production.bat`.

**Deep links 404 but the home page works**
The server is not serving `client\dist`. Confirm `client\dist\index.html`
exists, then restart.

**"Cannot reach the server" in the UI**
In development, the backend is not running — start `start-server.bat`. In
production, both halves are one process, so check the server console.

**Dashboard totals look wrong after upgrading**
Run `cd server && npm run migrate` — migration `004` rewrites the
`customer_summary` view, which previously multiplied each customer's total paid
by their number of loans.
