import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import db, { getSetting, setSetting } from '../db/database';
import { authenticate, requireAdmin } from '../middleware/auth';
import {
  validate,
  createUserSchema,
  smtpSettingsSchema,
  setup2faSchema,
  verify2faSchema,
} from '../middleware/validate';
import { AuthenticatedRequest, User, AppSetting } from '../types';

const router = Router();
router.use(authenticate, requireAdmin);

// GET /admin/users
router.get('/users', (_req: Request, res: Response): void => {
  try {
    const users = db
      .prepare(`SELECT id, licence_plate, is_admin, email, created_at FROM users ORDER BY created_at ASC`)
      .all() as Omit<User, 'password_hash'>[];
    res.json({ users });
  } catch (err) {
    console.error('[admin/users GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/users
router.post('/users', validate(createUserSchema), (req: Request, res: Response): void => {
  try {
    // licence_plate is already normalised (uppercase + stripped) by Zod schema
    const { licence_plate, password, email, is_admin } = req.body as {
      licence_plate: string;
      password: string;
      email?: string | null;
      is_admin: boolean;
    };

    const existing = db
      .prepare(`SELECT id FROM users WHERE licence_plate = ?`)
      .get(licence_plate);
    if (existing) {
      res.status(409).json({ error: 'User with this licence plate already exists' });
      return;
    }

    const hash = bcrypt.hashSync(password, 12);
    const result = db
      .prepare(
        `INSERT INTO users (licence_plate, password_hash, is_admin, email) VALUES (?, ?, ?, ?)`
      )
      .run(licence_plate, hash, is_admin ? 1 : 0, email ?? null);

    const user = db
      .prepare(`SELECT id, licence_plate, is_admin, email, created_at FROM users WHERE id = ?`)
      .get(result.lastInsertRowid) as Omit<User, 'password_hash'>;

    res.status(201).json({ user });
  } catch (err) {
    console.error('[admin/users POST]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /admin/users/:id
router.delete('/users/:id', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const targetId = parseInt(req.params.id, 10);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    if (targetId === authReq.user!.userId) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(targetId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    db.prepare(`DELETE FROM users WHERE id = ?`).run(targetId);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('[admin/users DELETE]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/settings
router.get('/settings', (_req: Request, res: Response): void => {
  try {
    const settings = db
      .prepare(`SELECT key, value FROM app_settings WHERE key NOT IN ('DB_ENCRYPTION_KEY', 'JWT_SECRET')`)
      .all() as AppSetting[];
    res.json({ settings });
  } catch (err) {
    console.error('[admin/settings GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /admin/settings — only SMTP keys accepted (validated & stripped by Zod)
router.put('/settings', validate(smtpSettingsSchema), (req: Request, res: Response): void => {
  try {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      setSetting(key, String(value));
    }
    res.json({ message: 'Settings updated' });
  } catch (err) {
    console.error('[admin/settings PUT]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/2fa/setup
router.post('/2fa/setup', validate(setup2faSchema), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { email } = req.body as { email: string };

    const existing = db
      .prepare(`SELECT admin_id FROM admin_2fa WHERE admin_id = ?`)
      .get(authReq.user!.userId);

    if (existing) {
      db.prepare(`UPDATE admin_2fa SET email = ?, enabled = 0, secret = NULL WHERE admin_id = ?`)
        .run(email, authReq.user!.userId);
    } else {
      db.prepare(`INSERT INTO admin_2fa (admin_id, email, enabled, secret) VALUES (?, ?, 0, NULL)`)
        .run(authReq.user!.userId, email);
    }

    db.prepare(`UPDATE users SET email = ? WHERE id = ?`).run(email, authReq.user!.userId);

    res.json({ message: '2FA setup initiated. Verify to enable.' });
  } catch (err) {
    console.error('[admin/2fa/setup]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/2fa/verify
router.post('/2fa/verify', validate(verify2faSchema), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { code } = req.body as { code: string };

    const record = db
      .prepare(`SELECT * FROM admin_2fa WHERE admin_id = ?`)
      .get(authReq.user!.userId) as { admin_id: number; secret: string | null } | undefined;

    if (!record || record.secret !== code) {
      res.status(401).json({ error: 'Invalid code' });
      return;
    }

    db.prepare(`UPDATE admin_2fa SET enabled = 1, secret = NULL WHERE admin_id = ?`)
      .run(authReq.user!.userId);

    res.json({ message: '2FA enabled successfully' });
  } catch (err) {
    console.error('[admin/2fa/verify]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/version (convenience)
router.get('/version', (_req: Request, res: Response): void => {
  const version = getSetting('APP_VERSION') || '0.0.1';
  res.json({ version });
});

export default router;
