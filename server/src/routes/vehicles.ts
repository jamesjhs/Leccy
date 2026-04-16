import { Router, Request, Response } from 'express';
import db from '../db/database';
import { authenticate } from '../middleware/auth';
import { validate, createVehicleSchema, updateVehicleSchema } from '../middleware/validate';
import { AuthenticatedRequest, Vehicle } from '../types';

const router = Router();
router.use(authenticate);

// GET /vehicles — list all vehicles for current user
router.get('/', (_req: Request, res: Response): void => {
  try {
    const authReq = _req as AuthenticatedRequest;
    const vehicles = db
      .prepare(`SELECT * FROM vehicles WHERE user_id = ? ORDER BY created_at ASC`)
      .all(authReq.user!.userId) as Vehicle[];
    res.json({ vehicles });
  } catch (err) {
    console.error('[vehicles GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /vehicles — add a vehicle
router.post('/', validate(createVehicleSchema), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { licence_plate, nickname } = req.body as { licence_plate: string; nickname?: string };

    const existing = db.prepare(`SELECT id FROM vehicles WHERE licence_plate = ?`).get(licence_plate);
    if (existing) {
      res.status(409).json({ error: 'A vehicle with this licence plate already exists.' });
      return;
    }

    const result = db
      .prepare(`INSERT INTO vehicles (user_id, licence_plate, nickname) VALUES (?, ?, ?)`)
      .run(authReq.user!.userId, licence_plate, nickname ?? null);

    const vehicle = db
      .prepare(`SELECT * FROM vehicles WHERE id = ?`)
      .get(result.lastInsertRowid) as Vehicle;

    res.status(201).json({ vehicle });
  } catch (err) {
    console.error('[vehicles POST]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /vehicles/:id — update a vehicle
router.put('/:id', validate(updateVehicleSchema), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const vehicleId = parseInt(req.params.id, 10);

    if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
      res.status(400).json({ error: 'Invalid vehicle ID' });
      return;
    }

    const existing = db
      .prepare(`SELECT * FROM vehicles WHERE id = ? AND user_id = ?`)
      .get(vehicleId, authReq.user!.userId) as Vehicle | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const { licence_plate, nickname } = req.body as { licence_plate?: string; nickname?: string };
    const newPlate = licence_plate ?? existing.licence_plate;
    const newNick = nickname !== undefined ? nickname : existing.nickname;

    if (licence_plate && licence_plate !== existing.licence_plate) {
      const conflict = db.prepare(`SELECT id FROM vehicles WHERE licence_plate = ? AND id != ?`).get(licence_plate, vehicleId);
      if (conflict) {
        res.status(409).json({ error: 'A vehicle with this licence plate already exists.' });
        return;
      }
    }

    db.prepare(`UPDATE vehicles SET licence_plate = ?, nickname = ? WHERE id = ?`)
      .run(newPlate, newNick, vehicleId);

    const updated = db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(vehicleId) as Vehicle;
    res.json({ vehicle: updated });
  } catch (err) {
    console.error('[vehicles PUT]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /vehicles/:id — remove a vehicle
router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const vehicleId = parseInt(req.params.id, 10);

    if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
      res.status(400).json({ error: 'Invalid vehicle ID' });
      return;
    }

    const existing = db
      .prepare(`SELECT id FROM vehicles WHERE id = ? AND user_id = ?`)
      .get(vehicleId, authReq.user!.userId);
    if (!existing) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    db.prepare(`DELETE FROM vehicles WHERE id = ?`).run(vehicleId);
    res.json({ message: 'Vehicle removed' });
  } catch (err) {
    console.error('[vehicles DELETE]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
