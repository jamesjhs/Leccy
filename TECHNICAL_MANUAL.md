# Leccy — EV Cost Tracker v1.1.1: Technical Manual

## Architecture Overview

Leccy is a full-stack TypeScript application composed of:

- **Backend:** Node.js + Express REST API with better-sqlite3 (synchronous SQLite)
- **Frontend:** React SPA with Vite, React Router v6, Tailwind CSS, Recharts
- **Database:** SQLite3 (single file, stored at `DB_PATH`)
- **Auth:** JWT Bearer token (stored in `localStorage` on client; sent via `Authorization: Bearer` header)

```
┌─────────────────────────────────────┐
│  Client (React/Vite - port 5173)    │
│  ├── src/App.tsx (Router + Auth)    │
│  ├── src/pages/*                    │
│  ├── src/components/*               │
│  ├── src/hooks/useAuth.ts           │
│  └── src/utils/api.ts (Axios)       │
└─────────────┬───────────────────────┘
              │ HTTP /api/*
┌─────────────▼───────────────────────┐
│  Server (Express - port 2030)       │
│  ├── src/index.ts (app entry)       │
│  ├── src/routes/*                   │
│  ├── src/middleware/auth.ts         │
│  ├── src/db/database.ts (SQLite)    │
│  └── src/types/index.ts             │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│  SQLite DB (data/leccy.db)          │
└─────────────────────────────────────┘
```

---

## Database Schema

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `licence_plate` | TEXT UNIQUE | Stored uppercase |
| `password_hash` | TEXT | bcryptjs, saltRounds: 12 |
| `is_admin` | INTEGER | 0 or 1 |
| `email` | TEXT | Nullable |
| `created_at` | TEXT | ISO datetime |

### `charging_sessions`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK | → users.id CASCADE |
| `odometer_miles` | REAL | |
| `initial_battery_pct` | REAL | 0–100 |
| `initial_range_miles` | REAL | |
| `final_battery_pct` | REAL | 0–100 |
| `final_range_miles` | REAL | |
| `air_temp_celsius` | REAL | |
| `date_unplugged` | TEXT | ISO date (YYYY-MM-DD) |
| `created_at` | TEXT | ISO datetime |

### `charger_costs`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `session_id` | INTEGER FK | → charging_sessions.id CASCADE |
| `user_id` | INTEGER FK | → users.id CASCADE |
| `energy_kwh` | REAL | |
| `price_pence` | INTEGER | Stored as integer pence |
| `charger_type` | TEXT | `'home'` or `'public'` |
| `charger_name` | TEXT | Nullable |
| `created_at` | TEXT | ISO datetime |

### `maintenance_log`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK | → users.id CASCADE |
| `description` | TEXT | |
| `log_date` | TEXT | ISO date |
| `cost_pence` | INTEGER | Nullable |
| `created_at` | TEXT | |

### `tariff_config`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK | → users.id CASCADE |
| `tariff_name` | TEXT | |
| `rate_pence_per_kwh` | REAL | Pence per kWh |
| `standing_charge_pence` | REAL | Pence per day |
| `effective_from` | TEXT | ISO date |
| `created_at` | TEXT | |

### `app_settings`
| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | |
| `value` | TEXT | |

### `admin_2fa`
| Column | Type | Notes |
|---|---|---|
| `admin_id` | INTEGER PK FK | → users.id |
| `email` | TEXT | |
| `enabled` | INTEGER | 0 or 1 |
| `secret` | TEXT | Nullable, temporary code |

---

## API Reference

### Authentication — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/login` | No | Login with licence_plate + password. Returns JWT. |
| POST | `/logout` | No | Client-side token removal; invalidates session. |
| GET | `/me` | Yes | Return current user info. |
| GET | `/version` | No | Return APP_VERSION. |

### Sessions — `/api/sessions`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | List all sessions for current user. |
| POST | `/` | Yes | Create a new charging session. |
| DELETE | `/:id` | Yes | Delete a session (own or admin). |

**POST body:**
```json
{
  "odometer_miles": 12500,
  "initial_battery_pct": 20,
  "initial_range_miles": 53,
  "final_battery_pct": 90,
  "final_range_miles": 238,
  "air_temp_celsius": 12.5,
  "date_unplugged": "2024-03-15"
}
```

### Charger Costs — `/api/charger`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | List all charger costs for user. |
| POST | `/` | Yes | Create a charger cost entry. |
| DELETE | `/:id` | Yes | Delete a charger cost. |

**POST body:**
```json
{
  "session_id": 1,
  "energy_kwh": 38.5,
  "price_pence": 1155,
  "charger_type": "home",
  "charger_name": null
}
```

### Maintenance — `/api/maintenance`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | List maintenance entries. |
| POST | `/` | Yes | Create entry. |
| DELETE | `/:id` | Yes | Delete entry. |

### Tariff — `/api/tariff`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | List tariffs (newest first). |
| POST | `/` | Yes | Create tariff. |
| PUT | `/:id` | Yes | Update tariff. |
| DELETE | `/:id` | Yes | Delete tariff. |

### Analytics — `/api/analytics`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | Get analytics data. |

**Query params:** `startDate`, `endDate` (ISO date strings)

**Response:**
```json
{
  "total_cost_pence": 15420,
  "cost_per_mile_pence": 6.2,
  "total_kwh": 180.5,
  "miles_driven": 1240.0,
  "sessions_count": 12,
  "efficiency_data": [...],
  "cost_per_session": [...],
  "temp_vs_range": [...],
  "miles_per_pct": [...],
  "enriched_sessions": [...]
}
```

`enriched_sessions` is an array of per-session derived data used by the advanced analytics charts (see [Advanced Analytics](#advanced-analytics-v111)):</p>

| Field | Type | Description |
|---|---|---|
| `id` | number | Session ID |
| `date` | string | ISO date unplugged |
| `odometer` | number | Odometer reading (miles) |
| `max_range_100_pct` | number | Projected range at 100% SOC (miles) |
| `end_charge_temperature` | number | Air temperature at time of charging (°C) |
| `energy_kwh` | number | Energy added (kWh, 0 if no charger cost logged) |
| `initial_battery_percent` | number | State of charge when plugged in (%) |
| `pct_charged` | number | Percentage points added during this session |
| `distance_driven` | number \| null | Actual miles driven since previous session |
| `estimated_range_consumed` | number \| null | GOM estimated range consumed since previous session |

### Admin — `/api/admin` (admin only)

| Method | Path | Description |
|---|---|---|
| GET | `/users` | List all users |
| POST | `/users` | Create user |
| DELETE | `/users/:id` | Delete user |
| GET | `/settings` | Get app settings |
| PUT | `/settings` | Update settings |
| POST | `/2fa/setup` | Setup 2FA |
| POST | `/2fa/verify` | Verify 2FA code |

---

## Advanced Analytics (v1.1.1)

Five additional insight charts are derived from `enriched_sessions` data returned by `GET /api/analytics`. All computation is done in the React layer from the data already fetched.

### Chart 1 — Battery Health Proxy

| Property | Value |
|---|---|
| Chart type | Line / Scatter with linear trendline |
| X-axis | `odometer` (miles) |
| Y-axis | `max_range_100_pct` — projected full-charge range, calculated as `final_range_miles / final_battery_pct × 100` |
| Y-axis scale | Dynamic min/max (does not start at 0) so degradation is visible |
| Trendline | Least-squares linear regression drawn as a dashed overlay |
| Tooltip | Odometer, date, max range at 100% |

### Chart 2 — Thermal Impact on Charging

| Property | Value |
|---|---|
| Chart type | Scatter |
| X-axis | `end_charge_temperature` (°C) |
| Y-axis | `energy_kwh` (kWh added per session) |
| Point opacity | Scales with `initial_battery_percent` (low SOC = more transparent) |
| Tooltip | Temperature, energy added, starting battery % |

### Chart 3 — GOM Accuracy: Estimated vs Real Range

| Property | Value |
|---|---|
| Chart type | Scatter |
| X-axis | `estimated_range_consumed` — GOM predicted miles used (prev `final_range_miles` − cur `initial_range_miles`) |
| Y-axis | `distance_driven` — actual odometer difference between consecutive sessions |
| Reference line | Diagonal from (0,0) to (max, max) represents perfect 1:1 accuracy |
| Summary badge | Avg GOM ratio = Σ `distance_driven` / Σ `estimated_range_consumed` shown above chart |
| Tooltip | Date, GOM estimate, actual miles |

### Chart 4 — Range Anxiety Gauge

| Property | Value |
|---|---|
| Chart type | Histogram (bar) |
| X-axis | `initial_battery_percent` binned into 10-point groups (0–9%, 10–19%, …, 90–100%) |
| Y-axis | Session count per bin |
| Bar colour | Orange/red for bins below 20%, teal/green for 20% and above |
| Median marker | Dashed vertical line annotated with the median `initial_battery_percent` |

### Chart 5 — Charging Habits by Day

| Property | Value |
|---|---|
| Chart type | Bar |
| X-axis | Day of week, explicitly ordered Monday → Sunday |
| Y-axis | Total session count per day |
| Hover tooltip | Sessions, avg kWh added, avg % charged for that day |

---

## Environment Variables

See `.env.example` for all variables. Key ones:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `JWT_SECRET` | ✅ | — | Must be a long random string in production |
| `ADMIN_PASSWORD` | ✅ | `Admin@123` | Change immediately |
| `DB_PATH` | ✅ | `./data/leccy.db` | Path to SQLite file |
| `PORT` | No | `2030` | API server port |
| `NODE_ENV` | No | `development` | Set to `production` for deployment |

---

## Security Considerations

1. **JWT Secret:** Use a cryptographically random secret in production (e.g., `openssl rand -hex 64`).
2. **Admin Password:** Change the default `Admin@123` immediately after first login.
3. **HTTPS:** Always run behind HTTPS in production (use Nginx + Certbot).
4. **Database:** Store the `data/leccy.db` file outside the web root and back it up regularly.
5. **CORS:** In production, CORS is disabled (`false`). The Express server serves the React app directly.
6. **Bearer Token Auth:** JWT is stored in `localStorage` and sent as an `Authorization: Bearer` header. No cookies are used for authentication, making the API inherently CSRF-immune.
7. **Foreign Keys:** SQLite foreign keys are enabled with `PRAGMA foreign_keys = ON`.
8. **Password Hashing:** bcryptjs with saltRounds: 12.
9. **Admin-only routes:** The `/api/admin/*` endpoints require both `authenticate` and `requireAdmin` middleware.

---

## Deployment Guide

### Environment

```bash
NODE_ENV=production
PORT=2030
JWT_SECRET=<long-random-secret>
ADMIN_PASSWORD=<strong-password>
DB_PATH=/var/data/leccy/leccy.db
```

### Build

```bash
# Build frontend
cd client && npm install && npm run build && cd ..

# Build backend
cd server && npm install && npm run build && cd ..
```

### Start

```bash
cd server && node dist/index.js
```

Or with PM2:
```bash
pm2 start server/dist/index.js --name leccy --cwd server
```

### Data directory

```bash
mkdir -p /var/data/leccy
chown node:node /var/data/leccy
```

### Nginx reverse proxy

```nginx
server {
    listen 443 ssl;
    server_name leccy.jahosi.co.uk;

    ssl_certificate /etc/letsencrypt/live/leccy.jahosi.co.uk/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/leccy.jahosi.co.uk/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:2030;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Frontend Architecture

- **State Management:** Context API (`AuthContext`) — no Redux needed at this scale
- **Forms:** React Hook Form with validation
- **Charts:** Recharts (LineChart, BarChart, ScatterChart)
- **Routing:** React Router v6 (protected routes via `ProtectedRoute` wrapper)
- **Styling:** Tailwind CSS with a green EV theme
- **API Client:** Axios with request/response interceptors for auth
- **PWA:** Web App Manifest + Service Worker — installable on Android (Chrome) and iOS (Safari)

---

## Progressive Web App (PWA)

Leccy v1.1.1 ships as a fully installable PWA. The following files drive this:

| File | Purpose |
|---|---|
| `client/public/manifest.json` | Web App Manifest (name, icons, theme colour, display mode) |
| `client/public/sw.js` | Service Worker — cache-first static assets, network-first API |
| `client/public/icons/icon-*.png` | PNG icons in 8 sizes (72 → 512 px) generated from the SVG favicon |
| `client/public/apple-touch-icon.png` | 180×180 icon used by Safari on iOS |

### Service Worker strategy

- **Navigation requests** (`mode === 'navigate'`): serve the cached SPA shell (`/`) so the app loads offline after the first visit.
- **`/api/*` requests**: network-first; returns a JSON `503` error response when offline.
- **All other static assets**: cache-first, populating the cache on the first fetch.
- Cache is versioned (`leccy-1.0.4`); old caches are purged on activation.

### Content-Security-Policy

The server's Helmet CSP includes `worker-src 'self'` to allow the service worker to be registered from the same origin.

---

## Monetary Values

All monetary values are stored and transmitted as **integer pence** (1/100 of a pound) to avoid floating-point precision issues. The UI converts to/from pounds (£) for display.

Example: £1.23 is stored as `123` pence.
