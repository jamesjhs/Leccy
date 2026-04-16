import { Router, Request, Response } from 'express';
import db from '../db/database';
import { authenticate } from '../middleware/auth';
import { validate, chargerCostSchema, chargerCostUpdateSchema } from '../middleware/validate';
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

router.post('/', validate(chargerCostSchema), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { session_id, energy_kwh, price_pence, charger_type, charger_name } =
      req.body as ChargerCost & { session_id: number };

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

router.put('/:id', validate(chargerCostUpdateSchema), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const costId = parseInt(req.params.id, 10);

    if (!Number.isInteger(costId) || costId <= 0) {
      res.status(400).json({ error: 'Invalid cost ID' });
      return;
    }

    const existing = db
      .prepare(`SELECT * FROM charger_costs WHERE id = ?`)
      .get(costId) as ChargerCost | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Charger cost not found' });
      return;
    }

    if (existing.user_id !== authReq.user!.userId && !authReq.user!.isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { energy_kwh, price_pence, charger_type } = req.body as Partial<ChargerCost>;

    db.prepare(
      `UPDATE charger_costs SET
         energy_kwh = COALESCE(?, energy_kwh),
         price_pence = COALESCE(?, price_pence),
         charger_type = COALESCE(?, charger_type)
       WHERE id = ?`
    ).run(energy_kwh ?? null, price_pence ?? null, charger_type ?? null, costId);

    const updated = db
      .prepare(`SELECT * FROM charger_costs WHERE id = ?`)
      .get(costId) as ChargerCost;

    res.json({ cost: updated });
  } catch (err) {
    console.error('[charger/PUT]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const costId = parseInt(req.params.id, 10);

    if (!Number.isInteger(costId) || costId <= 0) {
      res.status(400).json({ error: 'Invalid cost ID' });
      return;
    }

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
