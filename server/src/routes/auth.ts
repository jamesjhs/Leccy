import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import db, { getSetting } from '../db/database';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest, User } from '../types';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_jwt_secret_to_something_secure';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Strict rate limit on login endpoint to prevent brute-force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

router.post('/login', loginLimiter, (req: Request, res: Response): void => {
  try {
    const { licence_plate, password } = req.body as { licence_plate: string; password: string };
    if (!licence_plate || !password) {
      res.status(400).json({ error: 'Licence plate and password are required' });
      return;
    }

    const user = db
      .prepare(`SELECT * FROM users WHERE licence_plate = ?`)
      .get(licence_plate.toUpperCase()) as User | undefined;

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
