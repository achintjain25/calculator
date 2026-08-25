# RJ Jewellers — Setup Guide

Step-by-step first-time setup. For deploying to production, see
[DEPLOYMENT.md](DEPLOYMENT.md).

---

## Step 1 — Install PostgreSQL

Download from <https://www.postgresql.org/download/windows/>.

During install:
- set a password for the `postgres` user (you will need it in step 3)
- keep the default port **5432**
- pgAdmin 4 is optional but useful

---

## Step 2 — Install dependencies

```cmd
install-all.bat
```

This installs both the client and the server, and creates `server\.env` from
the template if it does not exist yet.

---

## Step 3 — Set the database password

Open `server\.env` and fill in:

```
DB_PASSWORD=your_postgres_password
```

`server\.env` is git-ignored. Never commit it — if a real password has ever been
committed, rotate it.

Everything else in that file has a working default; see `server\.env.example`
for what each value does.

---

## Step 4 — Create the database

```cmd
setup-database.bat
```

This creates the `rj_jewellers` database and applies **all** migrations in
order:

| Migration | Adds |
|---|---|
| `001_initial_schema` | `customers`, `loan_records`, `payments`, `customer_summary` |
| `002_reducing_balance` | Per-payment interest/principal split columns |
| `003_bills` | `bills`, `bill_items`, bill numbering |
| `004_production_fixes` | Corrected summary view, race-free bill numbers, constraints, indexes |

Each applied migration is recorded in a `schema_migrations` table, so re-running
is safe and only new files execute.

> **Already have a database built by hand?** Baseline the migrations that are
> already applied so they are not replayed over your data:
>
> ```cmd
> cd server
> ..\nodejs\npm.cmd run migrate -- baseline --through 003_bills.sql
> ..\nodejs\npm.cmd run migrate
> ```

Verify with:

```cmd
cd server
..\nodejs\npm.cmd run migrate:status
```

---

## Step 5 — Set the login password

The app has a single shared login and refuses to start without one.

```cmd
cd server
..\nodejs\npm.cmd run set-password -- "your password here"
```

Paste the printed `AUTH_*` lines into `server\.env`, then restart the server.

The password is stored as an scrypt hash — the password itself is never written
to disk by that command.

To run with no login at all (local development on a machine nobody else can
reach), set `AUTH_ENABLED=false` instead.

---

## Step 6 — Run the application

### Development (two windows, with hot reload)

**Window 1 — backend:**
```cmd
start-server.bat
```
API on <http://localhost:3000>

**Window 2 — frontend:**
```cmd
start-client.bat
```
App on <http://localhost:5173>

### Production (one process)

```cmd
build-production.bat
start-production.bat
```

Everything on <http://localhost:3000> — the server serves the built app and the
API together.

### Calculator only (no database)

```cmd
start.bat
```

The valuation and interest calculators work standalone; customer, loan and bill
features need the backend.

---

## API reference

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Sign in, sets the session cookie |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | Current session state |
| GET | `/api/health` | Health check, including database connectivity |
| GET | `/api/customers` | List (`?search=` `?sort=` `?order=` `?limit=` `?offset=`) |
| GET | `/api/customers/:id` | One customer with summary |
| GET | `/api/customers/phone/:phone` | Look up by phone |
| POST | `/api/customers` | Create (409 if the phone exists) |
| PATCH | `/api/customers/:id` | Update |
| DELETE | `/api/customers/:id?force=true` | Delete, cascading to loans and payments |
| GET | `/api/loans/customer/:id` | A customer's loans |
| GET | `/api/loans/:id` | One loan |
| POST | `/api/loans` | Create |
| PATCH | `/api/loans/:id` | Update |
| GET | `/api/loans/:id/interest-to-date` | Reducing-balance state (`?date=`) |
| GET | `/api/payments/recent` | Recent payments (`?limit=`) |
| GET | `/api/payments/loan/:loanId` | A loan's payments |
| GET | `/api/payments/customer/:id` | A customer's payments |
| POST | `/api/payments` | Record a payment |
| GET | `/api/dashboard/stats` | Headline numbers |
| GET | `/api/dashboard/top-dues` | Largest outstanding balances |
| GET | `/api/bills` | List (`?search=` `?limit=` `?offset=`) |
| GET | `/api/bills/next-number` | Next bill number (preview only) |
| GET | `/api/bills/:id` | Bill with line items |
| POST | `/api/bills` | Create bill + items |
| DELETE | `/api/bills/:id?force=true` | Delete a bill |

Deletes require `?force=true` because they destroy financial records. The UI
confirms with the user first, then sends it.

Every route except `/api/health` and `/api/auth/*` requires a signed-in
session and returns **401** without one.

---

## Interest formula

```
Interest = Principal × (Rate ÷ 100) × (Days ÷ 30)
```

Rate is rupees per ₹100 per month; one month is exactly 30 days. Loans use a
reducing balance — each payment clears outstanding interest first, then reduces
principal, and any shortfall is carried forward. See the README for detail.

---

## Navigation

| Page | Route |
|---|---|
| Dashboard | `/dashboard` |
| Calculator | `/calculator` |
| Customers | `/customers` |
| Add Customer | `/customers/new` |
| Customer Profile | `/customers/:id` |
| Payments & Dues | `/payments` |
| Bills | `/bills` |
| Create Bill | `/bills/new` |
| Bill Detail | `/bills/:id` |

---

## Phone number rules

Phone is the unique customer identifier, enforced three ways:

- a `UNIQUE` constraint on `customers.phone`
- an API check before insert, returning HTTP 409 with the existing customer
- the UI, which offers a link to that customer's profile

Numbers are normalised on save (spaces, dashes and brackets stripped) and must
be 10–15 digits.

---

## Troubleshooting

**"Cannot reach the server"**
The backend is not running. Start `start-server.bat` and check `server\.env`
has the right `DB_PASSWORD`.

**`npm` not recognised**
Use the `.bat` files — they add the bundled `nodejs\` folder to `PATH`. To run
npm by hand, prefix it: `..\nodejs\npm.cmd install`.

**PowerShell: "npm.ps1 cannot be loaded because running scripts is disabled"**

```
File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running
scripts is disabled on this system.
```

Windows blocks unsigned PowerShell scripts by default, and `npm` in PowerShell
resolves to the `npm.ps1` wrapper. Nothing is wrong with the project.

Call `npm.cmd` instead — it skips the PowerShell wrapper and needs no system
change:

```powershell
npm.cmd run set-password -- "your password here"
npm.cmd install
npm.cmd run build
```

Or just use **Command Prompt (cmd.exe)** rather than PowerShell, where plain
`npm` works.

Relaxing the execution policy machine-wide (`Set-ExecutionPolicy`) also works,
but it lowers a Windows security setting for every PowerShell script you ever
run — `npm.cmd` is the safer fix.

**PostgreSQL connection failed**
Check the PostgreSQL service is running in Windows Services, verify
`DB_PASSWORD`, and confirm the `rj_jewellers` database exists.

**Payments or bills fail with a database error**
Migrations are probably incomplete. Run `cd server && npm run migrate:status`,
then `npm run migrate`.

**A loan shows ₹0 outstanding but still reads "Active"**
It was settled under the older calculation, which only closed a loan at the
exact moment its principal hit zero. Run `cd server && npm run reconcile` to
list them, then `npm run reconcile -- --apply` to close them.
