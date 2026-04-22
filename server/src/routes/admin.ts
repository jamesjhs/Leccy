import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import db, { getSetting, setSetting } from '../db/database';
import { authenticate, requireAdmin } from '../middleware/auth';
import {
  validate,
  createUserSchema,
  smtpSettingsSchema,
} from '../middleware/validate';
import { AuthenticatedRequest, User, AppSetting } from '../types';

const router = Router();
router.use(authenticate, requireAdmin);

// GET /admin/users
router.get('/users', (_req: Request, res: Response): void => {
  try {
    const users = db
      .prepare(`SELECT id, email, display_name, is_admin, created_at FROM users ORDER BY created_at ASC`)
      .all() as Omit<User, 'password_hash' | 'licence_plate' | 'failed_login_attempts' | 'locked_until'>[];
    res.json({ users });
  } catch (err) {
    console.error('[admin/users GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/users
router.post('/users', validate(createUserSchema), (req: Request, res: Response): void => {
  try {
    const { email, password, display_name, is_admin } = req.body as {
      email: string;
      password: string;
      display_name?: string;
      is_admin: boolean;
    };

    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (existing) {
      res.status(409).json({ error: 'User with this email already exists' });
      return;
    }

    const hash = bcrypt.hashSync(password, 12);
    const result = db
      .prepare(
        `INSERT INTO users (email, password_hash, is_admin, display_name) VALUES (?, ?, ?, ?)`
      )
      .run(email, hash, is_admin ? 1 : 0, display_name ?? null);

    const user = db
      .prepare(`SELECT id, email, display_name, is_admin, created_at FROM users WHERE id = ?`)
      .get(result.lastInsertRowid) as Omit<User, 'password_hash' | 'licence_plate' | 'failed_login_attempts' | 'locked_until'>;

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
    // Mask the SMTP password so it is never returned to the client in plaintext
    const safeSettings = settings.map((s) =>
      s.key === 'SMTP_PASS' ? { ...s, value: s.value ? '********' : '' } : s
    );
    res.json({ settings: safeSettings });
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

// GET /admin/version (convenience)
router.get('/version', (_req: Request, res: Response): void => {
  const version = getSetting('APP_VERSION') || '0.0.1';
  res.json({ version });
});

export default router;
