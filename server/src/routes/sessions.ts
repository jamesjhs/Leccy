import { Router, Request, Response } from 'express';
import db from '../db/database';
import { authenticate } from '../middleware/auth';
import { validate, sessionSchema } from '../middleware/validate';
import { AuthenticatedRequest, ChargingSession } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const sessions = db
      .prepare(
        `SELECT * FROM charging_sessions WHERE user_id = ? ORDER BY date_unplugged DESC, created_at DESC`
      )
      .all(authReq.user!.userId) as ChargingSession[];
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
      odometer_miles,
      initial_battery_pct,
      initial_range_miles,
      final_battery_pct,
      final_range_miles,
      air_temp_celsius,
      date_unplugged,
    } = req.body as ChargingSession;

    const result = db
      .prepare(
        `INSERT INTO charging_sessions
          (user_id, odometer_miles, initial_battery_pct, initial_range_miles, final_battery_pct, final_range_miles, air_temp_celsius, date_unplugged)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        authReq.user!.userId,
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
