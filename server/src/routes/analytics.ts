import { Router, Request, Response } from 'express';
import db from '../db/database';
import { authenticate } from '../middleware/auth';
import { validateQuery, analyticsQuerySchema, ValidatedQueryRequest } from '../middleware/validate';
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
  vehicle_id: number | null;
  date_unplugged: string;
  odometer_miles: number;
  initial_battery_pct: number;
  initial_range_miles: number;
  final_battery_pct: number;
  final_range_miles: number;
  air_temp_celsius: number;
  cost_pence: number | null;
  energy_kwh: number | null;
  energy_source: 'measured' | 'estimated' | null;
  charger_type: 'home' | 'public' | null;
  battery_kwh: number | null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function tempBand(temp: number): string {
  if (temp < 0) return '<0C';
  if (temp < 5) return '0-5C';
  if (temp < 10) return '5-10C';
  if (temp < 15) return '10-15C';
  if (temp < 20) return '15-20C';
  return '20C+';
}

router.get('/', validateQuery(analyticsQuerySchema), (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { startDate, endDate, vehicleId } = (req as ValidatedQueryRequest<{
      startDate?: string;
      endDate?: string;
      vehicleId?: string;
    }>).validatedQuery ?? {};

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
           cs.vehicle_id,
           cs.date_unplugged,
           cs.odometer_miles,
           cs.initial_battery_pct,
           cs.initial_range_miles,
           cs.final_battery_pct,
           cs.final_range_miles,
           cs.air_temp_celsius,
           cc.price_pence AS cost_pence,
           cc.energy_kwh,
           cc.energy_source,
           cc.charger_type,
           v.battery_kwh
         FROM charging_sessions cs
         LEFT JOIN charger_costs cc ON cc.session_id = cs.id
         LEFT JOIN vehicles v ON v.id = cs.vehicle_id
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
          energy_source: s.energy_source,
          charger_type: s.charger_type,
        });
      }

      // Temperature vs range efficiency (range per 1% battery)
      if (pctCharged > 0) {
        const rangePerPct = rangeDiff / pctCharged;
        if (rangePerPct > 0) {
          tempVsRange.push({
            temp_celsius: s.air_temp_celsius,
            range_per_pct: Math.round(rangePerPct * 100) / 100,
            predicted_100_pct_range: Math.round(rangePerPct * 100 * 10) / 10,
          });

          milesPerPct.push({
            date: s.date_unplugged,
            miles_per_pct: Math.round(rangePerPct * 100) / 100,
            temp_celsius: s.air_temp_celsius,
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

    const maintenanceWhere = [`user_id = ?`];
    const maintenanceParams: (string | number)[] = [authReq.user!.userId];
    if (vehicleId) {
      maintenanceWhere.push(`vehicle_id = ?`);
      maintenanceParams.push(parseInt(vehicleId, 10));
    }
    if (startDate) {
      maintenanceWhere.push(`log_date >= ?`);
      maintenanceParams.push(startDate);
    }
    if (endDate) {
      maintenanceWhere.push(`log_date <= ?`);
      maintenanceParams.push(endDate);
    }
    const maintenanceRow = db
      .prepare(`SELECT COALESCE(SUM(cost_pence), 0) AS total FROM maintenance_log WHERE ${maintenanceWhere.join(' AND ')}`)
      .get(...maintenanceParams) as { total: number };

    const sortedForTrips = [...sessions].sort(
      (a, b) =>
        (a.vehicle_id ?? 0) - (b.vehicle_id ?? 0) ||
        new Date(a.date_unplugged).getTime() - new Date(b.date_unplugged).getTime() ||
        a.odometer_miles - b.odometer_miles,
    );
    const previousByVehicle = new Map<number | string, RawSession>();
    const odometerEfficiency = [];
    const tempBuckets = new Map<string, { sessions: number; total: number }>();
    const batteryCapacity = [];

    for (const s of sortedForTrips) {
      const key = s.vehicle_id ?? 'unlinked';
      const previous = previousByVehicle.get(key);
      previousByVehicle.set(key, s);
      if (!previous) continue;

      const tripMiles = s.odometer_miles - previous.odometer_miles;
      if (tripMiles <= 0 || tripMiles > 2000) continue;

      const kwh = s.energy_kwh ?? 0;
      if (kwh > 0) {
        const kwhPerMile = kwh / tripMiles;
        const costPerMilePence = (s.cost_pence ?? 0) / tripMiles;
        odometerEfficiency.push({
          date: s.date_unplugged,
          trip_miles: round(tripMiles, 1),
          energy_kwh: round(kwh, 2),
          kwh_per_mile: round(kwhPerMile, 3),
          cost_per_mile_pence: round(costPerMilePence, 1),
          charger_type: s.charger_type,
          energy_source: s.energy_source,
        });

        const bucket = tempBand(s.air_temp_celsius);
        const existing = tempBuckets.get(bucket) ?? { sessions: 0, total: 0 };
        tempBuckets.set(bucket, {
          sessions: existing.sessions + 1,
          total: existing.total + kwhPerMile,
        });
      }

      const socDelta = s.final_battery_pct - s.initial_battery_pct;
      if (s.energy_source === 'measured' && kwh > 0 && socDelta >= 20 && s.battery_kwh && s.battery_kwh > 0) {
        const estimatedUsableCapacity = kwh / (socDelta / 100);
        batteryCapacity.push({
          date: s.date_unplugged,
          estimated_usable_capacity_kwh: round(estimatedUsableCapacity, 1),
          nominal_battery_kwh: round(s.battery_kwh, 1),
          capacity_ratio_pct: round((estimatedUsableCapacity / s.battery_kwh) * 100, 1),
          soc_delta_pct: round(socDelta, 1),
        });
      }
    }

    const temperatureEfficiency = Array.from(tempBuckets.entries()).map(([band, bucket]) => ({
      band,
      sessions: bucket.sessions,
      avg_kwh_per_mile: round(bucket.total / bucket.sessions, 3),
    }));

    const home = sessions.filter((s) => s.charger_type === 'home');
    const away = sessions.filter((s) => s.charger_type === 'public');
    const sumKwh = (rows: RawSession[]) => rows.reduce((sum, s) => sum + (s.energy_kwh ?? 0), 0);
    const sumCost = (rows: RawSession[]) => rows.reduce((sum, s) => sum + (s.cost_pence ?? 0), 0);
    const homeKwh = sumKwh(home);
    const awayKwh = sumKwh(away);
    const homeCost = sumCost(home);
    const awayCost = sumCost(away);
    const homeCostedSessions = home.filter((s) => (s.cost_pence ?? 0) > 0).length;
    const awayCostedSessions = away.filter((s) => (s.cost_pence ?? 0) > 0).length;
    const homeAvg = homeKwh > 0 ? homeCost / homeKwh : 0;
    const awayAvg = awayKwh > 0 ? awayCost / awayKwh : 0;
    const homeAvgCostPerCharge = homeCostedSessions > 0 ? homeCost / homeCostedSessions : 0;
    const awayAvgCostPerCharge = awayCostedSessions > 0 ? awayCost / awayCostedSessions : 0;

    const lowSocSessions = sessions.filter((s) => s.initial_battery_pct < 20).length;
    const highFinalSocSessions = sessions.filter((s) => s.final_battery_pct > 90).length;
    const deepCycleSessions = sessions.filter((s) => s.final_battery_pct - s.initial_battery_pct > 60).length;
    const hotSessions = sessions.filter((s) => s.air_temp_celsius > 30).length;
    const publicSessions = away.length;
    const stressScore = Math.min(
      100,
      round(
        ((lowSocSessions * 2 + highFinalSocSessions + deepCycleSessions * 2 + hotSessions + publicSessions) /
          Math.max(sessions.length, 1)) * 25,
        0,
      ),
    );
    const stressLevel = stressScore >= 60 ? 'High' : stressScore >= 30 ? 'Moderate' : 'Low';

    const socGains = sessions.map((s) => Math.max(0, s.final_battery_pct - s.initial_battery_pct));
    const pluginSocs = sessions.map((s) => s.initial_battery_pct);
    const dates = sessions.map((s) => new Date(s.date_unplugged).getTime()).sort((a, b) => a - b);
    const dayGaps = dates.slice(1).map((d, i) => (d - dates[i]) / 86_400_000).filter((gap) => gap >= 0);
    const medianPluginSoc = round(median(pluginSocs), 1);
    const medianSocGain = round(median(socGains), 1);
    const publicSessionPct = round((publicSessions / Math.max(sessions.length, 1)) * 100, 0);
    let behaviorProfile = 'Balanced charger';
    if (medianSocGain < 30) behaviorProfile = 'Top-up charger';
    if (medianSocGain > 60) behaviorProfile = 'Deep-cycle charger';
    if (medianPluginSoc > 40) behaviorProfile = 'Range-buffer charger';
    if (medianPluginSoc < 20) behaviorProfile = 'Low-buffer driver';
    if (publicSessionPct >= 50) behaviorProfile = 'Public-reliant charger';

    const gomPairs = enrichedSessions.filter((s) => s.distance_driven && s.estimated_range_consumed);
    const totalDriven = gomPairs.reduce((sum, s) => sum + (s.distance_driven ?? 0), 0);
    const totalEstimated = gomPairs.reduce((sum, s) => sum + (s.estimated_range_consumed ?? 0), 0);
    const gomRatioPct = totalEstimated > 0 ? round((totalDriven / totalEstimated) * 100, 1) : 0;
    const gomLabel = gomPairs.length === 0
      ? 'Not enough data'
      : gomRatioPct >= 90 && gomRatioPct <= 110
        ? 'Reliable'
        : gomRatioPct < 90
          ? 'Range optimistic'
          : 'Range conservative';

    const measuredKwhSessions = sessions.filter((s) => s.energy_source === 'measured' && (s.energy_kwh ?? 0) > 0).length;
    const estimatedKwhSessions = sessions.filter((s) => s.energy_source === 'estimated' && (s.energy_kwh ?? 0) > 0).length;
    const noKwhSessions = sessions.filter((s) => !s.energy_kwh || s.energy_kwh <= 0).length;
    const costedSessions = sessions.filter((s) => (s.cost_pence ?? 0) > 0).length;
    const kwhSessions = measuredKwhSessions + estimatedKwhSessions;
    const maintenanceCostPence = maintenanceRow.total ?? 0;
    const odometerMiles = odometerEfficiency.reduce((sum, p) => sum + p.trip_miles, 0);

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
      derived_insights: {
        odometer_efficiency: odometerEfficiency,
        temperature_efficiency: temperatureEfficiency,
        home_away: {
          home_sessions: home.length,
          away_sessions: away.length,
          home_kwh: round(homeKwh, 2),
          away_kwh: round(awayKwh, 2),
          home_cost_pence: homeCost,
          away_cost_pence: awayCost,
          home_costed_sessions: homeCostedSessions,
          away_costed_sessions: awayCostedSessions,
          home_avg_cost_per_charge_pence: round(homeAvgCostPerCharge, 0),
          away_avg_cost_per_charge_pence: round(awayAvgCostPerCharge, 0),
          home_avg_pence_per_kwh: round(homeAvg, 1),
          away_avg_pence_per_kwh: round(awayAvg, 1),
          away_cost_premium_pence: round(Math.max(0, awayAvg - homeAvg), 1),
        },
        battery_capacity: batteryCapacity,
        battery_stress: {
          score: stressScore,
          level: stressLevel,
          low_soc_sessions: lowSocSessions,
          high_final_soc_sessions: highFinalSocSessions,
          deep_cycle_sessions: deepCycleSessions,
          hot_sessions: hotSessions,
          public_sessions: publicSessions,
        },
        charging_behavior: {
          profile: behaviorProfile,
          median_plugin_soc: medianPluginSoc,
          median_soc_gain: medianSocGain,
          public_session_pct: publicSessionPct,
          avg_days_between_charges: round(dayGaps.length > 0 ? dayGaps.reduce((sum, gap) => sum + gap, 0) / dayGaps.length : 0, 1),
          low_buffer_sessions: lowSocSessions,
        },
        gom_trust: {
          sample_count: gomPairs.length,
          ratio_pct: gomRatioPct,
          label: gomLabel,
        },
        data_quality: {
          total_sessions: sessions.length,
          measured_kwh_sessions: measuredKwhSessions,
          estimated_kwh_sessions: estimatedKwhSessions,
          no_kwh_sessions: noKwhSessions,
          costed_sessions: costedSessions,
          measured_kwh_pct: round((measuredKwhSessions / Math.max(kwhSessions, 1)) * 100, 0),
        },
        ownership_cost: {
          charging_cost_pence: totalCostPence,
          maintenance_cost_pence: maintenanceCostPence,
          total_running_cost_pence: totalCostPence + maintenanceCostPence,
          running_cost_per_mile_pence: odometerMiles > 0 ? round((totalCostPence + maintenanceCostPence) / odometerMiles, 1) : 0,
        },
      },
    };

    res.json(result);
  } catch (err) {
    console.error('[analytics/GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
