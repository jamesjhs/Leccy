# Leccy — EV Cost Tracker · v1.6.0

A full-stack web application for logging and analysing the cost of charging an electric vehicle. Installs as a native-feeling app on Android (Chrome) and iOS (Safari), with an in-app install prompt where supported.

## Features

- Log charging sessions with battery %, range, odometer, temperature, and CSV paste validation
- Start a charge quickly from the default Quick Entry page, save it as a local draft, and finish submission later
- Track home and away charger costs, with measured and estimated kWh kept distinct
- Maintain a vehicle maintenance log
- Manage electricity tariffs over time
- Analytics dashboard with charts for cost, kWh, odometer-based efficiency, temperature effects, and savings
- **Guided setup and safer entry** — tariff/vehicle setup prompts, first-vehicle data assignment, Quick Entry sense checks, historical tariff cost calculation, and autosaving Charging Sessions edits with revert support
- **Advanced analytics** — Ownership Intelligence, Home vs Away Economics, Odometer-Based Efficiency, Temperature-Normalised Efficiency, Measured-kWh Usable Capacity Proxy, Data Quality, GOM Accuracy, Range Anxiety Gauge, and Charging Habits
- **Security hardened** — JWT algorithm pinned, production startup guards, SMTP credential masking, production log sanitisation (v1.2.0)
- **Quick Data Entry** — save charge-start odometer, SOC, and range, then complete end-charge SOC, range, temperature, kWh, and cost later (v1.3.1)
- **PWA install, reminders, and update handling** — first-load install prompt where supported, VAPID push reminders for in-progress Quick Entry charges, service-worker update checks, and automatic reload when a new app version activates
- Multi-user support with admin panel, including SMTP settings, user management, and Web Push VAPID key configuration
- **Progressive Web App (PWA)** — install on Android or iOS for a full-screen, app-like experience

## Quick start

See [INSTALLATION.md](INSTALLATION.md) for the full setup guide.

Common root commands:

```bash
npm run build
npm start
```

## Documentation

| Document | Description |
|---|---|
| [INSTALLATION.md](INSTALLATION.md) | Server setup, nginx, PM2, Cloudflare |
| [TECHNICAL_MANUAL.md](TECHNICAL_MANUAL.md) | Architecture, API reference, database schema |

## Version

**1.6.0**

Adds admin-managed Web Push VAPID settings, including public/private key storage, subject editing, generated key pairs, masked private-key status, and runtime push configuration without relying only on `.env`.

**1.5.0**
