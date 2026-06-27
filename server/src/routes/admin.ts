import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import webpush from 'web-push';
import db, { getSetting, setSetting } from '../db/database';
import { authenticate, requireAdmin } from '../middleware/auth';
import { configureWebPush, startChargeReminderScheduler } from '../services/chargeReminderScheduler';
import {
  validate,
  createUserSchema,
  smtpSettingsSchema,
} from '../middleware/validate';
import { AuthenticatedRequest, User, AppSetting } from '../types';

const router = Router();
router.use(authenticate, requireAdmin);

const VAPID_KEY_RE = /^[A-Za-z0-9\-_]+=*$/;
const VAPID_PUBLIC_KEY_MIN = 80;
const VAPID_PUBLIC_KEY_MAX = 100;
const VAPID_PRIVATE_KEY_MIN = 38;
const VAPID_PRIVATE_KEY_MAX = 50;

function getVapidSetting(key: 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'): string {
  return getSetting(key) ?? process.env[key] ?? '';
}

function validateVapidSubject(subject: string): string | null {
  const mailtoMatch = subject.match(/^mailto:([^\s]+)$/i);
  if (mailtoMatch) {
    const email = mailtoMatch[1];
    const atIdx = email.indexOf('@');
    if (atIdx > 0 && atIdx === email.lastIndexOf('@') && atIdx < email.length - 1) {
      return null;
    }
    return 'VAPID subject mailto URI must contain a valid email address';
  }

  try {
    const url = new URL(subject);
    return url.protocol === 'https:' ? null : 'VAPID subject must be a mailto: URI or an https:// URL';
  } catch {
    return 'VAPID subject must be a mailto: URI or a valid https:// URL';
  }
}

function validateVapidKey(key: string, type: 'public' | 'private'): string | null {
  const min = type === 'public' ? VAPID_PUBLIC_KEY_MIN : VAPID_PRIVATE_KEY_MIN;
  const max = type === 'public' ? VAPID_PUBLIC_KEY_MAX : VAPID_PRIVATE_KEY_MAX;
  if (!VAPID_KEY_RE.test(key) || key.length < min || key.length > max) {
    return `Invalid VAPID ${type} key format or length`;
  }
  return null;
}

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
      s.key === 'SMTP_PASS' ? { ...s, value: s.value != null && s.value !== '' ? '********' : '' } : s
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

// GET /admin/vapid
router.get('/vapid', (_req: Request, res: Response): void => {
  try {
    const publicKey = getVapidSetting('VAPID_PUBLIC_KEY');
    const privateKey = getVapidSetting('VAPID_PRIVATE_KEY');
    const subject = getVapidSetting('VAPID_SUBJECT') || 'mailto:admin@localhost';
    res.json({
      publicKey,
      subject,
      privateKeyConfigured: privateKey !== '',
      configured: publicKey !== '' && privateKey !== '',
    });
  } catch (err) {
    console.error('[admin/vapid GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /admin/vapid
router.put('/vapid', (req: Request, res: Response): void => {
  try {
    const { publicKey, privateKey, subject } = req.body as {
      publicKey?: unknown;
      privateKey?: unknown;
      subject?: unknown;
    };

    const nextPublicKey = typeof publicKey === 'string' && publicKey.trim() !== ''
      ? publicKey.trim()
      : getVapidSetting('VAPID_PUBLIC_KEY');
    const nextPrivateKey = typeof privateKey === 'string' && privateKey.trim() !== ''
      ? privateKey.trim()
      : getVapidSetting('VAPID_PRIVATE_KEY');
    const nextSubject = typeof subject === 'string' && subject.trim() !== ''
      ? subject.trim()
      : getVapidSetting('VAPID_SUBJECT') || 'mailto:admin@localhost';

    if (nextPublicKey) {
      const error = validateVapidKey(nextPublicKey, 'public');
      if (error) {
        res.status(400).json({ error });
        return;
      }
    }
    if (nextPrivateKey) {
      const error = validateVapidKey(nextPrivateKey, 'private');
      if (error) {
        res.status(400).json({ error });
        return;
      }
    }
    const subjectError = validateVapidSubject(nextSubject);
    if (subjectError) {
      res.status(400).json({ error: subjectError });
      return;
    }

    setSetting('VAPID_PUBLIC_KEY', nextPublicKey);
    setSetting('VAPID_PRIVATE_KEY', nextPrivateKey);
    setSetting('VAPID_SUBJECT', nextSubject);

    configureWebPush();
    startChargeReminderScheduler();

    res.json({ message: 'VAPID settings updated' });
  } catch (err) {
    console.error('[admin/vapid PUT]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/vapid/generate
router.get('/vapid/generate', (_req: Request, res: Response): void => {
  try {
    const keys = webpush.generateVAPIDKeys();
    res.json({ publicKey: keys.publicKey, privateKey: keys.privateKey });
  } catch (err) {
    console.error('[admin/vapid/generate GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/version (convenience)
router.get('/version', (_req: Request, res: Response): void => {
  const version = getSetting('APP_VERSION') || '0.0.1';
  res.json({ version });
});

export default router;
