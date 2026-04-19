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
      licence_plate TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      email TEXT,
      display_name TEXT,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      licence_plate TEXT NOT NULL UNIQUE,
      nickname TEXT,
      vehicle_type TEXT,
      battery_kwh REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS magic_link_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_2fa (
      user_id INTEGER PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      otp_secret TEXT,
      otp_expires_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS charging_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      vehicle_id INTEGER,
      odometer_miles REAL NOT NULL,
      initial_battery_pct REAL NOT NULL,
      initial_range_miles REAL NOT NULL,
      final_battery_pct REAL NOT NULL,
      final_range_miles REAL NOT NULL,
      air_temp_celsius REAL NOT NULL,
      date_unplugged TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
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
      vehicle_id INTEGER,
      description TEXT NOT NULL,
      log_date TEXT NOT NULL,
      cost_pence INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
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

  // Run column migrations for existing databases
  runMigrations();

  // Seed APP_VERSION
  const version = process.env.APP_VERSION || '1.0.4';
  const upsertVersion = db.prepare(
    `INSERT INTO app_settings (key, value) VALUES ('APP_VERSION', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  upsertVersion.run(version);

  // Create admin user if not exists
  const adminExists = db.prepare(`SELECT id FROM users WHERE licence_plate = 'ADMIN'`).get();
  if (!adminExists) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
    const adminEmail = process.env.ADMIN_EMAIL || null;
    const hash = bcrypt.hashSync(adminPassword, 12);
    db.prepare(
      `INSERT INTO users (licence_plate, password_hash, is_admin, email) VALUES ('ADMIN', ?, 1, ?)`
    ).run(hash, adminEmail);
    console.log('[DB] Admin user created.');
  }
}

function runMigrations(): void {
  // Read full column info (including notnull flag) so we can detect constraint issues
  const userColsInfo = db.pragma('table_info(users)') as Array<{ name: string; notnull: number }>;
  const userCols = userColsInfo.map((c) => c.name);

  // Add display_name column if missing
  if (!userCols.includes('display_name')) {
    db.exec(`ALTER TABLE users ADD COLUMN display_name TEXT`);
    console.log('[DB] Migration: added users.display_name');
  }
  if (!userCols.includes('failed_login_attempts')) {
    db.exec(`ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0`);
    console.log('[DB] Migration: added users.failed_login_attempts');
  }
  if (!userCols.includes('locked_until')) {
    db.exec(`ALTER TABLE users ADD COLUMN locked_until TEXT`);
    console.log('[DB] Migration: added users.locked_until');
  }

  // v1.0.4: Remove NOT NULL from users.licence_plate so admin-created (email-only)
  // users can be inserted without a licence plate.
  // Pre-1.0.4 databases defined licence_plate TEXT NOT NULL UNIQUE; the CREATE TABLE
  // was later updated to TEXT UNIQUE (nullable) but existing databases kept the old
  // constraint, causing every admin user-creation attempt to fail with a 500 error.
  const licencePlateInfo = userColsInfo.find((c) => c.name === 'licence_plate');
  if (licencePlateInfo && licencePlateInfo.notnull === 1) {
    // SQLite does not support DROP CONSTRAINT; the standard workaround is to
    // rebuild the table. Foreign-key enforcement must be disabled during the
    // rename/copy/drop sequence and re-enabled afterwards.
    db.pragma('foreign_keys = OFF');
    const migrateUsersTable = db.transaction(() => {
      db.exec(`ALTER TABLE users RENAME TO users_v103`);
      db.exec(`
        CREATE TABLE users (
          id                     INTEGER PRIMARY KEY AUTOINCREMENT,
          licence_plate          TEXT UNIQUE,
          password_hash          TEXT NOT NULL,
          is_admin               INTEGER NOT NULL DEFAULT 0,
          email                  TEXT,
          display_name           TEXT,
          failed_login_attempts  INTEGER NOT NULL DEFAULT 0,
          locked_until           TEXT,
          created_at             TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.exec(`
        INSERT INTO users
          (id, licence_plate, password_hash, is_admin, email, display_name,
           failed_login_attempts, locked_until, created_at)
        SELECT
          id, licence_plate, password_hash, is_admin, email, display_name,
          failed_login_attempts, locked_until, created_at
        FROM users_v103
      `);
      db.exec(`DROP TABLE users_v103`);
      // Recreate the partial unique index that was dropped with the old table.
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
          ON users(email) WHERE email IS NOT NULL
      `);
    });
    migrateUsersTable();
    db.pragma('foreign_keys = ON');
    console.log('[DB] Migration: removed NOT NULL from users.licence_plate (v1.0.3 → v1.0.4)');
  }

  // Tariff peak/off-peak time-of-day columns
  const tariffCols = (db.pragma('table_info(tariff_config)') as Array<{ name: string }>).map((c) => c.name);
  if (!tariffCols.includes('off_peak_rate_pence_per_kwh')) {
    db.exec(`ALTER TABLE tariff_config ADD COLUMN off_peak_rate_pence_per_kwh REAL NOT NULL DEFAULT 0`);
    console.log('[DB] Migration: added tariff_config.off_peak_rate_pence_per_kwh');
  }
  if (!tariffCols.includes('peak_start_time')) {
    db.exec(`ALTER TABLE tariff_config ADD COLUMN peak_start_time TEXT NOT NULL DEFAULT '07:00'`);
    console.log('[DB] Migration: added tariff_config.peak_start_time');
  }
  if (!tariffCols.includes('off_peak_start_time')) {
    db.exec(`ALTER TABLE tariff_config ADD COLUMN off_peak_start_time TEXT NOT NULL DEFAULT '00:00'`);
    console.log('[DB] Migration: added tariff_config.off_peak_start_time');
  }

  // Vehicle type and battery capacity columns
  const vehicleCols = (db.pragma('table_info(vehicles)') as Array<{ name: string }>).map((c) => c.name);
  if (!vehicleCols.includes('vehicle_type')) {
    db.exec(`ALTER TABLE vehicles ADD COLUMN vehicle_type TEXT`);
    console.log('[DB] Migration: added vehicles.vehicle_type');
  }
  if (!vehicleCols.includes('battery_kwh')) {
    db.exec(`ALTER TABLE vehicles ADD COLUMN battery_kwh REAL`);
    console.log('[DB] Migration: added vehicles.battery_kwh');
  }

  // vehicle_id on charging_sessions
  const sessionCols = (db.pragma('table_info(charging_sessions)') as Array<{ name: string }>).map((c) => c.name);
  if (!sessionCols.includes('vehicle_id')) {
    db.exec(`ALTER TABLE charging_sessions ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL`);
    console.log('[DB] Migration: added charging_sessions.vehicle_id');
  }

  // vehicle_id on maintenance_log
  const maintCols = (db.pragma('table_info(maintenance_log)') as Array<{ name: string }>).map((c) => c.name);
  if (!maintCols.includes('vehicle_id')) {
    db.exec(`ALTER TABLE maintenance_log ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL`);
    console.log('[DB] Migration: added maintenance_log.vehicle_id');
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
