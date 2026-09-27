# MeetingMeter — Railway Deployment Plan

**Artifact:** `DEPLOYMENT-PLAN-MeetingMeter-v1.0.md`  
**Version:** 1.0  
**Status:** DRAFT / PRE-DEPLOYMENT VERIFICATION  
**Target Platform:** Railway (Railway.app)  
**Architecture:** Single-Service Full-Stack Web Application (Express 5 + React 19 SPA + SQLite WAL)  

---

## 1. Executive Summary & Architectural Assessment

MeetingMeter is architected as a **unified, self-contained single-service application**:
- **Backend:** Express 5 HTTP REST API with JWT authentication, server-authoritative interval calculation engine, and direct embedded SQLite persistence (`better-sqlite3`).
- **Frontend:** React 19 SPA built via Vite with Tailwind CSS, served directly as static production assets by the Express backend.
- **Client-Side Routing:** Express wildcard route handler proxies all non-API paths to `dist/client/index.html` (supporting HTML5 History API).
- **Deployment Capability:** Can be deployed **directly to Railway as a single web service** with **one persistent volume** attached for database durability. No separate backend/frontend services, Redis, or external database instances (e.g. Postgres) are required.

---

## 2. Core Deployment Specifications

| Specification Area | Railway Requirement & Value | Status / Implementation Details |
| :--- | :--- | :--- |
| **Service Type** | Single Web Service (Node.js Nixpacks / Dockerless) | Supported natively by Railway |
| **Production Build Command** | `npm run build` | Compiles Vite React 19 frontend into `dist/client/` |
| **Production Start Command** | `npm start` (`tsx src/server/server.ts`) | Launches Express 5 server; serves API and static UI |
| **Node Version** | `node >= 20.0.0` (Recommended: Node 20 LTS or 22 LTS) | Specified in `package.json` `"engines"` field |
| **Package Manager** | `npm` | Standard `package-lock.json` lockfile |
| **Healthcheck Endpoint** | `/api/health` | Returns `{"status":"ok", ...}` with HTTP 200 |
| **Persistent Volume** | Mount Path: `/data` | Required for SQLite WAL database persistence |
| **SQLite DB Location** | `/data/meetingmeter.sqlite` | Configured via `DATABASE_PATH` environment variable |
| **Database Initialization** | Automated & Self-Healing (`src/server/db/database.ts`) | Runs `schema.sql` idempotently on boot |
| **CORS / Origin** | Same-Origin (Internal) + Permissive fallback (`cors()`) | Frontend and API share exact origin; no CORS blockers |

---

## 3. Environment Variables & Configuration

Configure the following environment variables in the Railway Service **Variables** tab:

### 3.1 Required Production Variables

| Variable Name | Required | Recommended Value / Format | Purpose |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | **Yes** | `production` | Enables production optimizations in Express and dependencies |
| `PORT` | Auto | *(Automatically injected by Railway router)* | Express listens on `process.env.PORT \|\| 3000` |
| `DATABASE_PATH` | **Yes** | `/data/meetingmeter.sqlite` | Points SQLite to the persistent Railway volume mount |
| `JWT_SECRET` | **Yes** | *(High-entropy 64-char random hex string)* | Signs and verifies user session JWT bearer tokens |

> [!IMPORTANT]
> Generate a strong production `JWT_SECRET` before deploying (e.g. `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`). Never use the fallback development secret in production.

---

## 4. Persistent Volume Setup (SQLite WAL Mode)

Railway containers have ephemeral filesystems by default. Without a persistent volume, database records would reset on every redeployment or restart.

### 4.1 Volume Configuration Steps
1. In the Railway project dashboard, navigate to the **MeetingMeter** service.
2. Click **Add Volume** (or **Volumes** tab).
3. Set the **Mount Path** to:
   ```text
   /data
   ```
4. Set the Volume Size (e.g., `1 GB` or `5 GB` minimum is more than sufficient for thousands of meeting sessions).
5. Set `DATABASE_PATH=/data/meetingmeter.sqlite` in the Service Variables.

### 4.2 SQLite WAL & Concurrency Handling
- The server automatically activates SQLite WAL mode (`PRAGMA journal_mode = WAL;`) and enables foreign keys (`PRAGMA foreign_keys = ON;`).
- Directory creation is automated: `src/server/db/database.ts` automatically executes `fs.mkdirSync(path.dirname(dbPath), { recursive: true })` before initializing SQLite.
- Schema creation is idempotent: `schema.sql` uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.

---

## 5. Health Check & Routing Configuration

### 5.1 Railway Healthcheck Settings
- **Healthcheck Path:** `/api/health`
- **Success Criteria:** HTTP Status `200 OK`
- **Healthcheck Response Payload:**
  ```json
  {
    "status": "ok",
    "service": "MeetingMeter API",
    "timestamp": "2026-09-27T22:15:00.000Z"
  }
  ```
- **Healthcheck Timeout:** `120 seconds` (allows ample time for cold start / initial container boot).

### 5.2 SPA Routing & Static Asset Handling
- Built assets reside in `dist/client/`.
- Express serves static files from `dist/client/`.
- Non-API routes (`/*`) fall through to `dist/client/index.html` to support deep linking in React Router (`/`, `/cockpit`, `/roster`, `/history`, `/meter/:id`, `/receipt/:id`).
- API routes (`/api/*`) return JSON `404 Endpoint not found` if unmatched.

---

## 6. Railway Step-by-Step Deployment Guide

### Option A: Deploy via GitHub Repository (Recommended)
1. **Initialize Git & Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "feat: initial MeetingMeter v1.0 release"
   git remote add origin https://github.com/<org-or-user>/meetingmeter.git
   git branch -M main
   git push -u origin main
   ```
2. **Create Project in Railway:**
   - Log into [Railway.app](https://railway.app).
   - Click **+ New Project** → **Deploy from GitHub repo**.
   - Select the `meetingmeter` repository.
3. **Add Persistent Volume:**
   - Go to Service Settings → **Volumes**.
   - Click **Add Volume**, set Mount Path to `/data`.
4. **Configure Environment Variables:**
   - Go to the **Variables** tab and set:
     - `NODE_ENV=production`
     - `DATABASE_PATH=/data/meetingmeter.sqlite`
     - `JWT_SECRET=<generated_64_char_secret>`
5. **Set Healthcheck Path:**
   - Go to Service **Settings** → **Deploy**.
   - Set **Healthcheck Path** to `/api/health`.
6. **Generate Domain:**
   - Go to Service **Settings** → **Networking** → Click **Generate Domain** (e.g. `meetingmeter.up.railway.app`).
7. **Deploy:**
   - Railway will trigger the build (`npm run build`), launch the server (`npm start`), and transition the deployment to Active upon a healthy `/api/health` response.

---

## 7. Pre-Flight Verification Checklist

Before triggering production deployment, verify the following:

- [x] **Production build test:** `npm run build` succeeds locally with 0 errors.
- [x] **Test suite integrity:** Vitest backend tests (7/7) pass cleanly.
- [x] **Browser E2E test suite:** Playwright tests (4/4) pass cleanly across Desktop, Tablet, Mobile, and Select All flows.
- [x] **Dependencies:** `tsx` is included in `dependencies` in `package.json` so production launch succeeds.
- [x] **Node Engine:** `"engines": { "node": ">=20.0.0" }` is specified in `package.json`.
- [x] **Git Ignore:** `.gitignore` excludes `node_modules`, `dist`, `data`, `.env`, and local test artifacts.
- [x] **Database Safety:** `src/server/db/database.ts` handles custom volume mount paths with automatic parent directory creation.
- [x] **Health Check:** `/api/health` is registered and returns HTTP 200.

---

## 8. Rollback & Troubleshooting Reference

| Symptom | Probable Cause | Corrective Action |
| :--- | :--- | :--- |
| **502 Bad Gateway / Application Failed to Respond** | Server crashed or port binding mismatch | Check Railway Deploy Logs. Ensure server binds to `process.env.PORT` (implemented in `src/server/server.ts`). |
| **Data resets on redeploy** | Volume not mounted or `DATABASE_PATH` misconfigured | Ensure a volume is attached at `/data` and `DATABASE_PATH=/data/meetingmeter.sqlite` is set in Variables. |
| **Healthcheck fails / times out** | Initial compilation or slow container spin-up | Increase Healthcheck Timeout in Railway settings to 180s. Verify `/api/health` returns 200. |
| **Static files 404 / blank screen** | Frontend build did not run during deployment | Verify Railway build command is `npm run build` and `dist/client/index.html` exists. |
| **JWT verification errors** | `JWT_SECRET` changed across container restarts | Ensure `JWT_SECRET` is set in Railway Variables and not randomly generated on boot. |

---

*End of DEPLOYMENT-PLAN-MeetingMeter-v1.0.md*
