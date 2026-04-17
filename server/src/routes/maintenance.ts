import { Router, Request, Response } from 'express';
import db from '../db/database';
import { authenticate } from '../middleware/auth';
import { validate, maintenanceSchema } from '../middleware/validate';
import { AuthenticatedRequest, MaintenanceLog } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { vehicleId } = req.query as { vehicleId?: string };

    let query = `SELECT * FROM maintenance_log WHERE user_id = ?`;
    const params: (string | number)[] = [authReq.user!.userId];

    if (vehicleId) {
      query += ` AND vehicle_id = ?`;
      params.push(parseInt(vehicleId, 10));
    }

    query += ` ORDER BY log_date DESC, created_at DESC`;

    const entries = db.prepare(query).all(...params) as MaintenanceLog[];
    res.json({ entries });
  } catch (err) {
    console.error('[maintenance/GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', validate(maintenanceSchema), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { vehicle_id, description, log_date, cost_pence } = req.body as {
      vehicle_id?: number | null;
      description: string;
      log_date: string;
      cost_pence?: number | null;
    };

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
        `INSERT INTO maintenance_log (user_id, vehicle_id, description, log_date, cost_pence) VALUES (?, ?, ?, ?, ?)`
      )
      .run(authReq.user!.userId, vehicle_id ?? null, description, log_date, cost_pence ?? null);

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

    if (!Number.isInteger(entryId) || entryId <= 0) {
      res.status(400).json({ error: 'Invalid entry ID' });
      return;
    }

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
