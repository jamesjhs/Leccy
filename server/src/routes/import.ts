import { Router, Request, Response } from 'express';
import multer from 'multer';
import db from '../db/database';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticate);

// Configure multer for CSV upload (limit to 5MB, accept CSV only)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

/**
 * Parse dd/mm/yy or dd/mm/yyyy → YYYY-MM-DD
 * Returns null if the string cannot be parsed.
 */
function parseDate(raw: string): string | null {
  const str = raw.trim();
  const parts = str.split('/');
  if (parts.length !== 3) return null;

  const dd = parts[0].padStart(2, '0');
  const mm = parts[1].padStart(2, '0');
  let yyyy = parts[2].trim();

  if (yyyy.length === 2) {
    const yy = parseInt(yyyy, 10);
    yyyy = String(yy <= 49 ? 2000 + yy : 1900 + yy);
  }

  if (yyyy.length !== 4) return null;

  const d = parseInt(dd, 10),
    m = parseInt(mm, 10),
    y = parseInt(yyyy, 10);

  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;

  return `${yyyy}-${mm}-${dd}`;
}

/**
 * POST /import/sessions
 * Upload and import charging sessions from CSV
 *
 * CSV format (7 required columns + optional vehicle plate + optional charger kWh + optional price):
 *   1. odometer_miles (required)
 *   2. initial_battery_pct (required)
 *   3. initial_range_miles (required)
 *   4. final_battery_pct (required)
 *   5. final_range_miles (required)
 *   6. air_temp_celsius (required)
 *   7. date_unplugged (required) - dd/mm/yy or dd/mm/yyyy
 *   8. vehicle_licence_plate (optional)
 *   9. charger_kwh_logged (optional)
 *   10. price_pence (optional, defaults to 0)
 *
 * Header row is automatically detected and skipped.
 */
router.post('/sessions', upload.single('csv'), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.userId;

    // Ensure file was provided
    if (!req.file) {
      res.status(400).json({ error: 'No CSV file provided' });
      return;
    }

    // Get user data
    const user = db.prepare('SELECT id, licence_plate FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Parse CSV
    const csvText = req.file.buffer.toString('utf8');
    const rawLines = csvText.split(/\r?\n/).filter((l) => l.trim() !== '');

    if (rawLines.length === 0) {
      res.status(400).json({ error: 'CSV file is empty' });
      return;
    }

    // Detect and skip optional header row
    let startLine = 0;
    const firstCols = rawLines[0].split(',');
    if (isNaN(parseFloat(firstCols[0].trim()))) {
      startLine = 1;
    }

    // Prepare statements
    const insertSession = db.prepare(
      `INSERT INTO charging_sessions
        (user_id, vehicle_id, odometer_miles, initial_battery_pct, initial_range_miles,
         final_battery_pct, final_range_miles, air_temp_celsius, date_unplugged)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertChargerCost = db.prepare(
      `INSERT INTO charger_costs (session_id, user_id, energy_kwh, price_pence, charger_type)
       VALUES (?, ?, ?, ?, 'home')`
    );

    let imported = 0;
    const skipped: string[] = [];

    const importAll = db.transaction(() => {
      for (let i = startLine; i < rawLines.length; i++) {
        const lineNum = i + 1;
        const cols = rawLines[i].split(',');

        // Check minimum required columns
        if (cols.length < 7) {
          skipped.push(`Line ${lineNum}: expected at least 7 columns, got ${cols.length}`);
          continue;
        }

        // Parse required columns
        const odometer = parseFloat(cols[0].trim());
        const initialBattPct = parseFloat(cols[1].trim());
        const initialRangeMi = parseFloat(cols[2].trim());
        const finalBattPct = parseFloat(cols[3].trim());
        const finalRangeMi = parseFloat(cols[4].trim());
        const airTempC = parseFloat(cols[5].trim());
        const dateUnplugged = parseDate(cols[6]);

        // Validate numerics
        const nums = [odometer, initialBattPct, initialRangeMi, finalBattPct, finalRangeMi, airTempC];
        if (nums.some(isNaN)) {
          skipped.push(`Line ${lineNum}: non-numeric value detected`);
          continue;
        }

        // Validate date
        if (!dateUnplugged) {
          skipped.push(`Line ${lineNum}: invalid date "${cols[6].trim()}" (expected dd/mm/yy or dd/mm/yyyy)`);
          continue;
        }

        // Range validation
        if (odometer < 0 || odometer > 999999) {
          skipped.push(`Line ${lineNum}: odometer ${odometer} out of range [0, 999999]`);
          continue;
        }
        if (initialBattPct < 0 || initialBattPct > 100 || finalBattPct < 0 || finalBattPct > 100) {
          skipped.push(`Line ${lineNum}: battery percentage out of range [0, 100]`);
          continue;
        }
        if (initialRangeMi < 0 || initialRangeMi > 1000 || finalRangeMi < 0 || finalRangeMi > 1000) {
          skipped.push(`Line ${lineNum}: range value out of range [0, 1000]`);
          continue;
        }
        if (airTempC < -60 || airTempC > 60) {
          skipped.push(`Line ${lineNum}: air temperature ${airTempC} out of range [-60, 60]`);
          continue;
        }

        // Optional col 8: vehicle_licence_plate
        let vehicleId = null;
        if (cols.length > 7) {
          const plateRaw = cols[7].trim().replace(/\s+/g, '').toUpperCase();
          if (plateRaw !== '') {
            const vehicle = db.prepare(`SELECT id FROM vehicles WHERE licence_plate = ? AND user_id = ?`).get(plateRaw, userId) as any;
            if (vehicle) {
              vehicleId = vehicle.id;
            } else {
              // Skip warning, just import without vehicle association
            }
          }
        }

        // Optional col 9: charger_kwh_logged
        let chargerKwh = null;
        if (cols.length > 8) {
          const kwhRaw = cols[8].trim();
          if (kwhRaw !== '') {
            const kwh = parseFloat(kwhRaw);
            if (isNaN(kwh) || !isFinite(kwh) || kwh <= 0 || kwh > 200) {
              skipped.push(`Line ${lineNum}: charger_kwh_logged "${kwhRaw}" is invalid (must be > 0 and ≤ 200)`);
              continue;
            }
            chargerKwh = kwh;
          }
        }

        // Optional col 10: price_pence (NEW)
        let pricePence = 0;
        if (cols.length > 9) {
          const priceRaw = cols[9].trim();
          if (priceRaw !== '') {
            const price = parseFloat(priceRaw);
            if (isNaN(price) || !isFinite(price) || price < 0) {
              skipped.push(`Line ${lineNum}: price_pence "${priceRaw}" is invalid (must be >= 0)`);
              continue;
            }
            pricePence = Math.round(price);
          }
        }

        // Insert session
        const result = insertSession.run(userId, vehicleId, odometer, initialBattPct, initialRangeMi, finalBattPct, finalRangeMi, airTempC, dateUnplugged);

        // Insert charger cost if kWh provided
        if (chargerKwh !== null) {
          insertChargerCost.run(result.lastInsertRowid, userId, chargerKwh, pricePence);
        }

        imported++;
      }
    });

    try {
      importAll();
    } catch (err: any) {
      console.error('[import/sessions transaction]', err);
      res.status(500).json({ error: 'Database error during import', details: err.message });
      return;
    }

    res.json({
      success: true,
      summary: {
        imported,
        skipped: skipped.length,
        total: rawLines.length - startLine,
      },
      errors: skipped.length > 0 ? skipped.slice(0, 20) : undefined, // Return first 20 errors
    });
  } catch (err) {
    console.error('[import/sessions]', err);
    res.status(500).json({ error: 'Failed to process import' });
  }
});

export default router;
