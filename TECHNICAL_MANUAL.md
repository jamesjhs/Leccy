# Leccy — EV Cost Tracker v1.6.2: Technical Manual

## Architecture Overview

Leccy is a full-stack TypeScript application composed of:

- **Backend:** Node.js + Express REST API with better-sqlite3 (synchronous SQLite)
- **Frontend:** React SPA with Vite, React Router v6, Tailwind CSS, custom SVG chart components
- **Database:** SQLite3 (single file, stored at `DB_PATH`)
- **Auth:** JWT Bearer token (stored in `localStorage` on client; sent via `Authorization: Bearer` header)

```
┌─────────────────────────────────────┐
│  Client (React/Vite - port 5173)    │
│  ├── src/App.tsx (Router + Auth)    │
│  ├── src/pages/*                    │
│  ├── src/components/*               │
│  ├── src/hooks/useAuth.ts           │
│  └── src/utils/api.ts (fetch wrapper)│
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
| `licence_plate` | TEXT UNIQUE | Optional; uppercase; NULL for email-only users |
| `password_hash` | TEXT NOT NULL | bcryptjs, saltRounds: 12 |
| `is_admin` | INTEGER NOT NULL | 0 or 1 |
| `email` | TEXT | Nullable; unique (partial index, non-null only) |
| `display_name` | TEXT | Nullable; optional friendly name |
| `failed_login_attempts` | INTEGER NOT NULL | Default 0; increments on bad password |
| `locked_until` | TEXT | Nullable; ISO datetime; account lockout expiry |
| `push_notifications_enabled` | INTEGER NOT NULL | 0/1 flag for charge reminder push notifications; default 0 until the user enables push |
| `push_reminder_time` | TEXT NOT NULL | Local HH:mm reminder time; default `07:30` |
| `push_time_zone` | TEXT | Nullable IANA time zone for reminder scheduling |
| `created_at` | TEXT NOT NULL | ISO datetime |

### `charging_sessions`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK | → users.id CASCADE |
| `vehicle_id` | INTEGER FK | → vehicles.id SET NULL |
| `odometer_miles` | REAL | |
| `initial_battery_pct` | REAL | 0–100 |
| `initial_range_miles` | REAL | |
| `final_battery_pct` | REAL | 0–100 |
| `final_range_miles` | REAL | |
| `air_temp_celsius` | REAL | |
| `date_started` | TEXT | Optional ISO date (YYYY-MM-DD) |
| `date_unplugged` | TEXT | ISO date (YYYY-MM-DD) |
| `created_at` | TEXT | ISO datetime |

### `vehicles`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK | → users.id CASCADE |
| `licence_plate` | TEXT | Uppercase, spaces stripped |
| `nickname` | TEXT | Nullable |
| `vehicle_type` | TEXT | Nullable |
| `battery_kwh` | REAL | Nullable; used for SOC-derived kWh estimates |
| `created_at` | TEXT | ISO datetime |

### `charger_costs`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `session_id` | INTEGER FK | → charging_sessions.id CASCADE |
| `user_id` | INTEGER FK | → users.id CASCADE |
| `energy_kwh` | REAL | |
| `price_pence` | INTEGER | Stored as integer pence |
| `price_calculated` | INTEGER | 0/1 flag showing whether cost was tariff-calculated |
| `charger_type` | TEXT | `'home'` or `'public'` |
| `charger_name` | TEXT | Nullable |
| `energy_source` | TEXT | `'measured'` or `'estimated'`; defaults to `'measured'` |
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
| `peak_start_time` | TEXT | 24-hour HH:mm |
| `off_peak_rate_pence_per_kwh` | REAL | Nullable; pence per kWh |
| `off_peak_start_time` | TEXT | Nullable; 24-hour HH:mm |
| `effective_from` | TEXT | ISO date |
| `created_at` | TEXT | |

### `app_settings`
| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | |
| `value` | TEXT | |

`app_settings` stores runtime app configuration such as `APP_VERSION`, SMTP settings, and admin-managed VAPID values (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Admin-managed VAPID values take precedence over `.env` values.

### `admin_2fa`
| Column | Type | Notes |
|---|---|---|
| `admin_id` | INTEGER PK FK | → users.id |
| `email` | TEXT | |
| `enabled` | INTEGER | 0 or 1 |
| `secret` | TEXT | Nullable, temporary code |

### `push_subscriptions`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK | → users.id CASCADE |
| `endpoint` | TEXT UNIQUE | Browser push endpoint |
| `keys_p256dh` | TEXT | Push subscription public key |
| `keys_auth` | TEXT | Push subscription auth secret |
| `created_at` | TEXT | ISO datetime |

### `pending_charge_reminders`
| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER PK FK | → users.id CASCADE |
| `vehicle_id` | INTEGER FK | → vehicles.id SET NULL |
| `started_at` | TEXT NOT NULL | ISO datetime for saved Quick Entry charge start |
| `last_notified_date` | TEXT | Local date last reminder was sent |
| `updated_at` | TEXT | ISO datetime |

---

## API Reference

### Authentication — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/login` | No | Login with email + password. Returns JWT. |
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
  "date_started": "2024-03-15",
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
  "charger_name": null,
  "energy_source": "measured"
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
  "enriched_sessions": [...],
  "derived_insights": {
    "ownership_cost": {...},
    "home_away": {...},
    "odometer_efficiency": [...],
    "temperature_efficiency": [...],
    "battery_capacity": [...],
    "data_quality": {...}
  }
}
```

`enriched_sessions` is an array of per-session derived data used by the analytics charts:

| Field | Type | Description |
|---|---|---|
| `id` | number | Session ID |
| `date` | string | ISO date unplugged |
| `odometer` | number | Odometer reading (miles) |
| `max_range_100_pct` | number | Projected range at 100% SOC (miles) |
| `end_charge_temperature` | number | Air temperature at time of charging (°C) |
| `energy_kwh` | number | Energy added (kWh, 0 if no charger cost logged) |
| `energy_source` | string | `measured`, `estimated`, or null |
| `initial_battery_percent` | number | State of charge when plugged in (%) |
| `pct_charged` | number | Percentage points added during this session |
| `distance_driven` | number \| null | Actual miles driven since previous session |
| `estimated_range_consumed` | number \| null | GOM estimated range consumed since previous session |
| `charger_type` | string \| null | `home`, `public`, or null |

### Push Notifications — `/api/push`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/vapid-public-key` | No | Return the VAPID public key, or 503 when push is not configured. |
| GET | `/settings` | Yes | Return the user's push enabled flag, reminder time, time zone, and server configuration status. |
| PUT | `/settings` | Yes | Update push enabled state, reminder time, and time zone. |
| POST | `/subscribe` | Yes | Store or refresh the browser push subscription for the current user. |
| DELETE | `/subscribe` | Yes | Remove a browser push subscription endpoint for the current user. |
| POST | `/charge-started` | Yes | Mark a Quick Entry charge as in progress for reminder scheduling. |
| DELETE | `/charge-started` | Yes | Clear the in-progress charge reminder after submit or draft clear. |

### Admin — `/api/admin` (admin only)

| Method | Path | Description |
|---|---|---|
| GET | `/users` | List all users |
| POST | `/users` | Create user |
| DELETE | `/users/:id` | Delete user |
| GET | `/settings` | Get app settings |
| PUT | `/settings` | Update settings |
| GET | `/vapid` | Return VAPID public key, subject, private-key configured status, and overall configured status |
| PUT | `/vapid` | Save VAPID public key, private key, and subject; blank private key keeps the existing value |
| GET | `/vapid/generate` | Generate a new VAPID key pair without saving it |
| POST | `/2fa/setup` | Setup 2FA |
| POST | `/2fa/verify` | Verify 2FA code |

---

## Advanced Analytics

Advanced analytics are derived server-side from `GET /api/analytics` and rendered by the React analytics page. The design deliberately separates measured values from derived estimates, because SOC, dashboard range, and user-entered costs do not all have the same evidential strength.

### Ownership Intelligence

Compares EV cost-per-mile with a typical petrol-car benchmark over the same odometer miles. The same savings figure is used on the dashboard and public aggregate homepage so public-facing numbers are based on real app data rather than placeholder copy.

### Home vs Away Economics

Splits session cost, kWh, average cost per costed charge, and cost-per-mile by `charger_type`. The session charts expose an `All | Home | Away` filter, and the analytics response includes grouped totals for the currently selected date and vehicle filters so users can see how much public charging changes ownership economics.

### Odometer-Based Efficiency

Uses odometer differences between consecutive charging sessions as measured distance travelled. Efficiency points are calculated from kWh divided by odometer miles, with Battery Efficiency over Time excluding values more than two standard deviations from the mean.

### Temperature-Normalised Efficiency

Groups efficiency by ambient temperature band using `air_temp_celsius`. This is suitable for trend discovery, but the manual should continue to describe it as ambient-temperature analysis rather than battery-temperature measurement.

### Measured-kWh Usable Capacity Proxy

Compares charger-recorded `energy_kwh` with SOC gained: `energy_kwh / ((final_battery_pct - initial_battery_pct) / 100)`. Rows with `energy_source = 'estimated'` are excluded or labelled separately so SOC-derived kWh does not masquerade as charger-measured evidence.

### Data Quality

Summarises how much of the dataset has odometer continuity, measured kWh, vehicle links, temperature readings, and charge-type labels. This gives researchers and users a quick sense of how reliable downstream analyses are.

### GOM Accuracy: Estimated vs Real Range

| Property | Value |
|---|---|
| Chart type | Scatter |
| X-axis | `estimated_range_consumed` — GOM predicted miles used (prev `final_range_miles` − cur `initial_range_miles`) |
| Y-axis | `distance_driven` — actual odometer difference between consecutive sessions |
| Reference line | Diagonal from (0,0) to (max, max) represents perfect 1:1 accuracy |
| Summary badge | Avg GOM ratio = Σ `distance_driven` / Σ `estimated_range_consumed` shown above chart |
| Tooltip | Date, GOM estimate, actual miles |

The displayed scatter excludes extreme actual-to-estimated range ratios using the Iglewicz-Hoaglin robust modified z-score rule. The frontend calculates `ln(distance_driven / estimated_range_consumed)`, computes the median absolute deviation (MAD), and removes points with `|modified z-score| > 3.5` when at least five GOM pairs are available. This avoids the mean and standard deviation being pulled around by the same points being classified as outliers.

### Range Anxiety Gauge

| Property | Value |
|---|---|
| Chart type | Histogram (bar) |
| X-axis | `initial_battery_percent` binned into 10-point groups (0–9%, 10–19%, …, 90–100%) |
| Y-axis | Session count per bin |
| Bar colour | Orange/red for bins below 20%, teal/green for 20% and above |
| Median marker | Dashed vertical line annotated with the median `initial_battery_percent` |

### Charging Habits by Day

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
| `VAPID_PUBLIC_KEY` | For push | — | Optional seed public VAPID key used by browser subscriptions; overridden by `app_settings` |
| `VAPID_PRIVATE_KEY` | For push | — | Optional seed private VAPID key used by `web-push`; overridden by `app_settings` |
| `VAPID_SUBJECT` | For push | `mailto:admin@localhost` | Optional seed contact URI included in VAPID details; overridden by `app_settings` |

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
VAPID_PUBLIC_KEY=<generated-public-key>
VAPID_PRIVATE_KEY=<generated-private-key>
VAPID_SUBJECT=mailto:admin@example.com
```

### Build

```bash
# Install dependencies in client and server first, then build both from the root
npm run build
```

### Start

```bash
npm start
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
- **Charts:** Custom SVG components in the React layer
- **Routing:** React Router v6 (protected routes via `ProtectedRoute` wrapper)
- **Quick entry:** `/quick-data-entry` is the authenticated default route. It stores an in-browser draft for charge-start odometer, SOC, and range, registers a pending push reminder with the server, collapses saved start details into a summary, estimates kWh from SOC gained × vehicle battery size, and submits through the existing sessions and charger cost APIs.
- **Styling:** Tailwind CSS with a green EV theme
- **API Client:** Lightweight fetch wrapper with axios-like response/error shape
- **PWA:** Web App Manifest + Service Worker — installable on Android (Chrome) and iOS (Safari), with a browser-gated first-load install prompt where supported.

---

## Progressive Web App (PWA)

Leccy v1.6.2 ships as a fully installable PWA. The following files drive this:

| File | Purpose |
|---|---|
| `client/public/manifest.json` | Web App Manifest (name, icons, theme colour, display mode) |
| `client/public/sw.js` | Service Worker — network-first navigation/static assets, network-first API, push display, notification click handling |
| `client/src/components/PwaInstallPrompt.tsx` | Browser-gated install prompt using `beforeinstallprompt` |
| `client/src/components/PushNotificationPrompt.tsx` | First PWA-launch prompt for enabling push reminders |
| `client/public/icons/icon-*.png` | PNG icons in 8 sizes (72 -> 512 px) generated from the SVG favicon |
| `client/public/icons/icon-androidBar.png` | Android notification/status-bar badge icon used only by the Web Notifications `badge` field |
| `client/public/apple-touch-icon.png` | 180×180 icon used by Safari on iOS |

### Service Worker strategy

- **Navigation requests** (`mode === 'navigate'`): network-first; updates the cached SPA shell (`/`) while online and falls back to the cached shell when offline.
- **`/api/*` requests**: network-first; returns a JSON `503` error response when offline.
- **All other static assets**: network-first while online, updating the versioned cache and falling back to cached copies when offline.
- Cache is versioned (`leccy-1.6.2`); old caches are purged on activation.
- The client registers `sw.js` with `updateViaCache: 'none'`, calls `registration.update()` on load, sends `SKIP_WAITING` to waiting or newly installed updates, and reloads when `controllerchange` fires so installed PWAs move to the newest app version promptly.
- The production server serves `sw.js` with `Cache-Control: no-store` and `index.html` with `Cache-Control: no-cache` so update checks are not blocked by stale shell files.
- Push events display charge reminder notifications, and notification clicks focus an existing Leccy window or open `/quick-data-entry`.

### Charge Reminder Push Flow

- `server/src/services/chargeReminderScheduler.ts` configures `web-push` with VAPID values from `app_settings`, falling back to `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` from `.env`.
- `server/src/routes/admin.ts` exposes admin-only VAPID settings endpoints, validates key material and subject URI format, masks the private key in responses, and can generate unsaved key pairs via `web-push`.
- Saving a Quick Entry charge start calls `POST /api/push/charge-started`; submitting or clearing the draft calls `DELETE /api/push/charge-started`.
- The scheduler checks pending reminders every minute and sends at or after each user's local `push_reminder_time`, defaulting to 07:30.
- Stale push subscriptions returning 404 or 410 are removed automatically.

### Content-Security-Policy

The server's Helmet CSP includes `worker-src 'self'` to allow the service worker to be registered from the same origin.

---

## Monetary Values

All monetary values are stored and transmitted as **integer pence** (1/100 of a pound) to avoid floating-point precision issues. The UI converts to/from pounds (£) for display.

Example: £1.23 is stored as `123` pence.

---

## Changelog

### v1.6.2

- Updated Android push notifications to use `icon-androidBar.png` only as the notification `badge`, leaving manifest launcher icons unchanged.
- Bumped all app/documentation version references to 1.6.2.
- Changed PWA navigation and static asset fetches to network-first with offline cache fallbacks so versioned service-worker updates refresh local files from the server promptly.
- Registered the service worker with `updateViaCache: 'none'` and immediately activates an already waiting worker on load.

### v1.6.1

- Fixed production startup on Express 5 by replacing the legacy `app.get('*')` SPA fallback with middleware that serves the React shell for non-API GET requests.
- Updated client and server dependencies to current audit-clean releases, including React 19, React Router 7, Vite 8, Tailwind 4, Express 5, Nodemailer 9, Zod 4, and TypeScript 6.
- Updated Tailwind, Vite, Zod, and Express compatibility code required by those dependency upgrades.

### v1.6.0

- Added an Admin Panel **Web Push (VAPID)** card showing push configuration status, public key, subject, and hidden private-key status.
- Added admin-only VAPID APIs for reading settings, saving settings, and generating a new key pair without saving it immediately.
- VAPID settings saved in `app_settings` now take precedence over `.env`, and the push scheduler can be configured at runtime after admin updates.
- Updated user-facing and developer-facing documentation for admin-managed VAPID configuration.

### v1.5.0

- Added setup prompts linking users to Tariff and Vehicle setup from Quick Entry, Data Entry, and Analytics when required data is missing.
- Added first-vehicle assignment so existing unlinked charging sessions and maintenance entries can be applied to the first vehicle created.
- Added Quick Entry sense checks for impossible SOC/range/date/temperature values, with inline error placement and field highlighting.
- Updated Data Entry auto-enumerated home costs to select the tariff effective on each session date instead of always using the newest tariff.
- Added `charger_costs.price_calculated` and subtle Charging Sessions highlights for estimated kWh and tariff-calculated costs.
- Reworked Charging Sessions table edits to autosave on field changes, support a single-row Revert action, and allow deleted rows to be restored while the revert is active.
- Added VAPID-backed PWA charge reminders for saved Quick Entry charge starts, including install/push prompts, Account Settings controls, default 07:30 scheduling, and service-worker notification click handling.

### v1.4.0

- Reworked Data Entry around CSV paste/import with pre-submit testing, row-level validation, and no automatic charge type, kWh, or cost assumptions.
- Added measured versus estimated kWh tracking through `charger_costs.energy_source`.
- Added an Estimate kWh flow based on SOC gained × vehicle battery size; it only fills blank kWh entries and leaves existing measured or estimated kWh values unchanged.
- Split charging-session analytics into separate cost and kWh charts with `All`, `Home`, and `Away` filters.
- Added advanced analytics for ownership savings, home-versus-away economics, odometer-based efficiency, temperature-normalised efficiency, measured-kWh usable capacity proxy, and data quality.
- Updated the public homepage to use live aggregate usage and EV-savings data across users, including admin sessions.
- Refreshed SEO metadata and user-facing documentation to match the current app behaviour.

### v1.3.1

- Added first-load PWA install prompt where supported by the browser.
- Made Quick Entry the authenticated default page, including login, registration, magic-link completion, and installed PWA start URL.
- Added root-level `npm run build` and `npm start` commands covering client and server.
- Improved PWA update behavior with service-worker update checks, immediate activation, old-cache cleanup, and app reload on new controller activation.
- Refined Quick Entry with collapsed saved-start summaries, SOC-based kWh estimates, optional kWh/cost submission, away price unit toggling, and previous-odometer placeholder text.

### v1.3.0

- Added Quick Data Entry flow with local saved charge-start drafts.
- Added optional `date_started` support on charging sessions.
- Added vehicle battery capacity support for charge estimates.

### v1.1.0

Version bump incorporating all fixes from v1.0.4 and v1.0.5. No new features in this release.

### v1.0.5

**Bug fix — adding a vehicle (or any data) gives "no such table: main.users_v103"**

The v1.0.4 migration used `ALTER TABLE users RENAME TO users_v103` without
`PRAGMA legacy_alter_table = ON`. Modern SQLite (≥ 3.26.0, bundled with
better-sqlite3 9.x) rewrites foreign key clauses in every child table to reference
the new name even when `PRAGMA foreign_keys = OFF`. After `users_v103` was then
dropped, all child tables (`vehicles`, `charging_sessions`, `charger_costs`,
`maintenance_log`, `tariff_config`, `magic_link_tokens`, `user_2fa`, `admin_2fa`)
held dangling `REFERENCES users_v103(id)` constraints. Any INSERT/UPDATE on those
tables triggered SQLite FK validation, which failed with:

```
SqliteError: no such table: main.users_v103
```

**Fixes:**

1. **Recovery migration** — `runMigrations()` now detects stale `users_v103`
   references in `sqlite_master`. If found, it uses `PRAGMA writable_schema = ON`
   to patch every affected table/index definition back to `REFERENCES users(id)`,
   then bumps `schema_version` by 1 so SQLite discards its cached schema and
   re-parses all definitions on the next statement preparation. This runs
   automatically on server start and is idempotent.

2. **Forward migration hardened** — the `licence_plate NOT NULL` migration (which
   only runs on databases that still have the old constraint) now sets
   `PRAGMA legacy_alter_table = ON` before renaming and restores it afterwards,
   preventing the child-table FK rewrite on any remaining un-migrated databases.

3. **vehicleId query param validation** — `GET /api/sessions` and
   `GET /api/maintenance` now validate the optional `vehicleId` query parameter
   and return `400 Bad Request` when it is not a positive integer, rather than
   passing `NaN` to SQLite (which caused a 500 error).

### v1.0.4

**Bug fix — admin user creation returning 500**

The `users.licence_plate` column was originally created as `TEXT NOT NULL UNIQUE`. When support
for email-only (admin-created) users was added, the `CREATE TABLE` definition was updated to
`TEXT UNIQUE` (nullable), but no database migration was written to drop the `NOT NULL` constraint
from existing databases. Consequently, every call to `POST /api/admin/users` failed with:

```
SqliteError: NOT NULL constraint failed: users.licence_plate
```

which was caught by the route's `try/catch` and returned as a generic 500 response.

**Fix:** `runMigrations()` now detects whether `licence_plate` carries a `NOT NULL` constraint
(via `PRAGMA table_info(users)`). If it does, the function rebuilds the `users` table using
SQLite's standard rename → recreate → copy → drop pattern, with `PRAGMA foreign_keys = OFF`
during the operation to avoid constraint errors on child tables. After the migration the new
table definition matches the `CREATE TABLE` in the source, and `licence_plate` is correctly
nullable. All existing data is preserved.

*(Note: this migration had a regression in its initial release — see v1.0.5 above.)*
