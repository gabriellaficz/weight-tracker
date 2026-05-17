# AGENTS.md

## Purpose and Operating Model

This repository is intended to be operated **entirely by Codex‑CLI** on a live Ubuntu 24.04 server. The human user has **no software development or Git knowledge** and interacts only by:

- Describing desired behaviour in plain language
- Opening a browser and visiting URLs Codex provides
- Giving feedback on whether things look correct

Codex is responsible for **all** engineering, Git operations, deployment, testing, documentation, and rollback decisions, in line with this file.

Codex must assume the user behaves like an excited child: approval is often *implicit* (they move on to the next idea). Codex must therefore make safe, conservative decisions without requiring the user to understand tooling.

This file is the **single source of truth** for how the system is built and operated. Codex must keep it rigorously up to date whenever reality changes.

---

## Host Environment

- OS: **Ubuntu 24.04 LTS**
- User: `ubuntu`
- Codex runs as `ubuntu` with **passwordless sudo**
- Server type: AWS Lightsail (1 GB RAM, 2 vCPU, \~40 GB SSD)
- Swap: Codex should configure \~10 GB swap early if not present

Codex works **directly on the live production machine**. There is no staging environment.

---

## Repository Discovery

At startup, Codex must:

1. Identify the active repository for the current task.
2. Record known Git-controlled repositories under `~` in this file.

If Codex ever adds additional repositories or relocates the main repo, it must update this section.

**Active repository:** `/home/ubuntu/weight-tracker` (weight-tracker)

Known repositories under `/home/ubuntu`:

- `/home/ubuntu/weight-tracker` (production BMI tracker)
- `/home/ubuntu/11plus` (new app scaffold on `11plus.appx.ro`)
- `/home/ubuntu/platform-infra` (shared templates/scripts/runbooks for multi-app systemd + Nginx onboarding)

---

## Git and Branching Rules

The user does not understand Git. Codex manages everything.

### Branching

- `main` is always the last **approved** version
- All work happens on temporary branches named:

```
wip/YYYY‑MM‑DD‑<short‑slug>
```

Where `<short‑slug>` briefly describes the change (e.g. `login‑screen`, `todo‑list`).

### Commits

- Codex must commit and push **after every meaningful change or conversation turn**
- Commits go to the current `wip/*` branch

### Merging (User Approval)

Codex should merge the current WIP branch into `main` when:

- The user explicitly says the change is OK, **or**
- The user starts asking for new features without objecting to the current behaviour

This *implied assent* is the default case.

### Rollback

- If the user expresses dissatisfaction, Codex should:
  - Explain briefly what went wrong
  - Revert to the last `main` commit
  - Redeploy immediately

---

## Web Stack

- Framework: **Express 4.19** (server-rendered HTML)
- Database: **SQLite** via `sqlite` + `sqlite3` packages
- Tests: **node:test** + `supertest`

**Node version (currently deployed):** **Node.js v24.12.0** (`/home/ubuntu/.nvm/versions/node/v24.12.0/bin/node`)

Package manager: **npm**

App entrypoints:

- `src/server.js` (HTTP server)
- `src/app.js` (Express app + routes)

Commands:

- `npm start` (run server)
- `npm test` (light tests)

---

## Process Management and Networking

### Process Manager

- Use **systemd** to run the app as a service
- The service must:
  - Start on boot
  - Restart on failure
  - Run as `ubuntu`
- Active service: `weight-tracker.service`
- Runtime environment:
  - `PORT=3000`
  - `APP_DATA_DIR=/home/ubuntu/app_data`
  - `COOKIE_SECURE=true`
  - `EnvironmentFile=/home/ubuntu/app_data/secrets.env`

### Reverse Proxy

- Use **Nginx**
- The user must be able to access the app via:

```
http://<IP>/...
https://<subdomain>/...
```

**No port numbers** may be required in URLs that users see.

Codex may test the server directly (bypassing Nginx) if needed for testing purposes, but in general should perform tests via Nginx as well.

Codex must ensure:

- All routing uses **relative URLs** because domain may change
- Domain name changes do not require code changes

---

## Domain + TLS Setup

The app uses HTTPS via Let’s Encrypt and Nginx, with automatic renewal enabled.

**Active subdomain:** bmi.appx.ro

---

## Persistent Data and Secrets

All non‑code state lives **outside the repo**.

### Location

```
~/app_data/
  └── weight-tracker/
      ├── secrets.env
      └── app.sqlite
```

- `secrets.env`: all passwords, API keys, tokens (per-app subfolder)
- `app.sqlite`: SQLite database file (per-app subfolder)

Nothing secret may be committed to Git.

### Backup

Codex must be able to create a **single‑file backup** after each commit to main:

```
~/app_backup.tgz
```

Containing the entire `app_data/` directory.

Restore must be documented and trivial (untar + restart service).
Current restore command:

```
sudo systemctl restart weight-tracker.service
```

---

## Database

- Use **SQLite** as the default database choice unless explicitly instructed otherwise
- Schema migrations must be:
  - Versioned
  - Documented
  - Tested

If the schema changes, Codex must:

- Run heavy tests
- Explain the change to the user in simple terms

---

## Testing Strategy

The user does not understand testing. Codex is fully responsible.

### Light Tests (Mandatory)

- Run on **every change**
- Must complete in **< 60 seconds**
- Cover:
  - Infrastructure / framework basic functioning
  - Core routes
  - Basic user flows
  - Database read/write sanity

### Heavy Tests

- Run only when:
  - Database schema changes
  - Authentication/permissions change
  - Core routing or data models change

Heavy tests may take longer but must be justified in chat.

Codex must:

- Maintain the test suite
- Add tests whenever new behaviour is added
- Always run the appropriate tests before concluding a task

---

## Live Verification

Before declaring any task complete, Codex must:

1. Start or reload the running service
2. Access the app via `localhost`
3. Access the app via the public URL
4. Confirm expected behaviour matches the user request

Codex must then explicitly ask the user to **check the app in their browser** and describe if the changes are acceptable.

---

## Documentation Discipline

Codex must keep documentation continuously in sync:

- This file (`AGENTS.md`)
- Any framework‑specific README or docs
- Test descriptions
- Setup and recovery steps

If Codex changes reality and does not update documentation, that is a failure.

---

## First Task for Codex

Before writing significant code, Codex must:

1. Ask the user (max **3 rounds of Q&A**):
   - What do you want to do?
   - Who is it for?
   - What should the app remember?
2. Produce a **minimal working app** as fast as possible
3. Give the user a **URL they can open immediately**

Speed to visible results is more important than polish.
