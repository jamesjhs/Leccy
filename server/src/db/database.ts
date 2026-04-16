import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DB_PATH || './data/leccy.db';
const resolvedPath = path.resolve(dbPath);
const dataDir = path.dirname(resolvedPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(resolvedPath);

// Enable WAL mode and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      licence_plate TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS charging_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      odometer_miles REAL NOT NULL,
      initial_battery_pct REAL NOT NULL,
      initial_range_miles REAL NOT NULL,
      final_battery_pct REAL NOT NULL,
      final_range_miles REAL NOT NULL,
      air_temp_celsius REAL NOT NULL,
      date_unplugged TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS charger_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      energy_kwh REAL NOT NULL,
      price_pence INTEGER NOT NULL,
      charger_type TEXT NOT NULL CHECK(charger_type IN ('home', 'public')),
      charger_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES charging_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS maintenance_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      log_date TEXT NOT NULL,
      cost_pence INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tariff_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tariff_name TEXT NOT NULL,
      rate_pence_per_kwh REAL NOT NULL,
      standing_charge_pence REAL NOT NULL,
      effective_from TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_2fa (
      admin_id INTEGER PRIMARY KEY,
      email TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      secret TEXT,
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Seed APP_VERSION
  const version = process.env.APP_VERSION || '0.0.1';
  const upsertVersion = db.prepare(
    `INSERT INTO app_settings (key, value) VALUES ('APP_VERSION', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  upsertVersion.run(version);

  // Create admin user if not exists
  const adminExists = db.prepare(`SELECT id FROM users WHERE licence_plate = 'ADMIN'`).get();
  if (!adminExists) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
    const hash = bcrypt.hashSync(adminPassword, 12);
    db.prepare(
      `INSERT INTO users (licence_plate, password_hash, is_admin, email) VALUES ('ADMIN', ?, 1, NULL)`
    ).run(hash);
    console.log('[DB] Admin user created.');
  }
}

initializeDatabase();

export default db;

export function getSetting(key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}
