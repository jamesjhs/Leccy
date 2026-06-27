import { Router, Request, Response } from 'express';
import db from '../db/database';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest, User } from '../types';
import { isPushConfigured } from '../services/chargeReminderScheduler';
import { getSetting } from '../db/database';

const router = Router();

const BASE64URL_RE = /^[A-Za-z0-9\-_]+={0,2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const P256DH_MAX_LEN = 200;
const AUTH_MAX_LEN = 50;
const DEFAULT_PUSH_TIME = '07:30';

function getVapidPublicKey(): string {
  return getSetting('VAPID_PUBLIC_KEY') ?? process.env.VAPID_PUBLIC_KEY ?? '';
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

router.get('/vapid-public-key', (_req: Request, res: Response): void => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    res.status(503).json({ error: 'Push notifications are not configured on this server.' });
    return;
  }
  res.json({ publicKey });
});

router.use(authenticate);

router.get('/settings', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = db
      .prepare(`SELECT push_notifications_enabled, push_reminder_time, push_time_zone FROM users WHERE id = ?`)
      .get(authReq.user!.userId) as Pick<User, 'push_notifications_enabled' | 'push_reminder_time' | 'push_time_zone'> | undefined;

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      enabled: user.push_notifications_enabled !== 0,
      reminder_time: TIME_RE.test(user.push_reminder_time) ? user.push_reminder_time : DEFAULT_PUSH_TIME,
      time_zone: user.push_time_zone,
      configured: isPushConfigured(),
    });
  } catch (err) {
    console.error('[push/settings GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/settings', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { enabled, reminder_time, time_zone } = req.body as {
      enabled?: unknown;
      reminder_time?: unknown;
      time_zone?: unknown;
    };

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean.' });
      return;
    }
    if (reminder_time !== undefined && (typeof reminder_time !== 'string' || !TIME_RE.test(reminder_time))) {
      res.status(400).json({ error: 'reminder_time must be HH:MM.' });
      return;
    }
    if (time_zone !== undefined && time_zone !== null && !validTimeZone(time_zone)) {
      res.status(400).json({ error: 'time_zone must be a valid IANA time zone.' });
      return;
    }

    const existing = db
      .prepare(`SELECT push_notifications_enabled, push_reminder_time, push_time_zone FROM users WHERE id = ?`)
      .get(authReq.user!.userId) as Pick<User, 'push_notifications_enabled' | 'push_reminder_time' | 'push_time_zone'> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const nextEnabled = enabled ?? existing.push_notifications_enabled !== 0;
    const nextTime = typeof reminder_time === 'string' ? reminder_time : existing.push_reminder_time || DEFAULT_PUSH_TIME;
    const nextZone = time_zone === undefined ? existing.push_time_zone : time_zone;

    db.prepare(`UPDATE users SET push_notifications_enabled = ?, push_reminder_time = ?, push_time_zone = ? WHERE id = ?`)
      .run(nextEnabled ? 1 : 0, nextTime, nextZone ?? null, authReq.user!.userId);

    if (!nextEnabled) {
      db.prepare(`DELETE FROM push_subscriptions WHERE user_id = ?`).run(authReq.user!.userId);
    }

    res.json({
      enabled: nextEnabled,
      reminder_time: nextTime,
      time_zone: nextZone ?? null,
      configured: isPushConfigured(),
    });
  } catch (err) {
    console.error('[push/settings PUT]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/subscribe', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { endpoint, keys } = req.body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: 'Missing endpoint or keys.' });
      return;
    }

    let parsedEndpoint: URL;
    try {
      parsedEndpoint = new URL(endpoint);
    } catch {
      res.status(400).json({ error: 'endpoint must be a valid URL.' });
      return;
    }
    if (parsedEndpoint.protocol !== 'https:') {
      res.status(400).json({ error: 'endpoint must use HTTPS.' });
      return;
    }
    if (
      !BASE64URL_RE.test(keys.p256dh) ||
      keys.p256dh.length > P256DH_MAX_LEN ||
      !BASE64URL_RE.test(keys.auth) ||
      keys.auth.length > AUTH_MAX_LEN
    ) {
      res.status(400).json({ error: 'Invalid key format.' });
      return;
    }

    const existing = db
      .prepare(`SELECT id, user_id FROM push_subscriptions WHERE endpoint = ?`)
      .get(endpoint) as { id: number; user_id: number } | undefined;

    if (existing) {
      if (existing.user_id !== authReq.user!.userId) {
        res.json({ ok: true });
        return;
      }
      db.prepare(`UPDATE push_subscriptions SET keys_p256dh = ?, keys_auth = ? WHERE endpoint = ?`)
        .run(keys.p256dh, keys.auth, endpoint);
    } else {
      db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth) VALUES (?, ?, ?, ?)`)
        .run(authReq.user!.userId, endpoint, keys.p256dh, keys.auth);
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[push/subscribe POST]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/subscribe', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) {
      res.status(400).json({ error: 'Missing endpoint.' });
      return;
    }
    db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?`).run(endpoint, authReq.user!.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[push/subscribe DELETE]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/charge-started', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { vehicle_id, started_at, time_zone } = req.body as {
      vehicle_id?: number | null;
      started_at?: string;
      time_zone?: string | null;
    };

    if (vehicle_id !== undefined && vehicle_id !== null) {
      const vehicle = db
        .prepare(`SELECT id FROM vehicles WHERE id = ? AND user_id = ?`)
        .get(vehicle_id, authReq.user!.userId);
      if (!vehicle) {
        res.status(404).json({ error: 'Vehicle not found' });
        return;
      }
    }

    if (time_zone && validTimeZone(time_zone)) {
      db.prepare(`UPDATE users SET push_time_zone = COALESCE(push_time_zone, ?) WHERE id = ?`)
        .run(time_zone, authReq.user!.userId);
    }

    db.prepare(
      `INSERT INTO pending_charge_reminders (user_id, vehicle_id, started_at, last_notified_date, updated_at)
       VALUES (?, ?, ?, NULL, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         vehicle_id = excluded.vehicle_id,
         started_at = excluded.started_at,
         last_notified_date = NULL,
         updated_at = datetime('now')`,
    ).run(authReq.user!.userId, vehicle_id ?? null, started_at ?? new Date().toISOString());

    res.json({ ok: true });
  } catch (err) {
    console.error('[push/charge-started POST]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/charge-started', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    db.prepare(`DELETE FROM pending_charge_reminders WHERE user_id = ?`).run(authReq.user!.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[push/charge-started DELETE]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
