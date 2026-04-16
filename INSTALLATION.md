# Leccy — EV Cost Tracker: Installation Guide

## Prerequisites

- **Node.js** 18+ and **npm** 9+
- A Unix-like OS (Linux/macOS) or Windows with WSL
- Git

---

## 1. Clone the repository

```bash
git clone https://github.com/your-org/Leccy.git
cd Leccy
```

---

## 2. Configure environment variables

Copy the example file and edit it:

```bash
cp .env.example .env
```

Edit `.env` with your own values:

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` or `production` |
| `PORT` | Port for the backend API (default: 3001) |
| `APP_VERSION` | Application version string |
| `DB_PATH` | Path to SQLite database file (default: `./data/leccy.db`) |
| `JWT_SECRET` | Secret key for signing JWTs — **must be changed** |
| `JWT_EXPIRES_IN` | JWT expiry duration (e.g. `7d`) |
| `ADMIN_PASSWORD` | Default admin password — **must be changed** |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP server port (usually 587 or 465) |
| `SMTP_SECURE` | `true` for TLS, `false` for STARTTLS |
| `SMTP_USER` | SMTP username / email address |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | Sender address for outgoing emails |
| `CAR_BATTERY_KWH` | Your EV battery capacity in kWh |
| `CAR_IDEAL_RANGE_MILES` | Manufacturer-rated range in miles |
| `DOMAIN` | Public domain URL (for production) |

---

## 3. Install dependencies

### Backend

```bash
cd server
npm install
cd ..
```

### Frontend

```bash
cd client
npm install
cd ..
```

---

## 4. Start in development mode

You need two terminals:

**Terminal 1 — Backend:**
```bash
cd server
npm run dev
```
The API will start on `http://localhost:3001`.

**Terminal 2 — Frontend:**
```bash
cd client
npm run dev
```
The frontend will start on `http://localhost:5173`.

Open your browser at `http://localhost:5173`.

Default login:
- **Licence Plate:** `ADMIN`
- **Password:** value of `ADMIN_PASSWORD` in your `.env` (default: `Admin@123`)

> ⚠️ Change the admin password after first login!

---

## 5. Build for production

### Build frontend

```bash
cd client
npm run build
cd ..
```

The built files will be in `client/dist/`.

### Build backend

```bash
cd server
npm run build
cd ..
```

Compiled files will be in `server/dist/`.

---

## 6. Run in production

1. Make sure `NODE_ENV=production` is set in your `.env`.
2. The backend will serve the frontend static files from `../client/dist`.

```bash
cd server
npm start
```

The application will be available on the configured `PORT` (default: 3001).

---

## 7. Running with a process manager (recommended)

Install PM2:

```bash
npm install -g pm2
```

Start the server:

```bash
cd server
pm2 start dist/index.js --name leccy
pm2 save
pm2 startup
```

---

## 8. Reverse proxy with Nginx (optional)

Example Nginx site configuration:

```nginx
server {
    listen 80;
    server_name leccy.jahosi.co.uk;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Use Certbot for HTTPS:

```bash
sudo certbot --nginx -d leccy.jahosi.co.uk
```

---

## 9. Data directory

The SQLite database is stored at the path specified in `DB_PATH` (default: `./data/leccy.db`).
Ensure the `data/` directory exists and is writable:

```bash
mkdir -p server/data
```

Back up this file regularly!
