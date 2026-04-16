import { Router, Request, Response } from 'express';
import db from '../db/database';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest, MaintenanceLog } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const entries = db
      .prepare(
        `SELECT * FROM maintenance_log WHERE user_id = ? ORDER BY log_date DESC, created_at DESC`
      )
      .all(authReq.user!.userId) as MaintenanceLog[];
    res.json({ entries });
  } catch (err) {
    console.error('[maintenance/GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { description, log_date, cost_pence } = req.body as {
      description: string;
      log_date: string;
      cost_pence?: number | null;
    };

    if (!description || !log_date) {
      res.status(400).json({ error: 'description and log_date are required' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO maintenance_log (user_id, description, log_date, cost_pence) VALUES (?, ?, ?, ?)`
      )
      .run(authReq.user!.userId, description, log_date, cost_pence ?? null);

    const entry = db
      .prepare(`SELECT * FROM maintenance_log WHERE id = ?`)
      .get(result.lastInsertRowid) as MaintenanceLog;

    res.status(201).json({ entry });
  } catch (err) {
    console.error('[maintenance/POST]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const entryId = parseInt(req.params.id, 10);

    const entry = db
      .prepare(`SELECT * FROM maintenance_log WHERE id = ?`)
      .get(entryId) as MaintenanceLog | undefined;

    if (!entry) {
      res.status(404).json({ error: 'Maintenance entry not found' });
      return;
    }

    if (entry.user_id !== authReq.user!.userId && !authReq.user!.isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    db.prepare(`DELETE FROM maintenance_log WHERE id = ?`).run(entryId);
    res.json({ message: 'Entry deleted' });
  } catch (err) {
    console.error('[maintenance/DELETE]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
