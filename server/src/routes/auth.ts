import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import db, { getSetting } from '../db/database';
import { authenticate } from '../middleware/auth';
import { validate, loginSchema } from '../middleware/validate';
import { AuthenticatedRequest, User } from '../types';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_jwt_secret_to_something_secure';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Stricter rate limit on login — 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// Small helper: non-blocking delay (used in bot/honeypot paths to waste time)
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

router.post('/login', loginLimiter, validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { licence_plate, password, _hp } = req.body as {
      licence_plate: string;
      password: string;
      _hp: string;
    };

    // ── Honeypot check ───────────────────────────────────────────────────────
    // The _hp field is hidden and empty in the real form. Bots filling it in
    // indicate automated submission. We delay and return a convincing 401 so
    // bots cannot distinguish a honeypot rejection from a real auth failure.
    if (_hp && _hp.length > 0) {
      await sleep(2_000);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // licence_plate is already normalised (stripped + uppercased) by Zod schema
    const user = db
      .prepare(`SELECT * FROM users WHERE licence_plate = ?`)
      .get(licence_plate) as User | undefined;

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const payload = {
      userId: user.id,
      licencePlate: user.licence_plate,
      isAdmin: user.is_admin === 1,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);

    res.json({
      token,
      user: {
        id: user.id,
        licence_plate: user.licence_plate,
        is_admin: user.is_admin,
        email: user.email,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', (_req: Request, res: Response): void => {
  res.json({ message: 'Logged out successfully' });
});

router.get('/me', authenticate, (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = db
      .prepare(`SELECT id, licence_plate, is_admin, email, created_at FROM users WHERE id = ?`)
      .get(authReq.user!.userId) as Omit<User, 'password_hash'> | undefined;

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/version', (_req: Request, res: Response): void => {
  const version = getSetting('APP_VERSION') || process.env.APP_VERSION || '0.0.1';
  res.json({ version });
});

export default router;
