# Sensoriqua

Web UI to configure and monitor sensors: filter objects by **Groups**, **Tags**, or **Sensor type** → select objects → pick sensors (input, state, or tracking) → set a display label and optional MIN/MAX thresholds → add to your list. View configured sensors with sparklines, add them to a **dashboard** with live values and threshold coloring, and open **history charts** (1–24 hours). Supports **Navixy App Connect** (per-user auth and DB credentials) and optional **export/import** of dashboard layout.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Prerequisites

- **Python 3.10+** (backend)
- **Node.js 18+** and npm (frontend)
- **PostgreSQL** with schemas `raw_business_data` and `raw_telematics_data` (or compatible schema/table layout; see [Schema](#schema))

## Quick start (local)

1. **Database**: Ensure PostgreSQL has `raw_business_data` and `raw_telematics_data` schemas. Create the app schema and tables:

   ```bash
   cd backend && source .venv/bin/activate  # or create venv first
   # Set DSN (or use .env, see below), then:
   psql "$SENSORIQUA_DSN" -f ../migrations/001_app_sensoriqua.sql
   psql "$SENSORIQUA_DSN" -f ../migrations/002_sensor_source.sql
   ```
   Or run `python run_migrations.py` from `backend/` (see [migrations/README.md](migrations/README.md)).

2. **Default DSN (gitignored)**  
   The default connection string is read from **`backend/.env`** (this file is in `.gitignore` and must **never** be committed). Copy from example and set your value:

   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env and set:
   # SENSORIQUA_DSN=postgresql://user:password@host:port/db?sslmode=require
   ```

3. **Backend**:

   ```bash
   cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000
   ```
   For production (or Render), use `./start.sh` or `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}` so the server binds to `0.0.0.0` and uses the `PORT` env var when set.

4. **Frontend**:

   ```bash
   cd frontend && npm install && npm run dev
   ```

5. Open the app. In **standalone** mode the backend uses the DSN from `.env`. When using **Navixy App Connect**, the middleware provides user and DB credentials; set `JWT_SECRET` in `backend/.env` and see [docs/NAVIXY_APP_CONNECT.md](docs/NAVIXY_APP_CONNECT.md).

**Deploy on Render:** One Web Service serves both API and GUI at the same URL. The built frontend is in `backend/static/`. See [docs/RENDER.md](docs/RENDER.md). After changing the frontend, run `cd frontend && npm run build && cp -r dist/* ../backend/static/` and commit `backend/static/`.

**Embedding in an iframe:** The app allows iframe embedding by default. To restrict parent origins, set **ALLOW_FRAME_ORIGINS**; to disable embedding set `ALLOW_FRAME_ORIGINS=deny`. See [docs/RENDER.md](docs/RENDER.md#embedding-in-an-iframe).

## Features

### Left panel — Filter and configure

- **Step 1 – Filter by grouping:** Choose **Group**, **Tag**, or **Sensor type**. Multi-select items; objects matching any selection appear in Step 2. Leave all empty to see all objects. Search within each grouping.
- **Step 2 – Objects:** List shows objects (with optional group/tag/department labels). Toggle view: flat list, by group, or by tag. Search by object label; select one or more objects.
- **Step 3 – Sensors:** For each selected object, pick one or more sensors. Sensors come from:
  - **Input** — `raw_telematics_data.inputs` (sensor_name)
  - **State** — `raw_telematics_data.states` (state_name)
  - **Tracking** — `raw_telematics_data.tracking_data_core` (e.g. latitude, longitude, speed, altitude)
  Open the config popup to set a **display label** and optional **MIN/MAX thresholds**, then **Add to configured list**.

### Configured sensors (center)

- List of configured sensors with object label, custom label, and **1-hour sparkline**. Optional MIN/MAX shown on sparkline.
- **Edit** — change label or thresholds.
- **Add to dashboard** — add the sensor to the right-hand dashboard.
- **Remove** — remove from configured list (soft delete).
- If the backend returns an error when saving (e.g. app state DB unavailable), the app **switches to browser storage** for that session: configured list and dashboard are kept in **localStorage** (tagline shows “Saved in this browser”). Sparklines and latest values still use the API with the current list.

### Dashboard (right)

- Panels for each added sensor: **object label**, **sensor label**, **latest value**, **timestamp**, and a sparkline. Values are **green** when within MIN/MAX, **red** when outside.
- **Update interval:** 30 sec, 1 min, or 5 min (configurable).
- **Click a panel** to open a **history chart** (1, 4, 12, or 24 hours).
- **Remove** a panel from the dashboard (sensor stays in configured list).
- **Export** — download the current dashboard layout as JSON (plane IDs and order).
- **Import** — load a dashboard from a previously exported JSON file (replaces current dashboard panels with the same configured_sensor_ids where applicable).

### Auth and data source

- **Standalone:** Backend uses `SENSORIQUA_DSN` from `.env`. Optional `X-Sensoriqua-DSN` header for per-request override (e.g. testing).
- **Navixy App Connect:** Set `JWT_SECRET` (min 32 chars). Middleware calls `POST /api/auth/login` with user and DB URLs; the app returns a JWT and uses **iotDbUrl** (telematics) and **userDbUrl** (app state) per user. All other `/api/*` routes require `Authorization: Bearer <token>`. See [docs/NAVIXY_APP_CONNECT.md](docs/NAVIXY_APP_CONNECT.md).

## Schema

- **app_sensoriqua.configured_sensors**: user_id, object_id, device_id, sensor_input_label, **sensor_source** (input | state | tracking), sensor_id, sensor_label_custom, min_threshold, max_threshold, is_active, created_at, updated_at.
- **app_sensoriqua.dashboard_planes**: user_id, configured_sensor_id, position_index.

**Telematics data (read-only):**

- **raw_telematics_data.inputs** — device_id, device_time, sensor_name, value (used for sparklines and latest values when sensor_source = input).
- **raw_telematics_data.states** — device_id, device_time, state_name, value (sensor_source = state).
- **raw_telematics_data.tracking_data_core** — device_id, device_time, plus value columns (e.g. latitude, longitude, speed, altitude; sensor_source = tracking).

**App state** (configured_sensors, dashboard_planes): When using Navixy, **userDbUrl** is used per user. Otherwise the backend uses **SQLite** at `backend/sensoriqua_state.db` by default (no migrations required). You can override with **SENSORIQUA_APP_STATE_DSN** (e.g. `sqlite:///./sensoriqua_state.db`). If the backend cannot persist app state (e.g. 503), the frontend **falls back to localStorage** for the configured-sensors list and dashboard for that browser session (see “Saved in this browser” in the UI).

## Schema alignment

- **tag_links**: `entity_type` is an **integer**. The app uses `SENSORIQUA_TAG_ENTITY_TYPE_OBJECT` (default `1`) for the object/tracker entity type. Set this in `.env` if your platform uses a different code.
- **Objects** can also be filtered by **department_ids** and **garage_ids** (API supports them; UI grouping tabs are Groups, Tags, Sensor type).
- **garages**: Label is taken from `organization_label` (schema has no `garage_label`).
- **description_parametrs**: Lookup table (`key`, `type`, `description`) used to resolve e.g. `units_type` to a human-readable label for sensors. Table name in schema is `description_parametrs` (typo).

## Security

- **Secrets:** Keep `backend/.env` out of version control. Do not commit DSN or credentials.
- **Production:** With Navixy, use **CORS_ORIGINS** for your frontend origin(s). Do not rely on client-supplied DSN for untrusted users; with JWT_SECRET set, the app uses only credentials from the auth service per user.
- For a full safety and security review (auth, CORS, SSRF, headers, SQL), see [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and pull request guidelines.

## License

This project is licensed under the [MIT License](LICENSE).
