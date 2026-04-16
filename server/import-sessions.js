#!/usr/bin/env node
/**
 * import-sessions.js
 *
 * Bulk-imports charging sessions from a CSV file directly into the Leccy
 * SQLite database.  Run this from the server/ directory (or repo root) on
 * the server — no running application needed.
 *
 * Usage:
 *   node server/import-sessions.js <licence_plate> [csv_path]
 *
 *   licence_plate  Licence plate of the user to import sessions for
 *                  (e.g. AB12CDE or ADMIN).
 *   csv_path       Path to the CSV file.
 *                  Defaults to ~/charging_sessions.csv
 *
 * CSV format (no header row required, but a header row is accepted and skipped
 * automatically if the first column is non-numeric):
 *
 *   odometer_miles, initial_battery_pct, initial_range_miles,
 *   final_battery_pct, final_range_miles, air_temp_celsius, date
 *
 * The date column must be in dd/mm/yy or dd/mm/yyyy format.
 *
 * Examples:
 *   node server/import-sessions.js AB12CDE
 *   node server/import-sessions.js AB12CDE /home/james/sessions_2024.csv
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ---------------------------------------------------------------------------
// Early --help check (before any file-system operations)
// ---------------------------------------------------------------------------
{
  const a = process.argv.slice(2);
  if (a.length === 0 || a[0] === '--help' || a[0] === '-h') {
    console.log('Usage: node server/import-sessions.js <licence_plate> [csv_path]');
    console.log('');
    console.log('  licence_plate   Licence plate of the target user (e.g. AB12CDE or ADMIN)');
    console.log('  csv_path        Path to CSV file (default: ~/charging_sessions.csv)');
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Load .env from the repo root (two levels up from server/)
// ---------------------------------------------------------------------------
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

// ---------------------------------------------------------------------------
// Resolve the database path (mirrors database.ts logic)
// ---------------------------------------------------------------------------
const dbPath     = process.env.DB_PATH || './data/leccy.db';
const resolvedDb = path.resolve(__dirname, '..', dbPath);

if (!fs.existsSync(resolvedDb)) {
  console.error(`ERROR: Database not found at ${resolvedDb}`);
  console.error('Make sure the Leccy server has been started at least once to initialise the database, and that DB_PATH in .env is correct.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Open the database (better-sqlite3 is already installed in server/node_modules)
// ---------------------------------------------------------------------------
const Database = require('better-sqlite3');
const db = new Database(resolvedDb);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const licencePlate = args[0].replace(/\s+/g, '').toUpperCase();
const csvPath      = args[1]
  ? path.resolve(args[1].replace(/^~/, os.homedir()))
  : path.join(os.homedir(), 'charging_sessions.csv');

// ---------------------------------------------------------------------------
// Look up the user
// ---------------------------------------------------------------------------
const user = db.prepare('SELECT id, licence_plate FROM users WHERE licence_plate = ?').get(licencePlate);
if (!user) {
  console.error(`ERROR: No user found with licence plate "${licencePlate}".`);
  const all = db.prepare('SELECT licence_plate FROM users ORDER BY id').all();
  console.error('Known licence plates:', all.map((r) => r.licence_plate).join(', '));
  process.exit(1);
}

console.log(`Importing for user: ${user.licence_plate} (id=${user.id})`);

// ---------------------------------------------------------------------------
// Read and parse the CSV
// ---------------------------------------------------------------------------
if (!fs.existsSync(csvPath)) {
  console.error(`ERROR: CSV file not found at ${csvPath}`);
  process.exit(1);
}

const csvText = fs.readFileSync(csvPath, 'utf8');
const rawLines = csvText.split(/\r?\n/).filter((l) => l.trim() !== '');

if (rawLines.length === 0) {
  console.error('ERROR: CSV file is empty.');
  process.exit(1);
}

/**
 * Convert dd/mm/yy or dd/mm/yyyy → YYYY-MM-DD.
 * Returns null if the string cannot be parsed.
 */
function parseDate(raw) {
  const str = raw.trim();
  const parts = str.split('/');
  if (parts.length !== 3) return null;

  const dd   = parts[0].padStart(2, '0');
  const mm   = parts[1].padStart(2, '0');
  let   yyyy = parts[2].trim();

  if (yyyy.length === 2) {
    // Two-digit year pivot: 00–49 → 2000–2049, 50–99 → 1950–1999
    const yy = parseInt(yyyy, 10);
    yyyy = String(yy <= 49 ? 2000 + yy : 1900 + yy);
  }

  if (yyyy.length !== 4) return null;

  const d = parseInt(dd, 10), m = parseInt(mm, 10), y = parseInt(yyyy, 10);

  // Validate that the date actually exists in the calendar
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;

  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Detect and skip optional header row
// ---------------------------------------------------------------------------
let startLine = 0;
const firstCols = rawLines[0].split(',');
if (isNaN(parseFloat(firstCols[0].trim()))) {
  console.log('Header row detected — skipping first line.');
  startLine = 1;
}

// ---------------------------------------------------------------------------
// Prepare the INSERT statement
// ---------------------------------------------------------------------------
const insert = db.prepare(
  `INSERT INTO charging_sessions
     (user_id, odometer_miles, initial_battery_pct, initial_range_miles,
      final_battery_pct, final_range_miles, air_temp_celsius, date_unplugged)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

// ---------------------------------------------------------------------------
// Import rows inside a transaction for speed and atomicity
// ---------------------------------------------------------------------------
let imported = 0;
let skipped  = 0;

const importAll = db.transaction(() => {
  for (let i = startLine; i < rawLines.length; i++) {
    const lineNum = i + 1;
    const cols    = rawLines[i].split(',');

    if (cols.length < 7) {
      console.warn(`  Line ${lineNum}: expected 7 columns, got ${cols.length} — skipping.`);
      skipped++;
      continue;
    }

    const odometer         = parseFloat(cols[0].trim());
    const initialBattPct   = parseFloat(cols[1].trim());
    const initialRangeMi   = parseFloat(cols[2].trim());
    const finalBattPct     = parseFloat(cols[3].trim());
    const finalRangeMi     = parseFloat(cols[4].trim());
    const airTempC         = parseFloat(cols[5].trim());
    const dateUnplugged    = parseDate(cols[6]);

    // Validate numerics
    const nums = [odometer, initialBattPct, initialRangeMi, finalBattPct, finalRangeMi, airTempC];
    if (nums.some(isNaN)) {
      console.warn(`  Line ${lineNum}: non-numeric value detected — skipping. (${rawLines[i]})`);
      skipped++;
      continue;
    }

    // Validate date
    if (!dateUnplugged) {
      console.warn(`  Line ${lineNum}: invalid date "${cols[6].trim()}" (expected dd/mm/yy) — skipping.`);
      skipped++;
      continue;
    }

    // Range checks matching the application's validation rules
    if (odometer < 0 || odometer > 999999) {
      console.warn(`  Line ${lineNum}: odometer ${odometer} out of range [0, 999999] — skipping.`);
      skipped++;
      continue;
    }
    if (initialBattPct < 0 || initialBattPct > 100 || finalBattPct < 0 || finalBattPct > 100) {
      console.warn(`  Line ${lineNum}: battery percentage out of range [0, 100] — skipping.`);
      skipped++;
      continue;
    }
    if (initialRangeMi < 0 || initialRangeMi > 1000 || finalRangeMi < 0 || finalRangeMi > 1000) {
      console.warn(`  Line ${lineNum}: range value out of range [0, 1000] — skipping.`);
      skipped++;
      continue;
    }
    if (airTempC < -60 || airTempC > 60) {
      console.warn(`  Line ${lineNum}: air temperature ${airTempC} out of range [-60, 60] — skipping.`);
      skipped++;
      continue;
    }

    insert.run(user.id, odometer, initialBattPct, initialRangeMi, finalBattPct, finalRangeMi, airTempC, dateUnplugged);
    imported++;
  }
});

try {
  importAll();
} catch (err) {
  console.error('ERROR: Import failed with database error:', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('');
console.log('Import complete.');
console.log(`  Imported : ${imported}`);
console.log(`  Skipped  : ${skipped}`);
console.log(`  Total    : ${rawLines.length - startLine}`);
