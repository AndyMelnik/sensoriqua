# Deploying Sensoriqua on Render.com

Sensoriqua is a **single application**: one Web Service serves both the **API** and the **GUI** at the same URL. The frontend is built from source during deploy (see `render.yaml`); `backend/static/` is populated by the build.

**Data source:** When using **Navixy App Connect**, the database connection (iotDbUrl) is provided by the Navixy auth service per user at login. You do **not** need Render Postgres or any shared database for telematics data.

**Deploy readiness:** Ensure `frontend/package-lock.json` exists (required for `npm ci`). The build runs `cd frontend && npm ci && npm run build && cp -r dist/* ../backend/static/` then `cd ../backend && pip install -r requirements.txt`.

---

## Redeploy to latest commit

After you push to the connected branch (e.g. `main`):

1. **Auto-deploy (default):** If auto-deploy is enabled, Render deploys automatically. Check the [Render Dashboard](https://dashboard.render.com/) → your service → **Events** to see the deploy status.
2. **Manual redeploy:** In the Render Dashboard → your service → **Manual Deploy** → **Deploy latest commit**. This rebuilds both frontend and backend from the latest code.
3. **Verify:** The single Web Service builds the frontend and backend together. One deploy updates both. After deploy, the GUI at `/` and API at `/api/*` serve the latest version.

---

## 1. Single Web Service (API + GUI)

### Option A: Use the Blueprint (render.yaml)

1. In [Render Dashboard](https://dashboard.render.com/), click **New → Blueprint**.
2. Connect your repo and select the Sensoriqua repository.
3. Render will pick up `render.yaml` and create a Web Service.
4. Add **Environment Variables** (e.g. **JWT_SECRET** for Navixy, **CORS_ORIGINS**, **SENSORIQUA_DSN** if standalone).
5. Deploy. One URL serves the **GUI** at `/` and the **API** at `/api/*` and `/docs`.

### Option B: Create the Web Service manually

1. **New → Web Service**; connect your repo.
2. **Settings:**
   - **Root Directory:** leave empty
   - **Build Command:** `cd frontend && npm ci && npm run build && cp -r dist/* ../backend/static/ && cd ../backend && pip install -r requirements.txt`
   - **Start Command:** `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. **Environment:** Add `JWT_SECRET` (for Navixy) and/or `SENSORIQUA_DSN` (standalone), **CORS_ORIGINS** if needed. The blueprint sets `SENSORIQUA_APP_STATE_DSN=sqlite:///./sensoriqua_state.db` so configured sensors and dashboard work without Postgres migrations.
4. Deploy. The same URL serves the GUI (/) and the API (/api/*, /docs). The frontend is built from source on each deploy, so GUI changes in the repo are included automatically.

**If the build fails** (e.g. Node not available in the build environment): use Build Command `cd backend && pip install -r requirements.txt` and commit the built frontend before deploy: run `cd frontend && npm run build && cp -r dist/* ../backend/static/` locally, then commit `backend/static/`.

### Embedding in an iframe

The app allows iframe embedding by default (`Content-Security-Policy: frame-ancestors *`), so it can run inside a parent page (e.g. Navixy) without any env var.

To restrict which sites may embed the app, set **ALLOW_FRAME_ORIGINS** to comma-separated origins, e.g. `https://app.navixy.com,https://your-portal.com`. To disable embedding, set `ALLOW_FRAME_ORIGINS=deny` (sends `X-Frame-Options: DENY`).

### App state and database

- **With Navixy App Connect:** Telematics use **iotDbUrl** and app state (configured sensors, dashboard) use **userDbUrl** from the auth service. No Render Postgres required. If using Postgres for app state (userDbUrl), run `migrations/003_multiplier.sql` once to add the multiplier column.
- **Standalone:** Set **SENSORIQUA_DSN** to your PostgreSQL for telematics. App state uses **SQLite** at `backend/sensoriqua_state.db` by default (no migrations needed). The blueprint sets **SENSORIQUA_APP_STATE_DSN** so import/configured sensors work on Render. SQLite auto-migrates the multiplier column. *Note: Render's default filesystem is ephemeral; SQLite data is lost on restart. For persistence, add a [Persistent Disk](https://render.com/docs/disks) or use Postgres for app state.*
- **When app state is unavailable (e.g. 503):** The frontend falls back to **localStorage** for the configured-sensors list and dashboard in that browser; the UI shows “Saved in this browser.”

---

## 2. Optional: Separate frontend (Static Site)

If you prefer a separate frontend deployment (e.g. different domain), create a **Static Site** with Root Directory `frontend`, Build Command `npm install && npm run build`, Publish Directory `dist`, and set **VITE_API_URL** to your backend URL. The default single Web Service already serves the GUI at `/`, so a separate frontend is optional.

---

## 3. Summary (single app)

| Item   | Web Service (API + GUI) |
|--------|--------------------------|
| Root   | (empty)                  |
| Build  | `cd frontend && npm ci && npm run build && cp -r dist/* ../backend/static/ && cd ../backend && pip install -r requirements.txt` |
| Start  | `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| GUI    | Built from `frontend/` during deploy → `backend/static/`; served at `/` |
| Env    | `JWT_SECRET`, `CORS_ORIGINS`, `SENSORIQUA_DSN`, `ALLOW_FRAME_ORIGINS` (for iframe embedding) as needed |

---

## 4. Session and data isolation (Navixy)

When **JWT_SECRET** is set (Navixy App Connect enabled):

- Every `/api/*` request (except **POST /api/auth/login**) must send a valid **Authorization: Bearer &lt;token&gt;**.
- The backend uses **only** the DSN (iotDbUrl/userDbUrl) stored for that token’s user at login. It does not use `X-Sensoriqua-DSN` or any default DSN for those requests.
- Different browser sessions (different users or same user in different browsers) have different tokens and therefore different credentials; there is no cross-user data access.

## 5. Free tier notes

- **Spindown:** Free Web Services spin down after inactivity; the first request after idle can be slow (cold start).
- **Database:** With Navixy, data comes from iotDbUrl/userDbUrl per user; no Render Postgres is required for that. For standalone mode, use your own PostgreSQL and run migrations as needed.
