import { Router, Request, Response } from 'express';
import db from '../db/database';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest, ChargerCost } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const costs = db
      .prepare(
        `SELECT cc.*, cs.date_unplugged, cs.odometer_miles
         FROM charger_costs cc
         JOIN charging_sessions cs ON cc.session_id = cs.id
         WHERE cc.user_id = ?
         ORDER BY cs.date_unplugged DESC`
      )
      .all(authReq.user!.userId);
    res.json({ costs });
  } catch (err) {
    console.error('[charger/GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { session_id, energy_kwh, price_pence, charger_type, charger_name } =
      req.body as Partial<ChargerCost> & { session_id: number };

    if (!session_id || energy_kwh === undefined || price_pence === undefined || !charger_type) {
      res.status(400).json({ error: 'session_id, energy_kwh, price_pence, and charger_type are required' });
      return;
    }

    if (!['home', 'public'].includes(charger_type)) {
      res.status(400).json({ error: 'charger_type must be home or public' });
      return;
    }

    // Verify session belongs to user
    const session = db
      .prepare(`SELECT id FROM charging_sessions WHERE id = ? AND user_id = ?`)
      .get(session_id, authReq.user!.userId);

    if (!session) {
      res.status(404).json({ error: 'Session not found or not owned by user' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO charger_costs (session_id, user_id, energy_kwh, price_pence, charger_type, charger_name)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        session_id,
        authReq.user!.userId,
        energy_kwh,
        price_pence,
        charger_type,
        charger_name ?? null
      );

    const cost = db
      .prepare(`SELECT * FROM charger_costs WHERE id = ?`)
      .get(result.lastInsertRowid) as ChargerCost;

    res.status(201).json({ cost });
  } catch (err) {
    console.error('[charger/POST]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const costId = parseInt(req.params.id, 10);

    const cost = db
      .prepare(`SELECT * FROM charger_costs WHERE id = ?`)
      .get(costId) as ChargerCost | undefined;

    if (!cost) {
      res.status(404).json({ error: 'Charger cost not found' });
      return;
    }

    if (cost.user_id !== authReq.user!.userId && !authReq.user!.isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    db.prepare(`DELETE FROM charger_costs WHERE id = ?`).run(costId);
    res.json({ message: 'Charger cost deleted' });
  } catch (err) {
    console.error('[charger/DELETE]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
