<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

# LandTaxDispute — Backend (NestJS)

REST API for the Land Tax Valuation Dispute platform: dispute case management, client records,
comparable sales, AI-assisted valuation analysis, objection package generation, and the weekly
NSW Valuer General property sales (PSI) import.

**This README covers the backend only.** The frontend is a separate repository with its own README.

---

## 🎯 The goal of this document

> **This page is the complete local setup guide. If you follow it top to bottom, you will end up
> with the backend running on your own machine — no other document, no tribal knowledge, no "ask
> someone how it works" required.**
>
> By the last step you will have:
>
> - the API serving on **http://localhost:3011/api**
> - PostgreSQL and Redis running in Docker
> - every database table created and filled with realistic test data
> - a working login, verified through Swagger
>
> It is written for someone who has **never seen this project before**. Follow the steps in order
> and don't skip [step 4](#4-get-your-envdevelopment-file) — that's the one everybody gets stuck on.
>
> **Time needed:** roughly 30–45 minutes, most of it spent waiting on `npm install` and Docker
> image pulls.
>
> If you finish this guide and the app *still* doesn't run, that's a bug in this README — tell the
> team so it can be fixed for the next person.

---

## Table of contents

1. [Before you start](#1-before-you-start) — prerequisites
2. [Get the code](#2-get-the-code)
3. [Install dependencies](#3-install-dependencies)
4. [Get your `.env.development` file](#4-get-your-envdevelopment-file) ← **you must ask a teammate for this**
5. [Start Postgres + Redis](#5-start-postgres--redis-docker)
6. [Create the database tables (migrations)](#6-create-the-database-tables-migrations)
7. [Load test data (seed)](#7-load-test-data-seed)
8. [Run the app](#8-run-the-app)
9. [Verify it actually works](#9-verify-it-actually-works)
10. [Everyday commands](#everyday-commands)
11. [Environment variables reference](#environment-variables-reference)
12. [Project structure](#project-structure)
13. [Scheduled jobs](#scheduled-jobs--read-this-before-leaving-the-app-running) — **these send real email**
14. [Tests](#tests)
15. [Troubleshooting](#troubleshooting)
16. [Gotchas worth knowing](#gotchas-worth-knowing)
17. [Deployment](#deployment)
18. [Quick reference card](#quick-reference-card)

---

## 1. Before you start

Install these first. Every command below assumes they're on your PATH.

| Tool | Version | How to check | Where to get it |
| --- | --- | --- | --- |
| **Node.js** | **24.x** (the Docker image is `node:24-slim`) | `node -v` | [nodejs.org](https://nodejs.org) or `nvm install 24` |
| **npm** | 11.x (ships with Node 24) | `npm -v` | comes with Node |
| **Docker Desktop** | any recent | `docker -v` | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Git** | any recent | `git --version` | [git-scm.com](https://git-scm.com) |

Optional but recommended:

- **VS Code** with the ESLint + Prettier extensions
- A DB client — **pgAdmin comes bundled** in our `docker-compose.yml` (see step 5), or use DBeaver / TablePlus / DataGrip if you prefer

> **Windows users:** Docker Desktop needs WSL2 enabled. If Docker Desktop tells you to install
> WSL2, do that first and reboot — nothing else in this guide will work until Docker starts cleanly.

> **Do not skip Docker.** The app requires **both** Postgres *and* Redis running.
> Redis is not optional — the app reads `REDIS_HOST`/`REDIS_PORT` with `getOrThrow()` at
> startup and will crash without them.

---

## 2. Get the code

```bash
git clone https://github.com/YML-AIDev/LandTaxObjection-server.git
cd LandTaxObjection-server
```

> Yes — the GitHub repo is named `LandTaxObjection-server` while the npm package is
> `landtaxdispute-server`. Same project, historical naming. Don't let it confuse you.

If you already have the repo, just make sure you're up to date:

```bash
git checkout main
git pull
```

---

## 3. Install dependencies

```bash
npm install
```

**Expect this to take 3–10 minutes on a first run.** The project depends on `puppeteer`, which
downloads a full Chrome build (~150 MB) as part of `npm install`. That's normal — let it finish.

**Checkpoint** — a `node_modules/` folder now exists and `npm install` ended with no `ERR!` lines.

---

## 4. Get your `.env.development` file

**This is the step people get stuck on, so read it carefully.**

`.env.development` is **deliberately not in Git** (it's listed in [.gitignore](.gitignore)) because
it contains real credentials — Azure storage keys, the Anthropic API key, Microsoft Graph secrets,
and the FYI/XPM integration secrets. You cannot generate it yourself.

Here's what's actually in the repo after you clone, and why none of it is enough:

| File | In Git? | What it is |
| --- | --- | --- |
| `.env` | ✅ yes | A **blank template** — every key name with an empty value. Useful as a checklist of variable names. **Not a working config.** |
| `.env.development` | ❌ no | **The one you need.** Ask a teammate. |
| `.env.qa` | ❌ no | QA environment. Not for local use. |
| `.env.production` | ✅ yes | Encrypted with [dotenvx](https://dotenvx.com/encryption) — unreadable without the private key, and never used locally. |

### What to do

**Ask a backend teammate or your team lead for the `.env.development` file.** Message them
something like:

> Hi — I'm setting up `landtaxdispute-server` locally. Could you send me the current
> `.env.development` file? Thanks!

Send it over a private channel (Teams DM / 1Password / Keeper) — **never** paste it into a public
channel, a ticket, a PR, or an AI chat.

### Where to put it

Save it in the **root of the repo**, right next to `package.json`:

```
landtaxdispute-server/
├── .env.development   ← here
├── package.json
└── src/
```

The filename must be exactly `.env.development` — no `.txt`, no `copy` suffix. On Windows, make
sure File Explorer isn't hiding a `.txt` extension (View → Show → File name extensions).

### Sanity-check the file

Once you have it, open it and confirm these five lines match your **local** Docker setup — a
teammate's copy sometimes points at a shared DB by accident:

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=landtaxDisputeDb
```

And that Redis points at your local container:

```dotenv
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_TLS=false
```

Then make **one local change** — turn off the weekly PSI import cron so it doesn't fire while you
work (see [Gotchas](#gotchas-worth-knowing)):

```dotenv
# leave blank locally — defaults to Mondays 08:00 Sydney instead of every few minutes
PSI_IMPORT_CRON=
```

> If nobody is around to send you the file, you can still boot the app with the minimum set of
> variables — see [Environment variables reference](#environment-variables-reference) for a
> fill-in-the-blanks template. The app will start, but every AI, email, and Azure feature will fail
> at runtime. Get the real file when you can.

**Checkpoint** — `.env.development` exists in the repo root and `DB_HOST=localhost`.

---

## 5. Start Postgres + Redis (Docker)

From the repo root:

```bash
docker compose up -d
```

This starts three containers defined in [docker-compose.yml](docker-compose.yml):

| Service | Container | Port | What it's for |
| --- | --- | --- | --- |
| `postgres` | `nest_postgres` | `5432` | the application database (`landtaxDisputeDb`) |
| `redis` | `nest_redis` | `6379` | BullMQ job queues + caching — **required to boot** |
| `pgadmin` | `nest_pgadmin` | `5050` | web DB browser (optional, but handy) |

Confirm all three are up:

```bash
docker compose ps
```

You should see three containers with status `Up`.

### Using pgAdmin (optional)

Open <http://localhost:5050> and log in with:

- **Email:** `admin@example.com`
- **Password:** `admin`

The `Nest Postgres` server is pre-registered via [servers.json](servers.json). When it asks for the
server password, use `postgres`.

**Checkpoint** — `docker compose ps` shows `nest_postgres`, `nest_redis`, and `nest_pgadmin` as `Up`.

---

## 6. Create the database tables (migrations)

The database container starts **empty**. The app does **not** create tables on boot — there is no
`synchronize: true` anywhere, and that is intentional. You have to run the migrations yourself:

```bash
npm run migration:run
```

This runs every file in [src/database/migrations/](src/database/migrations/) in order (59+ of them
at the time of writing) and records them in a `typeorm_migrations` table.

You'll see a wall of `query: CREATE TABLE ...` output ending with something like:

```
Migration AddWarningToComparableSales1784300000000 has been executed successfully.
```

**Checkpoint** — in pgAdmin, `landtaxDisputeDb → Schemas → public → Tables` now lists tables such
as `users`, `clients`, `dispute_cases`, `comparable_sales`, `typeorm_migrations`.

---

## 7. Load test data (seed)

```bash
npm run seed:dev
```

This inserts users, land tax rates, sample clients, dispute cases, notifications, and the fixtures
the QA test scenarios rely on. See [src/database/seeds/seed.ts](src/database/seeds/seed.ts) for the
exact list.

It's **safe to re-run** — every seeder checks for existing rows before inserting.

### Your login credentials

All seeded users share the same password: **`Admin@123`**

| Email | Role |
| --- | --- |
| `pol.imbing@ymlgroup.com.au` | Accountant |
| `arvin.bermudez@ymlgroup.com.au` | Accountant |
| `april.clemente@ymlgroup.com.au` | Accountant |
| `avi.sharabi@ymlgroup.com.au` | Accountant |
| `yoav.lewis@ymlgroup.com.au` | Accountant |
| `landtaxdispute@ymlgroup.com.au` | Internal Assessor |

(Set `SEED_DEFAULT_PASSWORD` in your env file before seeding if you want a different one.)

**Checkpoint** — `SELECT email FROM users;` in pgAdmin returns six rows.

---

## 8. Run the app

```bash
npm run start:dev
```

This sets `NODE_ENV=development` (so your `.env.development` is loaded) and starts Nest in watch
mode — it recompiles and restarts whenever you save a `.ts` file.

Once the module map finishes logging, you should see:

```
Application is running on: http://localhost:3011
Swagger docs: http://localhost:3011/api/docs
```

> **Use `npm run start:dev` — not `npm run start`, and not `npm run start:local`.**
> Neither of those sets `NODE_ENV`. Nest then looks for a file literally named `.env.undefined`,
> finds nothing, falls back to the blank `.env`, and the app dies on startup with a Redis or
> database error. `start:dev` sets `NODE_ENV=development` for you via `cross-env`.
> See [Everyday commands](#everyday-commands) for what each script actually does.

---

## 9. Verify it actually works

Three quick checks. If all three pass, your setup is done.

### 9.1 Swagger loads

Open <http://localhost:3011/api/docs> in a browser. You should see the **LandTaxDispute API**
documentation page listing every endpoint grouped by tag (`auth`, `clients`, `dispute-cases`, …).

### 9.2 You can log in

In Swagger, expand **auth → POST /api/v1/auth/login**, click **Try it out**, and send:

```json
{
  "email": "pol.imbing@ymlgroup.com.au",
  "password": "Admin@123"
}
```

Expect **200 OK** with a user object in the body and an `access_token` httpOnly cookie set.

Or from the terminal:

```bash
curl -i -X POST http://localhost:3011/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"pol.imbing@ymlgroup.com.au\",\"password\":\"Admin@123\"}"
```

### 9.3 An authenticated endpoint returns data

Still in Swagger (the login above stored your cookie), call **GET /api/v1/auth/me** →
**200 OK** with your user profile.

**You're set up.** 🎉

### About the URL shape

Every route is `/{globalPrefix}/{version}/{path}`:

```
http://localhost:3011/api/v1/dispute-cases
                      └┬┘ └┬┘
                       │   └── URI versioning (@Controller({ version: '1' }))
                       └────── global prefix set in src/main.ts
```

So the base URL your frontend should point at is **`http://localhost:3011/api`**.

### Pointing a frontend at your local API

Set this in the frontend's own env file:

```dotenv
VITE_API_URL=http://localhost:3011/api
```

Two things must line up or every request fails:

- **CORS** — the frontend's origin must be listed in `CORS_WHITELIST`. `http://localhost:5173`
  (Vite's default) is already there. Any other port, add it and **restart the API** — env changes
  are only read at startup.
- **Cookies** — auth is an `httpOnly` cookie, so the frontend must send requests with credentials
  included, not an `Authorization` header.

---

## Everyday commands

### Running the app

| Command | What it does | When to use |
| --- | --- | --- |
| `npm run start:dev` | `NODE_ENV=development` + watch mode | **your default** — day-to-day development |
| `npm run start:test` | `NODE_ENV=development`, no watch | one-off run without auto-restart |
| `npm run start:debug` | watch mode + Node inspector on `9229` | attaching a debugger |
| `npm run build` | compiles TypeScript into `dist/` | before running `start` / `start:prod` |
| `npm run start` | runs `dist/main.js` — **no `NODE_ENV`** | verifying a production-style build |
| `npm run start:local` | watch mode — **no `NODE_ENV`** | ⚠️ don't use this; it can't load `.env.development` |

### Database

| Command | What it does |
| --- | --- |
| `npm run migration:run` | apply pending migrations |
| `npm run migration:revert` | roll back the most recent migration |
| `npm run migration:generate -- src/database/migrations/DescribeYourChange` | diff your entities against the DB and write a new migration |
| `npm run seed:dev` | (re)seed the development database |
| `npm run reset` | **destroys the DB volume**, recreates containers, migrates, and seeds — your "start over" button |

> `migration:generate` compares your **entity files** against the **live database**, so run
> `migration:run` first. Never hand-edit a migration that's already been merged to `main`.

### Docker

| Command | What it does |
| --- | --- |
| `docker compose up -d` | start Postgres, Redis, pgAdmin |
| `docker compose ps` | check what's running |
| `docker compose stop` | stop containers, **keep** the data |
| `docker compose down -v` | stop containers and **delete all data** |
| `npm run redis:start` | wipe and restart just Redis (clears stuck queue jobs) |
| `npm run redis:stop` | stop just Redis |

### Code quality

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint with `--fix` |
| `npm run format` | Prettier across `src/` and `test/` |
| `npm run test` | Jest unit tests |
| `npm run test:e2e` | end-to-end tests |
| `npm run test:cov` | tests with a coverage report |

### Optional local services

**Azurite** — a local emulator for Azure Blob Storage. You only need it if you're deliberately
testing against local blob storage; by default `.env.development` points at the shared Azure dev
storage account, so **you can skip this**.

```bash
docker run -p 10000:10000 mcr.microsoft.com/azure-storage/azurite
```

---

## Environment variables reference

`.env.development` is loaded automatically whenever `NODE_ENV=development`
(see [src/app.module.ts](src/app.module.ts#L17-L23) and
[src/database/data-source.ts](src/database/data-source.ts#L3-L5)). Values in `.env.development`
take precedence; `.env` is only a fallback of empty placeholder keys.

### Minimum set to boot the app

If you're waiting on the real file, these are the variables the app genuinely needs to *start*:

```dotenv
# --- Server ---
PORT=3011
CORS_WHITELIST=http://localhost:5173,http://localhost:3011

# --- Database (matches docker-compose.yml — safe to use as-is) ---
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=landtaxDisputeDb

# --- Redis (matches docker-compose.yml — required at startup) ---
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false

# --- Auth (any long random string works locally) ---
JWT_SECRET=change-me-to-something-long-and-random
JWT_EXPIRES_IN=1d
FRONTEND_URL=http://localhost:5173
```

### The rest — ask your team for the real values

Everything below is **feature-specific**. A missing value doesn't stop the app booting, but the
feature that uses it will throw as soon as you touch it. Never commit real values.

```dotenv
# --- Anthropic / AI (valuation analysis, objection reasons, PDF extraction) ---
ANTHROPIC_API_URL=<ask team>
ANTHROPIC_API_KEY=<ask team>

# --- Azure Blob Storage (case documents, generated PDFs) ---
AZURE_STORAGE_CONNECTION_STRING=<ask team>
AZURE_CONTAINER_NAME=<ask team>
AZURE_STORAGE_ACCOUNT_NAME=<ask team>
AZURE_STORAGE_ACCOUNT_KEY=<ask team>

# --- Azure Communication Services (outbound email) ---
AZURE_COMMUNICATION_CONNECTION_STRING=<ask team>
AZURE_COMMUNICATION_SENDER=<ask team>

# --- Microsoft Graph (monitors the VG reply mailbox) ---
GRAPH_TENANT_ID=<ask team>
GRAPH_CLIENT_ID=<ask team>
GRAPH_CLIENT_SECRET=<ask team>
GRAPH_MONITORED_MAILBOX=<ask team>
VG_SENDER_EMAILS=<ask team>
VG_EMAIL_POLL_CRON=

# --- FYI document management integration ---
FYI_BASE_URL=<ask team>
FYI_ACCESS_ID=<ask team>
FYI_ACCESS_SECRET=<ask team>
IS_FYI_PROD_ENABLED=false

# --- XPM (practice management) integration ---
XPM_APP_ID=<ask team>
XPM_APP_NAME=<ask team>
XPM_TENANT_ID=<ask team>
XPM_CODE=<ask team>
XPM_BASE_URL=<ask team>
XPM_SUBSCRIPTION_KEY=<ask team>

# --- Firm details used in generated documents & emails ---
FIRM_NAME=YML Advisory
CONTACT_EMAIL=<ask team>
VG_SUBMISSION_EMAIL=<your own email locally, so test submissions land in your inbox>

# --- MCP server (AI tool endpoints) ---
MCP_SECRET_TOKEN=dev-mcp-secret-change-me
MCP_PUBLIC_URL=

# --- NSW Valuer General weekly sales import ---
# LEAVE BLANK LOCALLY. Blank = Mondays 08:00 Australia/Sydney.
PSI_IMPORT_CRON=
```

| Group | Consumed by |
| --- | --- |
| `DB_*` | [src/config/typeorm.config.ts](src/config/typeorm.config.ts), [src/database/data-source.ts](src/database/data-source.ts) |
| `REDIS_*` | [src/config/redis.config.ts](src/config/redis.config.ts) — `getOrThrow`, so **required at boot** |
| `JWT_*`, `FRONTEND_URL` | [src/api/auth/](src/api/auth/) |
| `ANTHROPIC_*` | [src/ai/anthropic.service.ts](src/ai/anthropic.service.ts) and every AI feature |
| `AZURE_STORAGE_*` | document upload/download |
| `AZURE_COMMUNICATION_*`, `CONTACT_EMAIL` | [src/common/azure-email/](src/common/azure-email/) |
| `GRAPH_*` | [src/common/ms-graph/](src/common/ms-graph/) — VG mailbox monitoring |
| `PSI_IMPORT_CRON` | [src/api/psi-import/psi-import.task.ts](src/api/psi-import/psi-import.task.ts) |

---

## Project structure

```
src/
├── main.ts                  # bootstrap: CORS, global prefix "api", versioning, Swagger, filters
├── app.module.ts            # root module — config, TypeORM, throttler, scheduler, queues
├── api/                     # one folder per feature; each is a NestJS module
│   ├── auth/                #   login, JWT cookie, password reset, lockout
│   ├── clients/             #   client records
│   ├── dispute-cases/       #   the core domain — cases, statuses, VG submission
│   ├── comparables/         #   comparable sales analysis
│   ├── objection-package/   #   generated objection documents
│   ├── psi-import/          #   weekly NSW Valuer General sales import
│   └── ...
├── ai/                      # Anthropic client + prompt orchestration
├── skills/                  # markdown/Jinja prompt templates (copied to dist on build)
├── mcp/                     # MCP server exposing tools to AI clients
├── queue/                   # BullMQ root config
├── common/                  # filters, guards, middleware, Redis, email, MS Graph
├── config/                  # TypeORM / Redis / environment config factories
└── database/
    ├── data-source.ts       # TypeORM CLI datasource (migrations + seeds use this)
    ├── migrations/          # schema history — run with `npm run migration:run`
    ├── seeds/               # test data — run with `npm run seed:dev`
    └── scripts/             # one-off maintenance scripts
```

Each feature module follows the same shape: `*.module.ts`, `*.controller.ts`, `*.service.ts`,
`dto/`, `entities/`, `exceptions/`, plus `*.spec.ts` files next to what they test. Modules with
heavier query logic also add a `*.repository.ts`. When adding a new feature, copy the shape of an
existing module — [src/api/clients/](src/api/clients/) is a good small reference — rather than
inventing a new layout. Ask your lead for the backend conventions doc before your first PR.

### Conventions that will bite you on your first PR

- **Every route is `/api/v1/...`** — the global prefix and URI versioning are set in
  [src/main.ts](src/main.ts). A controller is declared as `@Controller({ path: 'clients', version: '1' })`.
- **Validation is strict and global.** `ValidationPipe` runs with `whitelist: true` **and**
  `forbidNonWhitelisted: true`. Any request property that isn't declared on the DTO returns
  **400**, it isn't silently dropped. If a request you're sure is valid gets rejected, the field is
  almost always missing from the DTO.
- **Auth is a cookie, not a header.** Login sets an `httpOnly` `access_token` cookie. Protect routes
  with `@UseGuards(JwtAuthGuard)`.
- **Rate limiting is on by default** — 100 requests/60s globally, tighter on auth routes.
- **Errors flow through global filters** — `DomainExceptionFilter` first, `AllExceptionsFilter` as
  the backstop. Throw an existing domain exception rather than a raw `HttpException` where one fits.
- **Never enable TypeORM `synchronize`.** Schema changes go through a migration, always.

---

## Scheduled jobs — read this before leaving the app running

Cron jobs register **at boot** and start ticking on your machine immediately. Several of them send
**real email** through Azure Communication Services and read a **real shared mailbox** via Microsoft
Graph. Nothing about running locally makes them safe by default.

| Job | Default schedule | Env override | What it does on your machine |
| --- | --- | --- | --- |
| **PSI import** | Mondays 08:00 Sydney | `PSI_IMPORT_CRON` | Launches Puppeteer, downloads NSW Valuer General bulk sales archives into `psi-downloads/`, imports them. **Heavy — minutes of CPU, hundreds of MB.** |
| **VG email monitor** | daily 22:00 UTC | `VG_EMAIL_POLL_CRON` | Polls the shared VG mailbox via MS Graph. |
| **VG follow-up** | daily 22:00 UTC | `VG_FOLLOWUP_CRON_SCHEDULE` | **Sends chase-up emails** for overdue VG responses. |
| **Approval reminder** | daily 22:00 UTC | `REMINDER_THRESHOLD_MINUTES` (threshold only) | **Sends approval reminder emails.** |
| **Hard-delete cleanup** | daily 02:00 UTC | `CLEANUP_CRON_SCHEDULE`, `CLEANUP_RETENTION_DAYS` | Permanently deletes soft-deleted records past the retention window. |

Recommended local settings in `.env.development`:

```dotenv
PSI_IMPORT_CRON=                                 # blank = weekly default, won't fire mid-workday
VG_SUBMISSION_EMAIL=your.name@ymlgroup.com.au    # test submissions land in YOUR inbox
```

⚠️ **Never point `VG_SUBMISSION_EMAIL` or `VG_SENDER_EMAILS` at real Valuer General or client
addresses while developing.** An accidental cron tick will actually send.

An invalid cron expression doesn't crash the app — it logs an error and falls back to the default.
So if a job seems to be ignoring your override, check the startup logs for a fallback warning.

---

## Tests

```bash
npm run test          # unit tests — *.spec.ts under src/
npm run test:watch    # watch mode
npm run test:cov      # coverage report → ./coverage
npm run test:e2e      # end-to-end — test/*.e2e-spec.ts
```

Unit tests live next to the code they cover (e.g.
[src/api/clients/clients.service.spec.ts](src/api/clients/clients.service.spec.ts)). Copy a nearby
spec for structure when writing your first one.

### QA smoke suite — a separate project

[test/qa-smoke/](test/qa-smoke/) is a standalone Puppeteer suite with its **own** `package.json` and
`node_modules`. It drives a **deployed QA environment through a real browser** — it does not test
your local server, and `npm install` at the repo root does not install its dependencies.

```bash
cd test/qa-smoke
npm install
cp .env.example .env    # then fill in the values
npm test
```

Credentials come from its own gitignored `.env` (see
[test/qa-smoke/.env.example](test/qa-smoke/.env.example)). **Never point it at a real user's
account** — use the dedicated throwaway QA accounts.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Error: connect ECONNREFUSED 127.0.0.1:5432` | Postgres isn't running | `docker compose up -d`, then `docker compose ps` |
| `[Redis] connection error: connect ECONNREFUSED ...:6379` | Redis isn't running | `docker compose up -d` — Redis is **not** optional |
| `Configuration key "REDIS_HOST" does not exist` | `.env.development` missing, misnamed, or not in the repo root | check step 4 — the file must sit next to `package.json` |
| `relation "users" does not exist` | migrations never ran | `npm run migration:run` |
| Login returns 401 with the seeded password | database never seeded | `npm run seed:dev` |
| `EADDRINUSE: address already in use :::3011` | another process (often an old `start:dev`) holds the port | Windows: `netstat -ano \| findstr :3011` then `taskkill /PID <pid> /F` · macOS/Linux: `lsof -ti:3011 \| xargs kill -9` |
| `Ports are not available: 5432` when starting Docker | a locally-installed Postgres already owns 5432 | stop the local Postgres service, or change the host-side port in `docker-compose.yml` **and** `DB_PORT` |
| `CORS blocked for origin: http://localhost:XXXX` | your frontend's origin isn't whitelisted | add it to `CORS_WHITELIST` in `.env.development` and restart |
| `400 Bad Request: property "x" should not exist` | global `ValidationPipe` uses `forbidNonWhitelisted` — undeclared properties are rejected, not ignored | add the field to the DTO (with its `class-validator` decorator), or stop sending it |
| `401 Unauthorized` on every endpoint | you never logged in — auth is a cookie | call `POST /api/v1/auth/login` first; Swagger keeps the cookie for later calls |
| `429 Too Many Requests` while testing login | rate limiter: 10 login attempts/min, 100 requests/min globally; repeated failures also lock the account briefly | wait 60 seconds — nothing is broken |
| `404` on a route you just added | missing prefix/version | the real path is `/api/v1/<your-route>` |
| App starts but every AI call 500s | `ANTHROPIC_API_KEY` empty | get the real `.env.development` (step 4) |
| `Could not find Chrome` from Puppeteer | you installed with `PUPPETEER_SKIP_DOWNLOAD=1` | `npx puppeteer browsers install chrome` |
| Migrations pass but the app can't see new columns | stale build output | stop the app, `npm run build`, restart |
| Everything is broken and you want a clean slate | — | `npm run reset` — **wipes the database**, then re-migrates and re-seeds |

Still stuck? Post in the team channel with (a) the command you ran, (b) the full error, and
(c) the output of `docker compose ps`.

---

## Gotchas worth knowing

**`npm run start` and `npm run start:local` are not the dev command.** Neither sets `NODE_ENV`, so
`.env.development` is never loaded and the app dies on startup. Use `npm run start:dev`.

**`ormlogs.log` grows without limit.** TypeORM is configured with `logging: true` and
`logger: 'file'` ([src/config/typeorm.config.ts](src/config/typeorm.config.ts)), so every query is
appended to `ormlogs.log` in the repo root. It can reach **gigabytes** in a few days. It's
gitignored and safe to delete any time:

```bash
rm ormlogs.log        # or: del ormlogs.log   (Windows cmd)
```

**Turn off the PSI cron locally.** `PSI_IMPORT_CRON` is sometimes left at `*/5 * * * *` in shared
copies of `.env.development`. That fires the NSW Valuer General import every five minutes, which
downloads large zip files into `psi-downloads/` and hammers your DB. Set it **blank** unless you're
actively working on that feature — and see [Scheduled jobs](#scheduled-jobs--read-this-before-leaving-the-app-running)
for the other four cron jobs that also start ticking the moment the app boots.

**`psi-downloads/` can get large.** It's the gitignored cache of NSW VG bulk sales archives. Delete
the whole folder any time you need the disk space; the import re-downloads what it needs.

**The app never auto-runs migrations.** `synchronize` is `false` everywhere. After pulling changes
that touch entities, run `npm run migration:run` — nothing will remind you.

**Two different TypeORM configs exist, on purpose.**
[data-source.ts](src/database/data-source.ts) (`src/**/*.ts`, used by the CLI for migrations and
seeds) and [typeorm.config.ts](src/config/typeorm.config.ts) (`dist/**/*.js`, used by the running
app). If a migration "works" from the CLI but the app disagrees, this is usually why — rebuild.

**Don't commit `.env.development`.** It's gitignored, but double-check with `git status` before you
commit. If you ever paste a secret into a PR, ticket, or chat, tell your lead immediately so the
credential can be rotated.

**Puppeteer downloads Chrome.** The first `npm install` pulls a ~150 MB browser build. On a slow or
proxied connection this may look like a hang — give it time before killing it.

---

## Deployment

Deployments run through GitHub Actions workflows in [.github/workflows/](.github/workflows/)
(Azure App Service for QA, Azure VM for QA and production). The
[Dockerfile](Dockerfile) builds a `node:24-slim` image with the Chrome system dependencies
Puppeteer needs. You don't need any of this to develop locally.

---

## Quick reference card

Once you've done the setup once, this is all you need.

```bash
# ---- one-time setup ----
git clone https://github.com/YML-AIDev/LandTaxObjection-server.git
cd LandTaxObjection-server
npm install
#   ↑ then put .env.development in this folder — ask a teammate (step 4)
docker compose up -d
npm run migration:run
npm run seed:dev

# ---- every day ----
docker compose up -d      # if Docker isn't already running
npm run start:dev

# ---- when local state is beyond saving ----
npm run reset             # ☢️ wipes the DB, re-migrates, re-seeds
```

| What | Where |
| --- | --- |
| API base URL | <http://localhost:3011/api> |
| Swagger UI | <http://localhost:3011/api/docs> |
| pgAdmin | <http://localhost:5050> — `admin@example.com` / `admin` |
| Login | `pol.imbing@ymlgroup.com.au` / `Admin@123` |
