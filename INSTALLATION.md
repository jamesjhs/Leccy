# Leccy — EV Cost Tracker v1.6.2: Installation Guide

## Prerequisites

- **Node.js** 18+ and **npm** 9+
- A Debian 12/13 VPS (or any Linux server)
- **nginx** installed (`sudo apt install nginx`)
- **PM2** process manager (`npm install -g pm2`)
- Git
- A Cloudflare account with your domain pointed at the VPS

---

## 1. Clone the repository

```bash
git clone https://github.com/jamesjhs/Leccy.git
cd Leccy
```

---

## 2. Configure environment variables

Copy the example file and edit it:

```bash
cp .env.example .env
nano .env
```

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` or `production` |
| `PORT` | Port for the backend API (default: **2030**) |
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
| `VAPID_PUBLIC_KEY` | Optional seed public VAPID key for PWA push notifications |
| `VAPID_PRIVATE_KEY` | Optional seed private VAPID key for PWA push notifications |
| `VAPID_SUBJECT` | Optional seed contact URI for VAPID, usually `mailto:admin@example.com` |
| `CAR_BATTERY_KWH` | Your EV battery capacity in kWh |
| `CAR_IDEAL_RANGE_MILES` | Manufacturer-rated range in miles |
| `DOMAIN` | Public domain URL (for production) |

> ⚠️ Generate a strong random `JWT_SECRET`, e.g.:
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

Generate VAPID keys for PWA push reminders from the `server` directory:

```bash
cd server
npx web-push generate-vapid-keys
cd ..
```

Copy the generated public/private keys into `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, or sign in as an administrator and configure them from **Admin Panel → Web Push (VAPID)**. Settings saved in the Admin Panel take precedence over `.env`. Without these keys Leccy still runs, but charge reminder push notifications remain disabled.

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

## 4. Build for production

From the repository root:

```bash
npm run build
```

This builds both the frontend and backend. Built static files are placed in `client/dist/`; compiled backend output is placed in `server/dist/`.

---

## 5. Data directory

The SQLite database is stored at the path in `DB_PATH` (default: `./data/leccy.db` relative to where you run the server from). Create and secure it before first run:

```bash
mkdir -p server/data
chmod 750 server/data
```

---

## 6. Running with PM2 (recommended)

PM2 keeps the server running after crashes and across reboots.

### Install PM2 globally

```bash
npm install -g pm2
```

### Create the PM2 ecosystem file

An `ecosystem.config.js` is included at the repository root. Review and adjust the `cwd` path if needed, then start:

```bash
pm2 start ecosystem.config.js
```

This starts Leccy in production mode using the compiled `server/dist/index.js`.

For local production smoke testing from the repository root, run:

```bash
npm start
```

This starts the compiled API server and Vite preview server together. Run `npm run build` first.

### Verify it is running

```bash
pm2 list
pm2 logs leccy        # live log output
pm2 show leccy        # detailed process info
```

### Save the process list and enable startup on boot

```bash
pm2 save
pm2 startup           # follow the printed command (requires sudo)
```

The `pm2 startup` command prints a `sudo env PATH=...` command — run that command to register PM2 as a systemd service so Leccy restarts automatically after a reboot.

### Useful PM2 commands

| Command | Effect |
|---|---|
| `pm2 restart leccy` | Restart the app |
| `pm2 reload leccy` | Zero-downtime reload |
| `pm2 stop leccy` | Stop the app |
| `pm2 delete leccy` | Remove from PM2 |
| `pm2 logs leccy --lines 200` | Show last 200 log lines |
| `pm2 monit` | Interactive real-time monitor |

---

## 7. Start in development mode

You need two terminals:

**Terminal 1 — Backend:**
```bash
cd server
npm run dev
```
The API will start on `http://localhost:2030`.

**Terminal 2 — Frontend (Vite dev server):**
```bash
cd client
npm run dev
```
The frontend will start on `http://localhost:5173` and proxy API calls to port 2030.

Open your browser at `http://localhost:5173`.

Default login:
- **Licence Plate:** `ADMIN`
- **Password:** value of `ADMIN_PASSWORD` in your `.env` (default: `Admin@123`)

> ⚠️ Change the admin password after first login!

---

## 8. Reverse proxy with nginx

Leccy runs on plain **HTTP** on port 2030. SSL/TLS termination is handled entirely by **Cloudflare** (Full or Full Strict mode) — no certificates need to be installed on the server itself.

### Create the nginx site configuration

```bash
sudo nano /etc/nginx/sites-available/leccy
```

Paste the following:

```nginx
server {
    listen 80;
    server_name leccy.jahosi.co.uk;

    # Cloudflare real IP restoration
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 104.24.0.0/14;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 131.0.72.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    set_real_ip_from 2400:cb00::/32;
    set_real_ip_from 2606:4700::/32;
    set_real_ip_from 2803:f800::/32;
    set_real_ip_from 2405:b500::/32;
    set_real_ip_from 2405:8100::/32;
    set_real_ip_from 2a06:98c0::/29;
    set_real_ip_from 2c0f:f248::/32;
    real_ip_header CF-Connecting-IP;

    location / {
        proxy_pass         http://127.0.0.1:2030;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Enable and test

```bash
sudo ln -s /etc/nginx/sites-available/leccy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Cloudflare settings

1. Add a **DNS A record** pointing `leccy.jahosi.co.uk` → your VPS IP address, with the **Proxied** (orange cloud) toggle **on**.
2. Set the SSL/TLS mode to **Full** (or **Full (strict)**) in the Cloudflare dashboard.
3. Optionally enable **Always Use HTTPS** and **HSTS** in Cloudflare.

Cloudflare handles HTTPS between the client and Cloudflare's edge. Traffic between Cloudflare and your server travels over HTTP on port 2030 via nginx. No certificates need to be installed on the VPS.

---

## 9. Firewall

Allow nginx through the firewall; block direct access to port 2030 from the internet (Cloudflare connects via nginx on port 80):

```bash
sudo ufw allow 'Nginx HTTP'
sudo ufw allow OpenSSH
sudo ufw enable
```

To restrict port 2030 to localhost only (recommended):

```bash
sudo ufw deny 2030
```

---

## 10. Verify the deployment

```bash
# Check PM2
pm2 list

# Check nginx
sudo systemctl status nginx

# Test the API locally
curl http://localhost:2030/api/auth/version

# Check public URL (via Cloudflare)
curl https://leccy.jahosi.co.uk/api/auth/version
```

---

## 11. Installing as a mobile app (PWA)

Leccy v1.6.2 is a fully-featured **Progressive Web App**. Once deployed behind HTTPS, supported browsers show an in-app install prompt on first load. Users can also install it directly from their browser menu with no app store required.

When VAPID keys are configured through `.env` or **Admin Panel → Web Push (VAPID)**, installed PWA users are prompted to enable push notifications on first PWA launch. If a Quick Entry charge start is saved and not yet submitted or cleared, Leccy sends a daily reminder at the user's configured reminder time, defaulting to **07:30**. Users can enable or disable these reminders and change the reminder time from **Account Settings**.

### Android (Chrome)

1. Open the site in **Chrome** on Android.
2. Use the in-app install prompt if it appears, or tap the browser menu (⋮) and choose **Add to Home screen**.
3. Confirm the name and tap **Add**.

The app will appear on the home screen and launch full-screen without any browser chrome.

### iOS (Safari)

1. Open the site in **Safari** on iPhone or iPad.
2. Tap the **Share** button (□↑) in the toolbar.
3. Scroll down and tap **Add to Home Screen**.
4. Confirm the name and tap **Add**.

The app will appear on the home screen and launch in standalone mode.

> **Note:** iOS requires HTTPS for PWA installation. Ensure Cloudflare's proxy (orange cloud) is active and SSL/TLS mode is set to **Full** or **Full (strict)**.

### PWA updates

The service worker cache is versioned with the app version. On load, installed PWAs check for a newer service worker without using the HTTP cache, activate it immediately when found, purge old caches, and reload the app once the new version controls the page. Navigation and static assets use a network-first strategy while online so local PWA files are refreshed from the latest server version after a version increment, with cached fallbacks kept for offline use.

