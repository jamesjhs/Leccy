/**
 * Centralised, validated environment configuration.
 *
 * All security-sensitive env vars are read ONCE here.  The module throws
 * immediately at import time if a required value is missing in production so
 * the process never silently falls back to an insecure default.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

// ─── JWT_SECRET ────────────────────────────────────────────────────────────────
// Must be set explicitly; the fallback is intentionally only accepted in
// development so a misconfigured production deployment fails loudly.
const jwtSecretRaw = process.env.JWT_SECRET;
const INSECURE_DEFAULT_SECRET = 'change_this_jwt_secret_to_something_secure';

if (IS_PROD && (!jwtSecretRaw || jwtSecretRaw === INSECURE_DEFAULT_SECRET)) {
  console.error(
    '[config] FATAL: JWT_SECRET is not set or is still using the default value. ' +
    'Set a strong, random secret in your .env file before running in production.',
  );
  process.exit(1);
}

export const JWT_SECRET: string = jwtSecretRaw || INSECURE_DEFAULT_SECRET;

// ─── JWT_EXPIRES_IN ────────────────────────────────────────────────────────────
// Validated to prevent absurd values being injected via the environment.
// Accepts the same formats that jsonwebtoken understands:
//   numeric-only strings (seconds), simple units like "7d" / "1h" / "30m",
//   compound forms like "2d 3h", and humanised strings like "10 minutes".
const rawExpiry = process.env.JWT_EXPIRES_IN || '7d';
// Allow anything that looks like a reasonable duration: digits, letters, spaces
// and common separators. Reject values that are clearly not a duration.
const VALID_EXPIRY = /^[\d\w\s]+$/.test(rawExpiry.trim()) && rawExpiry.trim().length > 0;
if (!VALID_EXPIRY) {
  console.warn(
    `[config] JWT_EXPIRES_IN "${rawExpiry}" does not look like a valid duration. ` +
    'Falling back to "7d".',
  );
}
export const JWT_EXPIRES_IN: string = VALID_EXPIRY ? rawExpiry.trim() : '7d';

export { IS_PROD };
