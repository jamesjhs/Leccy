import nodemailer from 'nodemailer';
import { getSetting } from '../db/database';

/**
 * Build a nodemailer transporter from SMTP settings stored in app_settings.
 * Verbose logging is always enabled so SMTP conversations appear in the
 * server log — useful for diagnosing delivery issues without needing a
 * separate mail client or packet capture.
 * Throws if required SMTP settings are missing.
 */
export function createTransporter() {
  const host = getSetting('SMTP_HOST') || '';
  const port = parseInt(getSetting('SMTP_PORT') || '587', 10);
  const secure = getSetting('SMTP_SECURE') === 'true';
  const user = getSetting('SMTP_USER') || '';
  const pass = getSetting('SMTP_PASS') || '';

  if (!host) {
    throw new Error('SMTP_HOST is not configured. Set it in Admin → Settings.');
  }

  const isDev = process.env.NODE_ENV !== 'production';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    logger: isDev,  // only log SMTP conversations in development
    debug: isDev,   // only include DATA payload in log output in development
  });
}

/**
 * Send a plain-text email.
 * Throws on transport / auth / config failure so callers can surface the error.
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const from = getSetting('SMTP_FROM') || getSetting('SMTP_USER') || '';
  const transporter = createTransporter();
  await transporter.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text });
}
