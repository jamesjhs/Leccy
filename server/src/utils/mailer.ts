import nodemailer from 'nodemailer';
import { getSetting } from '../db/database';
import { IS_PROD } from '../config';

/**
 * Build a nodemailer transporter from SMTP settings stored in app_settings.
 * In development, verbose SMTP logging is enabled to aid debugging.
 * In production, logging is disabled to prevent credentials and OTP codes
 * from appearing in application logs.
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

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    // Disable verbose logging in production: SMTP AUTH commands contain
    // credentials and the DATA payload contains OTP codes — both would be
    // written to application logs and could be captured by log aggregators.
    logger: !IS_PROD,
    debug: !IS_PROD,
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
