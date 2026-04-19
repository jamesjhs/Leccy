import { Router, Request, Response } from 'express';
import db from '../db/database';
import { authenticate } from '../middleware/auth';
import { validate, sessionSchema, sessionUpdateSchema } from '../middleware/validate';
import { AuthenticatedRequest, ChargingSession } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { vehicleId } = req.query as { vehicleId?: string };

    let query = `SELECT * FROM charging_sessions WHERE user_id = ?`;
    const params: (string | number)[] = [authReq.user!.userId];

    if (vehicleId !== undefined) {
      const vid = parseInt(vehicleId, 10);
      if (!Number.isInteger(vid) || vid <= 0) {
        res.status(400).json({ error: 'Invalid vehicle ID' });
        return;
      }
      query += ` AND vehicle_id = ?`;
      params.push(vid);
    }

    query += ` ORDER BY date_unplugged DESC, created_at DESC`;

    const sessions = db.prepare(query).all(...params) as ChargingSession[];
    res.json({ sessions });
  } catch (err) {
    console.error('[sessions/GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', validate(sessionSchema), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const {
      vehicle_id,
      odometer_miles,
      initial_battery_pct,
      initial_range_miles,
      final_battery_pct,
      final_range_miles,
      air_temp_celsius,
      date_unplugged,
    } = req.body as ChargingSession;

    // Verify vehicle belongs to the user if provided
    if (vehicle_id) {
      const vehicle = db
        .prepare(`SELECT id FROM vehicles WHERE id = ? AND user_id = ?`)
        .get(vehicle_id, authReq.user!.userId);
      if (!vehicle) {
        res.status(404).json({ error: 'Vehicle not found' });
        return;
      }
    }

    const result = db
      .prepare(
        `INSERT INTO charging_sessions
          (user_id, vehicle_id, odometer_miles, initial_battery_pct, initial_range_miles, final_battery_pct, final_range_miles, air_temp_celsius, date_unplugged)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        authReq.user!.userId,
        vehicle_id ?? null,
        odometer_miles,
        initial_battery_pct,
        initial_range_miles,
        final_battery_pct,
        final_range_miles,
        air_temp_celsius,
        date_unplugged
      );

    const session = db
      .prepare(`SELECT * FROM charging_sessions WHERE id = ?`)
      .get(result.lastInsertRowid) as ChargingSession;

    res.status(201).json({ session });
  } catch (err) {
    console.error('[sessions/POST]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', validate(sessionUpdateSchema), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const sessionId = parseInt(req.params.id, 10);

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }

    const existing = db
      .prepare(`SELECT * FROM charging_sessions WHERE id = ?`)
      .get(sessionId) as ChargingSession | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (existing.user_id !== authReq.user!.userId && !authReq.user!.isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const {
      odometer_miles,
      initial_battery_pct,
      initial_range_miles,
      final_battery_pct,
      final_range_miles,
      air_temp_celsius,
      date_unplugged,
    } = req.body as Partial<ChargingSession>;

    db.prepare(
      `UPDATE charging_sessions SET
         odometer_miles    = COALESCE(?, odometer_miles),
         initial_battery_pct = COALESCE(?, initial_battery_pct),
         initial_range_miles = COALESCE(?, initial_range_miles),
         final_battery_pct   = COALESCE(?, final_battery_pct),
         final_range_miles   = COALESCE(?, final_range_miles),
         air_temp_celsius    = COALESCE(?, air_temp_celsius),
         date_unplugged      = COALESCE(?, date_unplugged)
       WHERE id = ?`
    ).run(
      odometer_miles ?? null,
      initial_battery_pct ?? null,
      initial_range_miles ?? null,
      final_battery_pct ?? null,
      final_range_miles ?? null,
      air_temp_celsius ?? null,
      date_unplugged ?? null,
      sessionId,
    );

    const updated = db
      .prepare(`SELECT * FROM charging_sessions WHERE id = ?`)
      .get(sessionId) as ChargingSession;

    res.json({ session: updated });
  } catch (err) {
    console.error('[sessions/PUT]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const sessionId = parseInt(req.params.id, 10);

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }

    const session = db
      .prepare(`SELECT * FROM charging_sessions WHERE id = ?`)
      .get(sessionId) as ChargingSession | undefined;

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.user_id !== authReq.user!.userId && !authReq.user!.isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    db.prepare(`DELETE FROM charging_sessions WHERE id = ?`).run(sessionId);
    res.json({ message: 'Session deleted' });
  } catch (err) {
    console.error('[sessions/DELETE]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
