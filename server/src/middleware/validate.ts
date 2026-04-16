/**
 * Input validation middleware using Zod.
 *
 * Calling validate(schema) or validateQuery(schema) returns an Express
 * middleware that:
 *  1. Parses the request body / query with the schema
 *  2. Strips any unknown keys (preventing mass-assignment and oversized payloads)
 *  3. Applies any transforms defined in the schema (e.g. .trim(), .toUpperCase())
 *  4. Replaces req.body / req.query with the cleaned, typed data
 *  5. Returns 400 with field-level messages on failure
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/* -------------------------------------------------------------------------
 * Middleware factories
 * ---------------------------------------------------------------------- */

export function validate<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.errors.map(
        (e) => `${e.path.join('.') || 'body'}: ${e.message}`
      );
      res.status(400).json({ error: 'Validation failed', details });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.errors.map(
        (e) => `${e.path.join('.') || 'query'}: ${e.message}`
      );
      res.status(400).json({ error: 'Validation failed', details });
      return;
    }
    // Cast is safe — query params overwritten with sanitised values
    (req as Request & { query: unknown }).query = result.data as Record<string, string>;
    next();
  };
}

/* -------------------------------------------------------------------------
 * Reusable field schemas
 * ---------------------------------------------------------------------- */

/** ISO date string YYYY-MM-DD */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format');

/** Bounded trimmed non-empty string */
const str = (max: number) => z.string().min(1).max(max).transform((s) => s.trim());

/** Non-negative integer pence amount */
const pence = (maxPounds = 100_000) =>
  z.number().int('Must be a whole number of pence').nonnegative().max(maxPounds * 100);

/** Finite non-negative real */
const nnReal = (max: number) =>
  z.number({ invalid_type_error: 'Must be a number' }).finite().nonnegative().max(max);

/** Percentage 0–100 */
const percentage = z
  .number({ invalid_type_error: 'Must be a number' })
  .finite()
  .min(0)
  .max(100);

/* -------------------------------------------------------------------------
 * Route schemas
 * ---------------------------------------------------------------------- */

/** POST /auth/register */
export const registerSchema = z.object({
  email: z.string().email('Invalid email address').max(255).transform((s) => s.trim().toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
  display_name: z.string().min(1).max(100).transform((s) => s.trim()).optional(),
  /** Honeypot field — must be absent or empty; bots typically fill it */
  _hp: z.string().max(0, 'Unexpected value').optional().default(''),
});

/** POST /auth/login */
export const loginSchema = z.object({
  email: z.string().email('Invalid email address').max(255).transform((s) => s.trim().toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long'),
  /** Honeypot field — must be absent or empty; bots typically fill it */
  _hp: z.string().max(0, 'Unexpected value').optional().default(''),
});

/** POST /auth/magic-link/request */
export const magicLinkRequestSchema = z.object({
  email: z.string().email('Invalid email address').max(255).transform((s) => s.trim().toLowerCase()),
  _hp: z.string().max(0, 'Unexpected value').optional().default(''),
});

/** POST /auth/magic-link/verify */
export const magicLinkVerifySchema = z.object({
  token: z.string().min(1).max(128),
});

/** POST /auth/change-password */
export const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(128),
  new_password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
});

/** POST /auth/2fa/disable — just needs password confirmation */
export const confirmPasswordSchema = z.object({
  password: z.string().min(1).max(128),
});

/** POST /auth/2fa/verify-login */
export const verify2faLoginSchema = z.object({
  temp_token: z.string().min(1).max(512),
  code: z.string().min(1).max(20),
});

/** POST /sessions */
export const sessionSchema = z.object({
  vehicle_id: z.number().int().positive().optional().nullable(),
  odometer_miles: nnReal(999_999),
  initial_battery_pct: percentage,
  initial_range_miles: nnReal(1_000),
  final_battery_pct: percentage,
  final_range_miles: nnReal(1_000),
  air_temp_celsius: z
    .number({ invalid_type_error: 'Must be a number' })
    .finite()
    .min(-60, 'Temperature below -60 °C is outside expected range')
    .max(60, 'Temperature above 60 °C is outside expected range'),
  date_unplugged: isoDate,
});

/** POST /charger */
export const chargerCostSchema = z.object({
  session_id: z.number().int().positive(),
  energy_kwh: z
    .number({ invalid_type_error: 'Must be a number' })
    .finite()
    .positive('Must be greater than zero')
    .max(200, 'Energy exceeds expected maximum'),
  price_pence: pence(10_000),
  charger_type: z.enum(['home', 'public']),
  charger_name: z
    .string()
    .max(100)
    .transform((s) => s.trim())
    .optional(),
});

/** PUT /charger/:id */
export const chargerCostUpdateSchema = z.object({
  energy_kwh: z
    .number({ invalid_type_error: 'Must be a number' })
    .finite()
    .positive('Must be greater than zero')
    .max(200, 'Energy exceeds expected maximum')
    .optional(),
  price_pence: pence(10_000).optional(),
  charger_type: z.enum(['home', 'public']).optional(),
});

/** POST /maintenance */
export const maintenanceSchema = z.object({
  vehicle_id: z.number().int().positive().optional().nullable(),
  description: str(2_000),
  log_date: isoDate,
  cost_pence: pence(100_000).nullable().optional(),
});

/** HH:MM 24-hour time string */
const timeStr = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be a time in HH:MM format');

/** POST /tariff */
export const tariffSchema = z.object({
  tariff_name: str(100),
  rate_pence_per_kwh: nnReal(10_000),
  standing_charge_pence: nnReal(10_000),
  peak_start_time: timeStr,
  off_peak_rate_pence_per_kwh: nnReal(10_000),
  off_peak_start_time: timeStr,
  effective_from: isoDate,
});

/** PUT /tariff/:id */
export const tariffUpdateSchema = tariffSchema.partial();

/** POST /admin/users */
export const createUserSchema = z.object({
  email: z.string().email('Invalid email address').max(255).transform((s) => s.trim().toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long'),
  display_name: z.string().max(100).optional(),
  is_admin: z.boolean().optional().default(false),
});

/** PUT /admin/settings — only allow known SMTP keys */
export const smtpSettingsSchema = z
  .object({
    SMTP_HOST: z.string().max(255).optional(),
    SMTP_PORT: z
      .string()
      .regex(/^\d{1,5}$/, 'Port must be a number')
      .optional(),
    SMTP_SECURE: z.enum(['true', 'false']).optional(),
    SMTP_USER: z.string().max(255).optional(),
    SMTP_PASS: z.string().max(255).optional(),
    SMTP_FROM: z.string().email('Invalid from address').max(255).optional(),
  })
  .strip(); // Discard any keys not listed above

/** POST /admin/2fa/setup */
export const setup2faSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
});

/** POST /admin/2fa/verify */
export const verify2faSchema = z.object({
  code: z.string().min(1).max(20),
});

/** GET /analytics — query param validation */
export const analyticsQuerySchema = z.object({
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  vehicleId: z.string().regex(/^\d+$/, 'Must be a positive integer').optional(),
});

/** POST /vehicles */
export const createVehicleSchema = z.object({
  licence_plate: z
    .string()
    .min(1, 'Licence plate is required')
    .max(30, 'Licence plate too long')
    .transform((s) => s.replace(/\s+/g, '').toUpperCase()),
  nickname: z.string().max(100).transform((s) => s.trim()).optional(),
  vehicle_type: z.string().max(100).transform((s) => s.trim()).optional(),
  battery_kwh: nnReal(500).optional().nullable(),
});

/** PUT /vehicles/:id */
export const updateVehicleSchema = createVehicleSchema.partial();
