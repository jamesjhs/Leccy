# Leccy — EV Cost Tracker: Technical Manual

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
│  Server (Express - port 3001)       │
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
  "miles_per_pct": [...]
}
```

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

## Environment Variables

See `.env.example` for all variables. Key ones:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `JWT_SECRET` | ✅ | — | Must be a long random string in production |
| `ADMIN_PASSWORD` | ✅ | `Admin@123` | Change immediately |
| `DB_PATH` | ✅ | `./data/leccy.db` | Path to SQLite file |
| `PORT` | No | `3001` | API server port |
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
PORT=3001
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
        proxy_pass http://127.0.0.1:3001;
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

---

## Monetary Values

All monetary values are stored and transmitted as **integer pence** (1/100 of a pound) to avoid floating-point precision issues. The UI converts to/from pounds (£) for display.

Example: £1.23 is stored as `123` pence.
