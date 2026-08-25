# RJ Jewellers — Loan & Billing System

A gold/silver loan management system for a jewellery shop: ornament valuation,
reducing-balance loan interest, customer ledgers, payment tracking and purchase
bills.

- **Deploying?** Read [DEPLOYMENT.md](DEPLOYMENT.md).
- **Setting up to develop?** Keep reading.

---

## Requirements

**Node.js 18+** and **PostgreSQL 14+**.

If you cloned this from GitHub, install Node from <https://nodejs.org/> — the
`nodejs/` folder in the original setup is ~105 MB of Windows binaries and is
deliberately not committed. The `.bat` scripts use the bundled copy when it is
present and fall back to your system install when it is not.

## Quick start

```cmd
install-all.bat        :: install client + server dependencies
setup-database.bat     :: create the database and run all migrations
```

Then edit `server\.env` and set `DB_PASSWORD`.

Set the login password (the app refuses to start without one):

```cmd
cd server
npm run set-password -- "your password here"
```

Paste the printed `AUTH_*` lines into `server\.env`.

**Development** — two windows:

```cmd
start-server.bat       :: API on http://localhost:3000
start-client.bat       :: app on http://localhost:5173
```

**Production** — one process serving both:

```cmd
build-production.bat
start-production.bat   :: everything on http://localhost:3000
```

---

## Project structure

```
Calculator/
├── client/                  React + TypeScript + Tailwind (Vite)
│   ├── public/              PUBLISHED AS-IS — nothing private in here
│   └── src/
│       ├── api/             Axios API layer
│       ├── components/      Header, Sidebar, calculators, payment modal
│       ├── pages/           Dashboard, Customers, Bills, Calculator
│       └── utils/           Formatting + PDF generation
│
├── server/                  Express + TypeScript + PostgreSQL
│   ├── migrations/          Numbered SQL migrations, applied in order
│   └── src/
│       ├── index.ts         App entry, middleware, static serving
│       ├── db.ts            Connection pool + type parsers
│       ├── interestEngine.ts  Reducing-balance calculation
│       ├── validate.ts      Request validation helpers
│       ├── auth.ts         Single-user login (env-configured)
│       ├── migrate.ts       Migration runner
│       ├── setPassword.ts   Password hashing helper
│       ├── reconcile.ts     Settled-loan reporting tool
│       └── routes/          customers, loans, payments, dashboard, bills
│
├── _private/                Personal files kept OUT of the web root
└── nodejs/                  Bundled Node.js runtime
```

---

## The interest model

```
Interest = Principal × (Rate ÷ 100) × (Days ÷ 30)
```

Rate is rupees per ₹100 per month, and one month is exactly 30 days.

Loans use a **reducing balance**. When a payment arrives:

1. Interest accrues from the last event to the payment date
2. The payment clears outstanding interest first
3. Any remainder reduces the principal
4. Any shortfall is **carried forward** as interest still owed
5. The next period accrues on the reduced principal

The same engine (`server/src/interestEngine.ts`) drives the loan detail page,
the dashboard and the reconciliation tool, so every screen agrees.

---

## Features

**Calculators** — ornament valuation (rate × weight × purity) and standalone
loan interest, with copy / print / PDF receipts. Works without a database.

**Customers** — searchable list, profile with full loan and payment ledger,
phone number as the unique identifier.

**Loans & payments** — reducing-balance tracking, per-payment interest and
principal breakdown, automatic closure once a loan is fully settled.

**Bills** — multi-item purchase bills with auto-generated numbers
(`RJ-YYYY-NNNN`), discounts, partial payment status and PDF output.

**Dashboard** — customer count, active loans, principal outstanding, total
collected, and loans with no payment in 90+ days.

---

## Commands

From `client/` or `server/`:

| Command | Effect |
|---|---|
| `npm run dev` | Development server with reload |
| `npm run build` | Production build |
| `npm run typecheck` | Type check without emitting |

Server only:

| Command | Effect |
|---|---|
| `npm run start` | Run the built server |
| `npm run migrate` | Apply outstanding migrations |
| `npm run migrate:status` | Show applied vs. pending |
| `npm run reconcile` | Report loans that are settled but still open |
| `npm run set-password` | Generate the login password hash + session secret |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS, React Router v6, Vite |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| PDF | jsPDF + jspdf-autotable (browser-side) |
| Auth | scrypt password hashing, HMAC-signed session cookie |
| Security | helmet, express-rate-limit, CORS |

---

## Authentication

One shared login for the shop, configured entirely through environment
variables — there is no users table.

```cmd
cd server
npm run set-password -- "your password here"
```

That prints `AUTH_USERNAME`, `AUTH_PASSWORD_HASH` and `AUTH_SESSION_SECRET` to
paste into `server\.env`. Restart the server afterwards.

How it works:

- The password is stored as an **scrypt hash**, never in plaintext
- The session is an **HMAC-signed cookie** — stateless, so it survives restarts
  with no session table
- The cookie is `httpOnly` and `sameSite=lax`
- Failed sign-ins are rate-limited to 10 per IP per 15 minutes
- **Fails closed**: if auth is enabled and no password is set, the server
  refuses to start rather than serving customer data openly

To change the password later, re-run `set-password` and replace the hash.
Changing `AUTH_SESSION_SECRET` signs you out everywhere.

For local development only, `AUTH_ENABLED=false` skips the login entirely.
Never use that on a machine others can reach.

If you serve the app over **HTTPS**, also set `AUTH_COOKIE_SECURE=true`. Do not
set it when serving plain HTTP on a LAN — the browser will drop the cookie and
login will appear to do nothing.

## Known limitations

**No automated tests.** The interest engine in particular carries the whole
business logic and would benefit from a unit test suite.

**Single shared account.** One username and password for the whole shop, so
there is no per-person audit trail. Fine for a one-operator business; if
several staff need separate logins, that needs a real users table.

**No backup automation.** See the backup section in
[DEPLOYMENT.md](DEPLOYMENT.md).

---

## Customising

The shop name lives in `client/src/App.tsx`:

```ts
export const SHOP_NAME = 'RJ Jewellers'
```

The logo is `client/public/logo.jpeg`, referenced from `index.html`,
`Header.tsx` and `Sidebar.tsx`.
