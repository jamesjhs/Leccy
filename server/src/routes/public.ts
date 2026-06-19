import { Router, Request, Response } from 'express';
import db from '../db/database';

const router = Router();

const DEFAULT_PETROL_PRICE_PPL = 148;
const TYPICAL_PETROL_MPG = 40;
const LITRES_PER_GALLON = 4.54609;

interface PublicStatsRow {
  sessions_logged: number;
  total_cost_pence: number | null;
  miles_tracked: number | null;
}

function fuelCostPence(miles: number, fuelPricePpl: number, mpg: number): number {
  if (miles <= 0 || mpg <= 0) return 0;
  const gallons = miles / mpg;
  const litres = gallons * LITRES_PER_GALLON;
  return litres * fuelPricePpl;
}

router.get('/stats', (_req: Request, res: Response): void => {
  try {
    const row = db
      .prepare(
        `WITH public_sessions AS (
           SELECT
             cs.id,
             cs.user_id,
             cs.vehicle_id,
             cs.odometer_miles,
             cs.date_unplugged,
             cs.created_at
           FROM charging_sessions cs
         ),
         session_miles AS (
           SELECT
             odometer_miles - LAG(odometer_miles) OVER (
               PARTITION BY user_id, COALESCE(vehicle_id, 0)
               ORDER BY date_unplugged, created_at, id
             ) AS miles_delta
           FROM public_sessions
         )
         SELECT
           (SELECT COUNT(*) FROM public_sessions) AS sessions_logged,
           (
             SELECT COALESCE(SUM(cc.price_pence), 0)
             FROM charger_costs cc
           ) AS total_cost_pence,
           (
             SELECT COALESCE(SUM(miles_delta), 0)
             FROM session_miles
             WHERE miles_delta > 0 AND miles_delta <= 2000
           ) AS miles_tracked`
      )
      .get() as PublicStatsRow;

    const totalCostPence = row.total_cost_pence ?? 0;
    const milesTracked = Math.round((row.miles_tracked ?? 0) * 10) / 10;
    const petrolCostPence = fuelCostPence(milesTracked, DEFAULT_PETROL_PRICE_PPL, TYPICAL_PETROL_MPG);
    const savingsPence = Math.max(0, Math.round(petrolCostPence - totalCostPence));
    const savingsPercent = petrolCostPence > 0
      ? Math.max(0, Math.round((savingsPence / petrolCostPence) * 100))
      : 0;
    const costPerMilePence = milesTracked > 0 ? Math.round((totalCostPence / milesTracked) * 10) / 10 : 0;

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      miles_tracked: milesTracked,
      total_cost_pence: totalCostPence,
      savings_pence: savingsPence,
      savings_percent: savingsPercent,
      sessions_logged: row.sessions_logged,
      cost_per_mile_pence: costPerMilePence,
    });
  } catch (err) {
    console.error('[public/stats]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
