import { Router, Request, Response } from 'express';
import db from '../db/database';
import { authenticate } from '../middleware/auth';
import { validateQuery, analyticsQuerySchema } from '../middleware/validate';
import {
  AuthenticatedRequest,
  AnalyticsResult,
  EfficiencyPoint,
  CostPerSession,
  TempVsRange,
  MilesPerPct,
  EnrichedSession,
} from '../types';

const router = Router();
router.use(authenticate);

interface RawSession {
  id: number;
  date_unplugged: string;
  odometer_miles: number;
  initial_battery_pct: number;
  initial_range_miles: number;
  final_battery_pct: number;
  final_range_miles: number;
  air_temp_celsius: number;
  cost_pence: number | null;
  energy_kwh: number | null;
}

router.get('/', validateQuery(analyticsQuerySchema), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { startDate, endDate, vehicleId } = req.query as {
      startDate?: string;
      endDate?: string;
      vehicleId?: string;
    };

    let whereClause = `WHERE cs.user_id = ?`;
    const params: (string | number)[] = [authReq.user!.userId];

    if (vehicleId) {
      whereClause += ` AND cs.vehicle_id = ?`;
      params.push(parseInt(vehicleId, 10));
    }
    if (startDate) {
      whereClause += ` AND cs.date_unplugged >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ` AND cs.date_unplugged <= ?`;
      params.push(endDate);
    }

    const sessions = db
      .prepare(
        `SELECT
           cs.id,
           cs.date_unplugged,
           cs.odometer_miles,
           cs.initial_battery_pct,
           cs.initial_range_miles,
           cs.final_battery_pct,
           cs.final_range_miles,
           cs.air_temp_celsius,
           cc.price_pence AS cost_pence,
           cc.energy_kwh
         FROM charging_sessions cs
         LEFT JOIN charger_costs cc ON cc.session_id = cs.id
         ${whereClause}
         ORDER BY cs.date_unplugged ASC`
      )
      .all(...params) as RawSession[];

    let totalCostPence = 0;
    let totalKwh = 0;
    let totalMiles = 0;

    const efficiencyData: EfficiencyPoint[] = [];
    const costPerSession: CostPerSession[] = [];
    const tempVsRange: TempVsRange[] = [];
    const milesPerPct: MilesPerPct[] = [];

    for (const s of sessions) {
      const costPence = s.cost_pence ?? 0;
      const kwh = s.energy_kwh ?? 0;
      const pctCharged = s.final_battery_pct - s.initial_battery_pct;
      const rangeDiff = s.final_range_miles - s.initial_range_miles;

      totalCostPence += costPence;
      totalKwh += kwh;

      // Estimate miles driven as range added (approximation)
      if (rangeDiff > 0) totalMiles += rangeDiff;

      // Battery efficiency: kWh per mile (if kwh & range data available)
      if (kwh > 0 && rangeDiff > 0) {
        const batteryEfficiency = kwh / rangeDiff; // kWh/mile
        efficiencyData.push({
          date: s.date_unplugged,
          battery_efficiency: Math.round(batteryEfficiency * 1000) / 1000,
          range_miles: s.final_range_miles,
          temp_celsius: s.air_temp_celsius,
        });
      }

      if (costPence > 0 || kwh > 0) {
        costPerSession.push({
          date: s.date_unplugged,
          cost_pence: costPence,
          energy_kwh: kwh,
        });
      }

      // Temperature vs range efficiency (range per 1% battery)
      if (pctCharged > 0) {
        const rangePerPct = rangeDiff / pctCharged;
        if (rangePerPct > 0) {
          tempVsRange.push({
            temp_celsius: s.air_temp_celsius,
            range_per_pct: Math.round(rangePerPct * 100) / 100,
          });

          milesPerPct.push({
            date: s.date_unplugged,
            miles_per_pct: Math.round(rangePerPct * 100) / 100,
          });
        }
      }
    }

    const costPerMile = totalMiles > 0 ? totalCostPence / totalMiles : 0;

    // Build enriched sessions (sorted by date then odometer for GOM pairing)
    const sortedForEnrich = [...sessions].sort(
      (a, b) =>
        new Date(a.date_unplugged).getTime() - new Date(b.date_unplugged).getTime() ||
        a.odometer_miles - b.odometer_miles,
    );

    const enrichedSessions: EnrichedSession[] = sortedForEnrich.map((s, i) => {
      const maxRange100 =
        s.final_battery_pct > 0
          ? Math.round((s.final_range_miles / s.final_battery_pct) * 100 * 10) / 10
          : 0;

      let distanceDriven: number | null = null;
      let estimatedRangeConsumed: number | null = null;

      if (i > 0) {
        const prev = sortedForEnrich[i - 1];
        const odometerDiff = s.odometer_miles - prev.odometer_miles;
        if (odometerDiff > 0) {
          distanceDriven = Math.round(odometerDiff * 10) / 10;
          const gomEstimate = prev.final_range_miles - s.initial_range_miles;
          if (gomEstimate > 0) {
            estimatedRangeConsumed = Math.round(gomEstimate * 10) / 10;
          }
        }
      }

      return {
        id: s.id,
        date: s.date_unplugged,
        odometer: s.odometer_miles,
        max_range_100_pct: maxRange100,
        end_charge_temperature: s.air_temp_celsius,
        energy_kwh: s.energy_kwh ?? 0,
        initial_battery_percent: s.initial_battery_pct,
        pct_charged: s.final_battery_pct - s.initial_battery_pct,
        distance_driven: distanceDriven,
        estimated_range_consumed: estimatedRangeConsumed,
      };
    });

    const result: AnalyticsResult = {
      total_cost_pence: totalCostPence,
      cost_per_mile_pence: Math.round(costPerMile * 100) / 100,
      total_kwh: Math.round(totalKwh * 1000) / 1000,
      miles_driven: Math.round(totalMiles * 10) / 10,
      sessions_count: sessions.length,
      efficiency_data: efficiencyData,
      cost_per_session: costPerSession,
      temp_vs_range: tempVsRange,
      miles_per_pct: milesPerPct,
      enriched_sessions: enrichedSessions,
    };

    res.json(result);
  } catch (err) {
    console.error('[analytics/GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
