import { Router, Request, Response } from 'express';
import db from '../db/database';
import { authenticate } from '../middleware/auth';
import { validate, tariffSchema, tariffUpdateSchema } from '../middleware/validate';
import { AuthenticatedRequest, TariffConfig } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tariffs = db
      .prepare(
        `SELECT * FROM tariff_config WHERE user_id = ? ORDER BY effective_from DESC`
      )
      .all(authReq.user!.userId) as TariffConfig[];
    res.json({ tariffs });
  } catch (err) {
    console.error('[tariff/GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', validate(tariffSchema), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { tariff_name, rate_pence_per_kwh, standing_charge_pence, effective_from } =
      req.body as TariffConfig;

    const result = db
      .prepare(
        `INSERT INTO tariff_config (user_id, tariff_name, rate_pence_per_kwh, standing_charge_pence, effective_from)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(authReq.user!.userId, tariff_name, rate_pence_per_kwh, standing_charge_pence, effective_from);

    const tariff = db
      .prepare(`SELECT * FROM tariff_config WHERE id = ?`)
      .get(result.lastInsertRowid) as TariffConfig;

    res.status(201).json({ tariff });
  } catch (err) {
    console.error('[tariff/POST]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', validate(tariffUpdateSchema), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tariffId = parseInt(req.params.id, 10);

    if (!Number.isInteger(tariffId) || tariffId <= 0) {
      res.status(400).json({ error: 'Invalid tariff ID' });
      return;
    }

    const existing = db
      .prepare(`SELECT * FROM tariff_config WHERE id = ?`)
      .get(tariffId) as TariffConfig | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Tariff not found' });
      return;
    }

    if (existing.user_id !== authReq.user!.userId && !authReq.user!.isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { tariff_name, rate_pence_per_kwh, standing_charge_pence, effective_from } =
      req.body as Partial<TariffConfig>;

    db.prepare(
      `UPDATE tariff_config SET
        tariff_name = COALESCE(?, tariff_name),
        rate_pence_per_kwh = COALESCE(?, rate_pence_per_kwh),
        standing_charge_pence = COALESCE(?, standing_charge_pence),
        effective_from = COALESCE(?, effective_from)
       WHERE id = ?`
    ).run(
      tariff_name ?? null,
      rate_pence_per_kwh ?? null,
      standing_charge_pence ?? null,
      effective_from ?? null,
      tariffId
    );

    const updated = db
      .prepare(`SELECT * FROM tariff_config WHERE id = ?`)
      .get(tariffId) as TariffConfig;

    res.json({ tariff: updated });
  } catch (err) {
    console.error('[tariff/PUT]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tariffId = parseInt(req.params.id, 10);

    if (!Number.isInteger(tariffId) || tariffId <= 0) {
      res.status(400).json({ error: 'Invalid tariff ID' });
      return;
    }

    const tariff = db
      .prepare(`SELECT * FROM tariff_config WHERE id = ?`)
      .get(tariffId) as TariffConfig | undefined;

    if (!tariff) {
      res.status(404).json({ error: 'Tariff not found' });
      return;
    }

    if (tariff.user_id !== authReq.user!.userId && !authReq.user!.isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    db.prepare(`DELETE FROM tariff_config WHERE id = ?`).run(tariffId);
    res.json({ message: 'Tariff deleted' });
  } catch (err) {
    console.error('[tariff/DELETE]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
