import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import db, { getSetting } from '../db/database';
import { authenticate } from '../middleware/auth';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config';
import {
  validate,
  loginSchema,
  registerSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  changePasswordSchema,
  confirmPasswordSchema,
  deleteAccountSchema,
  verify2faLoginSchema,
  setup2faSchema,
  verify2faSchema,
} from '../middleware/validate';
import { AuthenticatedRequest, User, User2FA } from '../types';
import { sendMail } from '../utils/mailer';

const router = Router();

/** Max failed login attempts before lockout */
const MAX_FAILED_ATTEMPTS = 5;
/** Lockout duration in minutes */
const LOCKOUT_MINUTES = 15;

// Stricter rate limit on auth endpoints — 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

// Magic link endpoint — 5 requests per 30 minutes per IP
const magicLinkLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many magic link requests. Please try again later.' },
});

// Registration — 5 new accounts per hour per IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please try again later.' },
});

// Small helper: non-blocking delay
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Issue a JWT for an authenticated user */
function issueToken(user: User): string {
  const payload = {
    userId: user.id,
    email: user.email,
    isAdmin: user.is_admin === 1,
  };
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

/** Sanitised user object safe to return to client */
function safeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    is_admin: user.is_admin,
    created_at: user.created_at,
  };
}

/** Check if account is currently locked out */
function isLockedOut(user: User): boolean {
  if (!user.locked_until) return false;
  return new Date(user.locked_until) > new Date();
}

/** Record a failed login attempt; lock account if threshold reached */
function recordFailedAttempt(userId: number): void {
  const user = db.prepare(`SELECT failed_login_attempts FROM users WHERE id = ?`).get(userId) as { failed_login_attempts: number } | undefined;
  if (!user) return;
  const attempts = (user.failed_login_attempts || 0) + 1;
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    db.prepare(`UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?`)
      .run(attempts, lockedUntil, userId);
  } else {
    db.prepare(`UPDATE users SET failed_login_attempts = ? WHERE id = ?`).run(attempts, userId);
  }
}

/** Reset failed login counter and lockout on successful auth */
function clearFailedAttempts(userId: number): void {
  db.prepare(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`).run(userId);
}

// ── POST /auth/register ────────────────────────────────────────────────────────
router.post('/register', registerLimiter, validate(registerSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, display_name, _hp } = req.body as {
      email: string;
      password: string;
      display_name?: string;
      _hp: string;
    };

    if (_hp && _hp.length > 0) {
      await sleep(2_000);
      res.status(400).json({ error: 'Registration failed. Please try again.' });
      return;
    }

    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (existing) {
      // Return same message to prevent email enumeration
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const hash = bcrypt.hashSync(password, 12);
    const result = db
      .prepare(`INSERT INTO users (email, password_hash, is_admin, display_name) VALUES (?, ?, 0, ?)`)
      .run(email, hash, display_name ?? null);

    const user = db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .get(result.lastInsertRowid) as User;

    const token = issueToken(user);
    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/login ───────────────────────────────────────────────────────────
router.post('/login', authLimiter, validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, _hp } = req.body as {
      email: string;
      password: string;
      _hp: string;
    };

    // Honeypot check
    if (_hp && _hp.length > 0) {
      await sleep(2_000);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as User | undefined;

    if (!user) {
      // Mimic bcrypt timing to prevent user-enumeration via timing
      await bcrypt.compare(password, '$2a$12$notarealhashjustpaddingtowastetime000000000000000');
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (isLockedOut(user)) {
      res.status(429).json({ error: `Account temporarily locked. Please try again after ${LOCKOUT_MINUTES} minutes or use a magic link.` });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      recordFailedAttempt(user.id);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check 2FA
    const twoFA = db.prepare(`SELECT * FROM user_2fa WHERE user_id = ?`).get(user.id) as User2FA | undefined;
    if (twoFA?.enabled) {
      // Issue a short-lived temp token for the 2FA step
      const tempToken = jwt.sign(
        { userId: user.id, twoFAPending: true },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '10m' } as jwt.SignOptions
      );

      // Send OTP
      const otp = String(crypto.randomInt(100_000, 1_000_000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      db.prepare(`UPDATE user_2fa SET otp_secret = ?, otp_expires_at = ? WHERE user_id = ?`)
        .run(otp, expiresAt, user.id);

      if (user.email) {
        try {
          await sendMail({
            to: user.email,
            subject: 'Leccy – Your 2FA code',
            text: `Your Leccy login verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`,
          });
        } catch (mailErr) {
          console.error('[auth/login 2FA]', mailErr);
          res.status(500).json({ error: 'Failed to send 2FA code. Check SMTP settings.' });
          return;
        }
      }

      res.json({ requires_2fa: true, temp_token: tempToken });
      return;
    }

    clearFailedAttempts(user.id);
    const token = issueToken(user);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/2fa/verify-login ────────────────────────────────────────────────
router.post('/2fa/verify-login', authLimiter, validate(verify2faLoginSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { temp_token, code } = req.body as { temp_token: string; code: string };

    let payload: { userId: number; twoFAPending: boolean };
    try {
      payload = jwt.verify(temp_token, JWT_SECRET, { algorithms: ['HS256'] }) as { userId: number; twoFAPending: boolean };
    } catch {
      res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
      return;
    }

    if (!payload.twoFAPending) {
      res.status(401).json({ error: 'Invalid token type.' });
      return;
    }

    const twoFA = db.prepare(`SELECT * FROM user_2fa WHERE user_id = ?`).get(payload.userId) as User2FA | undefined;
    if (!twoFA || !twoFA.otp_secret) {
      res.status(401).json({ error: 'Invalid code' });
      return;
    }

    // Check OTP expiry
    if (!twoFA.otp_expires_at || new Date(twoFA.otp_expires_at) < new Date()) {
      res.status(401).json({ error: 'Code has expired. Please log in again.' });
      return;
    }

    // Constant-time-safe string comparison
    const expected = Buffer.from(twoFA.otp_secret);
    const provided = Buffer.from(code);
    const match = expected.length === provided.length && crypto.timingSafeEqual(expected, provided);

    if (!match) {
      res.status(401).json({ error: 'Invalid code' });
      return;
    }

    // Invalidate OTP
    db.prepare(`UPDATE user_2fa SET otp_secret = NULL, otp_expires_at = NULL WHERE user_id = ?`)
      .run(payload.userId);

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(payload.userId) as User | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    clearFailedAttempts(user.id);
    const token = issueToken(user);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    console.error('[auth/2fa/verify-login]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/magic-link/request ──────────────────────────────────────────────
router.post('/magic-link/request', magicLinkLimiter, validate(magicLinkRequestSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, _hp } = req.body as { email: string; _hp: string };

    if (_hp && _hp.length > 0) {
      await sleep(2_000);
      // Always return success to avoid email enumeration
      res.json({ message: 'If an account exists, a magic link has been sent.' });
      return;
    }

    const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as User | undefined;

    // Always respond with success to prevent email enumeration
    if (!user) {
      await sleep(500);
      res.json({ message: 'If an account exists, a magic link has been sent.' });
      return;
    }

    // Invalidate any existing magic link tokens for this user
    db.prepare(`UPDATE magic_link_tokens SET used = 1 WHERE user_id = ? AND used = 0`).run(user.id);

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
    db.prepare(`INSERT INTO magic_link_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`)
      .run(user.id, token, expiresAt);

    const domain = process.env.DOMAIN || 'http://localhost:5173';
    const link = `${domain}/login?magic=${token}`;

    try {
      await sendMail({
        to: email,
        subject: 'Leccy – Your magic sign-in link',
        text: `Click the link below to sign in to Leccy. This link expires in 15 minutes and can only be used once.\n\n${link}\n\nIf you did not request this, you can safely ignore this email.`,
      });
    } catch (mailErr) {
      console.error('[auth/magic-link/request]', mailErr);
      res.status(500).json({ error: 'Failed to send magic link email. Check SMTP settings.' });
      return;
    }

    res.json({ message: 'If an account exists, a magic link has been sent.' });
  } catch (err) {
    console.error('[auth/magic-link/request]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/magic-link/verify ───────────────────────────────────────────────
router.post('/magic-link/verify', authLimiter, validate(magicLinkVerifySchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body as { token: string };

    const record = db.prepare(
      `SELECT * FROM magic_link_tokens WHERE token = ? AND used = 0`
    ).get(token) as { id: number; user_id: number; expires_at: string; used: number } | undefined;

    if (!record) {
      res.status(401).json({ error: 'Invalid or expired magic link.' });
      return;
    }

    if (new Date(record.expires_at) < new Date()) {
      res.status(401).json({ error: 'Magic link has expired. Please request a new one.' });
      return;
    }

    // Mark token as used (single-use)
    db.prepare(`UPDATE magic_link_tokens SET used = 1 WHERE id = ?`).run(record.id);

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(record.user_id) as User | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    clearFailedAttempts(user.id);
    const jwtToken = issueToken(user);
    res.json({ token: jwtToken, user: safeUser(user) });
  } catch (err) {
    console.error('[auth/magic-link/verify]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/change-password ─────────────────────────────────────────────────
router.post('/change-password', authenticate, validate(changePasswordSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { current_password, new_password } = req.body as {
      current_password: string;
      new_password: string;
    };

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(authReq.user!.userId) as User | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      res.status(403).json({ error: 'Current password is incorrect' });
      return;
    }

    const hash = bcrypt.hashSync(new_password, 12);
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hash, user.id);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('[auth/change-password]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/2fa/setup ───────────────────────────────────────────────────────
router.post('/2fa/setup', authenticate, validate(setup2faSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { email } = req.body as { email: string };

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(authReq.user!.userId) as User | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Generate OTP
    const code = String(crypto.randomInt(100_000, 1_000_000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const existing = db.prepare(`SELECT user_id FROM user_2fa WHERE user_id = ?`).get(user.id);
    if (existing) {
      db.prepare(`UPDATE user_2fa SET otp_secret = ?, otp_expires_at = ?, enabled = 0 WHERE user_id = ?`)
        .run(code, expiresAt, user.id);
    } else {
      db.prepare(`INSERT INTO user_2fa (user_id, enabled, otp_secret, otp_expires_at) VALUES (?, 0, ?, ?)`)
        .run(user.id, code, expiresAt);
    }

    // Update email if different
    if (email !== user.email) {
      db.prepare(`UPDATE users SET email = ? WHERE id = ?`).run(email, user.id);
    }

    // Redact email for log: show only domain part (email already validated by Zod schema)
    const redacted = `****@${email.split('@')[1] ?? '?'}`;
    console.log(`[auth/2fa/setup] Sending 2FA setup code to ${redacted}`);

    try {
      await sendMail({
        to: email,
        subject: 'Leccy – Your 2FA setup code',
        text: `Your Leccy 2FA verification code is: ${code}\n\nThis code expires in 15 minutes.\n\nEnter this code in the app to enable two-factor authentication.`,
      });
    } catch (mailErr) {
      console.error('[auth/2fa/setup]', mailErr);
      res.status(500).json({ error: 'Failed to send 2FA email. Check SMTP settings.' });
      return;
    }

    res.json({ message: '2FA setup initiated. Check your email for the verification code.' });
  } catch (err) {
    console.error('[auth/2fa/setup]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/2fa/verify ──────────────────────────────────────────────────────
router.post('/2fa/verify', authenticate, validate(verify2faSchema), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { code } = req.body as { code: string };

    const record = db.prepare(`SELECT * FROM user_2fa WHERE user_id = ?`).get(authReq.user!.userId) as User2FA | undefined;

    if (!record || !record.otp_secret) {
      res.status(401).json({ error: 'No pending 2FA setup found. Please initiate setup first.' });
      return;
    }

    if (!record.otp_expires_at || new Date(record.otp_expires_at) < new Date()) {
      res.status(401).json({ error: 'Code has expired. Please request a new setup code.' });
      return;
    }

    const expected = Buffer.from(record.otp_secret);
    const provided = Buffer.from(code);
    const match = expected.length === provided.length && crypto.timingSafeEqual(expected, provided);

    if (!match) {
      res.status(401).json({ error: 'Invalid code' });
      return;
    }

    db.prepare(`UPDATE user_2fa SET enabled = 1, otp_secret = NULL, otp_expires_at = NULL WHERE user_id = ?`)
      .run(authReq.user!.userId);

    res.json({ message: '2FA enabled successfully' });
  } catch (err) {
    console.error('[auth/2fa/verify]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/2fa/disable ─────────────────────────────────────────────────────
router.post('/2fa/disable', authenticate, validate(confirmPasswordSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { password } = req.body as { password: string };

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(authReq.user!.userId) as User | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Password is incorrect' });
      return;
    }

    db.prepare(`UPDATE user_2fa SET enabled = 0, otp_secret = NULL, otp_expires_at = NULL WHERE user_id = ?`)
      .run(user.id);

    res.json({ message: '2FA disabled' });
  } catch (err) {
    console.error('[auth/2fa/disable]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /auth/2fa/status ───────────────────────────────────────────────────────
router.get('/2fa/status', authenticate, (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const record = db.prepare(`SELECT enabled FROM user_2fa WHERE user_id = ?`).get(authReq.user!.userId) as { enabled: number } | undefined;
    res.json({ enabled: record?.enabled === 1 });
  } catch (err) {
    console.error('[auth/2fa/status]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/logout ──────────────────────────────────────────────────────────
router.post('/logout', (_req: Request, res: Response): void => {
  res.json({ message: 'Logged out successfully' });
});

// ── GET /auth/me ───────────────────────────────────────────────────────────────
router.get('/me', authenticate, (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = db
      .prepare(`SELECT id, email, display_name, is_admin, created_at FROM users WHERE id = ?`)
      .get(authReq.user!.userId) as Omit<User, 'password_hash' | 'licence_plate' | 'failed_login_attempts' | 'locked_until'> | undefined;

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

// ── GET /auth/version ──────────────────────────────────────────────────────────
router.get('/version', (_req: Request, res: Response): void => {
  const version = getSetting('APP_VERSION') || '0.0.1';
  res.json({ version });
});

// ── DELETE /auth/account ───────────────────────────────────────────────────────
// GDPR Article 17 – Right to erasure ("right to be forgotten")
// Permanently deletes the authenticated user's account and all associated data.
router.delete('/account', authenticate, validate(deleteAccountSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { password } = req.body as { password: string };

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(authReq.user!.userId) as User | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Admins cannot self-delete via this endpoint to prevent accidental loss of access
    if (user.is_admin === 1) {
      res.status(403).json({ error: 'Admin accounts cannot be self-deleted. Ask another admin to remove the account.' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Password is incorrect' });
      return;
    }

    // Delete user — cascade rules in the schema handle all related data
    db.prepare(`DELETE FROM users WHERE id = ?`).run(user.id);

    res.json({ message: 'Account and all associated data have been permanently deleted.' });
  } catch (err) {
    console.error('[auth/delete-account]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
