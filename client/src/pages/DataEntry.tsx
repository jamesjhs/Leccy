import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import TariffSetupPrompt from '../components/TariffSetupPrompt';
import {
  sessionsApi, chargerApi, tariffApi, vehiclesApi,
  ChargingSession, ChargerCostWithDate, TariffConfig, NewSession, Vehicle,
} from '../utils/api';

// Default assumed efficiency when no historical kWh/% data is available.
// 0.3 kWh/mile is a typical real-world EV energy consumption figure
// (roughly 30 kWh per 100 miles), providing a reasonable starting estimate.
const DEFAULT_KWH_PER_MILE = 0.3;

// Assumed home charger rate (kW) used when no vehicle-specific rate is stored.
// 7.4 kW is a standard UK single-phase Type 2 home wallbox.
const DEFAULT_HOME_CHARGE_RATE_KW = 7.4;

/** Convert a "HH:MM" time string to minutes since midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Calculate the cost (in £) of a home charge.
 *
 * All kWh is at the off-peak rate unless the charge duration
 * (kwh / DEFAULT_HOME_CHARGE_RATE_KW) exceeds the off-peak window,
 * in which case the spill-over kWh is billed at the peak rate.
 *
 * Note: this estimate assumes the charge starts at the beginning of the
 * off-peak window. Actual costs may differ if charging starts later.
 */
function calcHomeChargeCost(kwh: number, tariff: TariffConfig): number {
  const offPeakRate = tariff.off_peak_rate_pence_per_kwh ?? tariff.rate_pence_per_kwh;
  const peakRate = tariff.rate_pence_per_kwh;

  // Off-peak window in hours (handles overnight spans, e.g. 23:00 → 07:00)
  const offPeakStartMins = timeToMinutes(tariff.off_peak_start_time ?? '00:00');
  const peakStartMins = timeToMinutes(tariff.peak_start_time ?? '07:00');
  const windowMins = peakStartMins > offPeakStartMins
    ? peakStartMins - offPeakStartMins
    : 24 * 60 - offPeakStartMins + peakStartMins;
  const offPeakWindowHours = windowMins / 60;

  const chargeDurationHours = kwh / DEFAULT_HOME_CHARGE_RATE_KW;

  if (chargeDurationHours <= offPeakWindowHours) {
    // Entire charge fits within off-peak window
    return Math.round(kwh * offPeakRate) / 100;
  }

  // Part of the charge spills into peak hours
  const offPeakKwh = offPeakWindowHours * DEFAULT_HOME_CHARGE_RATE_KW;
  const peakKwh = kwh - offPeakKwh;
  return Math.round(offPeakKwh * offPeakRate + peakKwh * peakRate) / 100;
}

function getTariffForDate(tariffs: TariffConfig[], date: string): TariffConfig | null {
  const eligibleTariffs = tariffs
    .filter((tariff) => tariff.effective_from <= date)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return eligibleTariffs[0] ?? null;
}

// ─── Cost draft per session ────────────────────────────────────────────────
interface CostDraft {
  costId?: number;          // present if already saved to DB
  type: '' | 'home' | 'public'; // 'public' = Away
  kwh: string;
  energySource: 'measured' | 'estimated';
  price: string;
  isEstimate: boolean;
  priceCalculated: boolean;
}

type SessionPatch = Partial<Omit<ChargingSession, 'id' | 'user_id' | 'vehicle_id' | 'created_at'>>;

interface RowSnapshot {
  session: ChargingSession;
  costDraft: CostDraft;
}

interface RevertState {
  sessionId: number;
  kind: 'edit' | 'delete';
  snapshot: RowSnapshot;
}

interface CsvRowResult {
  lineNumber: number;
  raw: string;
  values: string[];
  session?: NewSession;
  errors: string[];
}

interface CsvStats {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  earliestDate: string | null;
  latestDate: string | null;
  minOdometer: number | null;
  maxOdometer: number | null;
  averageAirTemp: number | null;
}

// Estimate kWh from range delta * 0.3 kWh/mile, or use historical ratio.
function estimateKwh(
  session: ChargingSession,
  historicalRatio: number | null,
): number {
  if (historicalRatio !== null) {
    const pctDelta = Math.max(0, session.final_battery_pct - session.initial_battery_pct);
    return Math.round(pctDelta * historicalRatio * 100) / 100;
  }
  const rangeDelta = Math.max(0, session.final_range_miles - session.initial_range_miles);
  return Math.round(rangeDelta * DEFAULT_KWH_PER_MILE * 100) / 100;
}

function parseCsvDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function parseCsvNumber(value: string): number | null {
  const cleaned = value.trim().replace(/%$/, '');
  if (cleaned === '') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateRange(label: string, value: number | null, min: number, max: number, errors: string[]): number {
  if (value === null) {
    errors.push(`${label} is not a valid number`);
    return 0;
  }
  if (value < min || value > max) {
    errors.push(`${label} must be between ${min} and ${max}`);
  }
  return value;
}

function parseSessionCsv(input: string, vehicleId: number | null): CsvRowResult[] {
  return input
    .split(/\r?\n/)
    .map((raw, index) => ({ raw, lineNumber: index + 1 }))
    .filter((line) => line.raw.trim() !== '')
    .map(({ raw, lineNumber }) => {
      const values = raw.split(',').map((part) => part.trim());
      const errors: string[] = [];

      if (values.length !== 7) {
        errors.push(`Expected 7 comma-separated fields, found ${values.length}`);
      }

      const [odoRaw = '', initPctRaw = '', initRangeRaw = '', finalPctRaw = '', finalRangeRaw = '', airTempRaw = '', dateRaw = ''] = values;
      const date = parseCsvDate(dateRaw);
      if (!date) errors.push('Date must be dd/mm/yyyy');

      const odometer = validateRange('Odometer', parseCsvNumber(odoRaw), 0, 999999, errors);
      const initialPct = validateRange('Initial battery %', parseCsvNumber(initPctRaw), 0, 100, errors);
      const initialRange = validateRange('Initial range', parseCsvNumber(initRangeRaw), 0, 1000, errors);
      const finalPct = validateRange('Final battery %', parseCsvNumber(finalPctRaw), 0, 100, errors);
      const finalRange = validateRange('Final range', parseCsvNumber(finalRangeRaw), 0, 1000, errors);
      const airTemp = validateRange('Air temperature', parseCsvNumber(airTempRaw), -60, 60, errors);

      if (finalPct < initialPct) errors.push('Final battery % is lower than initial battery %');
      if (finalRange < initialRange) errors.push('Final range is lower than initial range');

      return {
        lineNumber,
        raw,
        values,
        errors,
        session: errors.length === 0 && date
          ? {
              vehicle_id: vehicleId,
              odometer_miles: odometer,
              initial_battery_pct: initialPct,
              initial_range_miles: initialRange,
              final_battery_pct: finalPct,
              final_range_miles: finalRange,
              air_temp_celsius: airTemp,
              date_unplugged: date,
            }
          : undefined,
      };
    });
}

function buildCsvStats(rows: CsvRowResult[]): CsvStats {
  const valid = rows.filter((row) => row.session);
  const dates = valid.map((row) => row.session!.date_unplugged).sort();
  const odometers = valid.map((row) => row.session!.odometer_miles);
  const temps = valid.map((row) => row.session!.air_temp_celsius);

  return {
    totalRows: rows.length,
    validRows: valid.length,
    invalidRows: rows.length - valid.length,
    earliestDate: dates[0] ?? null,
    latestDate: dates[dates.length - 1] ?? null,
    minOdometer: odometers.length > 0 ? Math.min(...odometers) : null,
    maxOdometer: odometers.length > 0 ? Math.max(...odometers) : null,
    averageAirTemp: temps.length > 0
      ? Math.round((temps.reduce((sum, temp) => sum + temp, 0) / temps.length) * 10) / 10
      : null,
  };
}

function emptyCostDraft(): CostDraft {
  return {
    type: '',
    kwh: '',
    energySource: 'measured',
    price: '',
    isEstimate: false,
    priceCalculated: false,
  };
}

function isPersistableCostDraft(draft: CostDraft): draft is CostDraft & { type: 'home' | 'public' } {
  const kwh = Number(draft.kwh);
  const pricePence = Math.round(Number(draft.price) * 100);
  return draft.type !== '' && Number.isFinite(kwh) && kwh > 0 && Number.isFinite(pricePence) && pricePence >= 0;
}

export default function DataEntry() {
  const [sessions, setSessions] = useState<ChargingSession[]>([]);
  const [costs, setCosts] = useState<ChargerCostWithDate[]>([]);
  const [tariffs, setTariffs] = useState<TariffConfig[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [costDrafts, setCostDrafts] = useState<Record<number, CostDraft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [lastRevert, setLastRevert] = useState<RevertState | null>(null);
  const [enumerating, setEnumerating] = useState(false);

  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvRows, setCsvRows] = useState<CsvRowResult[]>([]);
  const [csvStats, setCsvStats] = useState<CsvStats | null>(null);
  const [hasTestedCsv, setHasTestedCsv] = useState(false);
  const [showEstimateKwhConfirm, setShowEstimateKwhConfirm] = useState(false);

  // Keep tariffs and historical ratio available in callbacks
  const tariffsRef = useRef<TariffConfig[]>([]);
  const historicalRatioRef = useRef<number | null>(null);
  const costDraftsRef = useRef<Record<number, CostDraft>>({});
  const costCreatePendingRef = useRef<Record<number, boolean>>({});

  useEffect(() => {
    costDraftsRef.current = costDrafts;
  }, [costDrafts]);

  // ─── Build drafts from fetched data ──────────────────────────────────────
  const buildDrafts = useCallback(
    (
      sessions: ChargingSession[],
      costs: ChargerCostWithDate[],
      tariffs: TariffConfig[],
    ) => {
      // Compute historical kWh-per-% ratio from sessions that have real cost data
      const costMap = new Map(costs.map((c) => [c.session_id, c]));
      const sessMap = new Map(sessions.map((s) => [s.id, s]));
      const ratios: number[] = [];
      for (const c of costs) {
        if (c.energy_kwh <= 0) continue;
        const s = sessMap.get(c.session_id);
        if (!s) continue;
        const pctDelta = s.final_battery_pct - s.initial_battery_pct;
        if (pctDelta > 0) ratios.push(c.energy_kwh / pctDelta);
      }
      const historicalRatio =
        ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;

      historicalRatioRef.current = historicalRatio;

      tariffsRef.current = tariffs;

      const drafts: Record<number, CostDraft> = {};
      for (const s of sessions) {
        const existing = costMap.get(s.id);
        if (existing) {
          drafts[s.id] = {
            costId: existing.id,
            type: existing.charger_type,
            kwh: String(existing.energy_kwh),
            energySource: existing.energy_source ?? 'measured',
            price: (existing.price_pence / 100).toFixed(2),
            isEstimate: existing.energy_source === 'estimated',
            priceCalculated: existing.price_calculated === 1,
          };
        } else {
          drafts[s.id] = {
            type: '',
            kwh: '',
            energySource: 'measured',
            price: '',
            isEstimate: false,
            priceCalculated: false,
          };
        }
      }
      costDraftsRef.current = drafts;
      setCostDrafts(drafts);
    },
    [],
  );

  const loadData = useCallback(async () => {
    try {
      const [sessRes, costsRes, tariffRes, vehicleRes] = await Promise.all([
        sessionsApi.getAll(selectedVehicleId ?? undefined),
        chargerApi.getAll(),
        tariffApi.getAll(),
        vehiclesApi.getAll(),
      ]);
      setSessions(sessRes.data.sessions);
      setCosts(costsRes.data.costs);
      setTariffs(tariffRes.data.tariffs);
      const fetchedVehicles = vehicleRes.data.vehicles;
      setVehicles(fetchedVehicles);
      // Auto-select the first vehicle when none is selected yet;
      // loadData will re-run automatically via useEffect once selectedVehicleId updates.
      if (selectedVehicleId === null && fetchedVehicles.length > 0) {
        setSelectedVehicleId(fetchedVehicles[0].id);
      }
      buildDrafts(sessRes.data.sessions, costsRes.data.costs, tariffRes.data.tariffs);
    } catch {/* ignore */}
  }, [buildDrafts, selectedVehicleId]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    setCsvRows([]);
    setCsvStats(null);
    setHasTestedCsv(false);
  }, [selectedVehicleId]);

  function testCsv() {
    setFormError(null);
    setFormSuccess(null);
    const rows = parseSessionCsv(csvText, selectedVehicleId);
    const stats = buildCsvStats(rows);
    setCsvRows(rows);
    setCsvStats(stats);
    setHasTestedCsv(true);

    if (stats.totalRows === 0) {
      setFormError('Paste at least one CSV row before testing.');
    } else if (stats.invalidRows > 0) {
      setFormError(`${stats.invalidRows} row${stats.invalidRows === 1 ? '' : 's'} need attention before submit.`);
    } else {
      setFormSuccess(`${stats.validRows} valid row${stats.validRows === 1 ? '' : 's'} ready to submit.`);
    }
  }

  async function submitCsvRows() {
    setFormError(null);
    setFormSuccess(null);
    const rows = hasTestedCsv ? csvRows : parseSessionCsv(csvText, selectedVehicleId);
    const stats = buildCsvStats(rows);
    setCsvRows(rows);
    setCsvStats(stats);
    setHasTestedCsv(true);

    if (stats.totalRows === 0) {
      setFormError('Paste at least one CSV row before submitting.');
      return;
    }
    if (stats.invalidRows > 0) {
      setFormError('Fix the highlighted rows before submitting.');
      return;
    }

    const validSessions = rows.flatMap((row) => (row.session ? [row.session] : []));
    setSubmitting(true);
    try {
      for (const session of validSessions) {
        await sessionsApi.create(session);
      }
      setFormSuccess(`${validSessions.length} charging session${validSessions.length === 1 ? '' : 's'} imported.`);
      setCsvText('');
      setCsvRows([]);
      setCsvStats(null);
      setHasTestedCsv(false);
      void loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to import sessions.';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteSession(id: number) {
    clearPendingDeletedRow(id);
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    const costDraft = costDrafts[id] ?? emptyCostDraft();

    setFormError(null);
    setSavingId(id);
    setLastRevert({
      sessionId: id,
      kind: 'delete',
      snapshot: {
        session: { ...session },
        costDraft: { ...costDraft },
      },
    });
    try {
      await sessionsApi.delete(id);
    } catch {
      setLastRevert(null);
      setFormError('Could not delete that session. Please try again.');
      void loadData();
    } finally {
      setSavingId(null);
    }
  }

  function clearPendingDeletedRow(nextSessionId: number) {
    if (lastRevert?.kind !== 'delete' || lastRevert.sessionId === nextSessionId) return;
    const deletedSessionId = lastRevert.sessionId;
    setSessions((prev) => prev.filter((s) => s.id !== deletedSessionId));
    setCostDrafts((prev) => {
      const next = { ...prev };
      delete next[deletedSessionId];
      return next;
    });
  }

  function captureRevertSnapshot(sessionId: number) {
    clearPendingDeletedRow(sessionId);
    setLastRevert((current) => {
      if (current?.sessionId === sessionId) return current;
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return current;
      const costDraft = costDrafts[sessionId] ?? emptyCostDraft();
      return {
        sessionId,
        kind: 'edit',
        snapshot: {
          session: { ...session },
          costDraft: { ...costDraft },
        },
      };
    });
  }

  async function patchSessionEdit(sessionId: number, patch: SessionPatch) {
    captureRevertSnapshot(sessionId);
    setFormError(null);
    setSavingId(sessionId);
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)));
    try {
      const res = await sessionsApi.update(sessionId, patch);
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? res.data.session : s)));
    } catch {
      setFormError('Could not save that session change. Please try again.');
      void loadData();
    } finally {
      setSavingId(null);
    }
  }

  async function patchDraft(sessionId: number, patch: Partial<CostDraft>) {
    captureRevertSnapshot(sessionId);
    setFormError(null);
    const currentDraft = costDrafts[sessionId] ?? emptyCostDraft();
    const nextDraft = { ...currentDraft, ...patch };

    setCostDrafts((prev) => ({
      ...prev,
      [sessionId]: nextDraft,
    }));
    costDraftsRef.current = {
      ...costDraftsRef.current,
      [sessionId]: nextDraft,
    };

    if (!isPersistableCostDraft(nextDraft)) return;

    const kwh = Number(nextDraft.kwh);
    const pricePence = Math.round(Number(nextDraft.price) * 100);

    setSavingId(sessionId);
    try {
      if (nextDraft.costId) {
        await chargerApi.update(nextDraft.costId, {
          energy_kwh: kwh,
          energy_source: nextDraft.energySource,
          price_pence: pricePence,
          price_calculated: nextDraft.priceCalculated,
          charger_type: nextDraft.type,
        });
      } else if (!costCreatePendingRef.current[sessionId]) {
        costCreatePendingRef.current[sessionId] = true;
        const res = await chargerApi.create({
          session_id: sessionId,
          energy_kwh: kwh,
          energy_source: nextDraft.energySource,
          price_pence: pricePence,
          price_calculated: nextDraft.priceCalculated,
          charger_type: nextDraft.type,
        });
        costCreatePendingRef.current[sessionId] = false;
        setCostDrafts((prev) => ({
          ...prev,
          [sessionId]: { ...prev[sessionId], costId: res.data.cost.id },
        }));
        costDraftsRef.current = {
          ...costDraftsRef.current,
          [sessionId]: { ...costDraftsRef.current[sessionId], costId: res.data.cost.id },
        };

        const latestDraft = costDraftsRef.current[sessionId];
        if (latestDraft && isPersistableCostDraft(latestDraft)) {
          await chargerApi.update(res.data.cost.id, {
            energy_kwh: Number(latestDraft.kwh),
            energy_source: latestDraft.energySource,
            price_pence: Math.round(Number(latestDraft.price) * 100),
            price_calculated: latestDraft.priceCalculated,
            charger_type: latestDraft.type,
          });
        } else {
          await chargerApi.delete(res.data.cost.id);
          setCostDrafts((prev) => ({
            ...prev,
            [sessionId]: { ...prev[sessionId], costId: undefined },
          }));
          costDraftsRef.current = {
            ...costDraftsRef.current,
            [sessionId]: { ...costDraftsRef.current[sessionId], costId: undefined },
          };
        }
      }
    } catch {
      costCreatePendingRef.current[sessionId] = false;
      setFormError('Could not save that charging cost change. Please try again.');
      void loadData();
    } finally {
      setSavingId(null);
    }
  }

  async function revertLastRowChange() {
    if (!lastRevert) return;
    const { sessionId, kind, snapshot } = lastRevert;
    const currentDraft = costDrafts[sessionId] ?? emptyCostDraft();

    setFormError(null);
    setSavingId(sessionId);
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? snapshot.session : s)));
    setCostDrafts((prev) => ({
      ...prev,
      [sessionId]: snapshot.costDraft,
    }));

    try {
      if (kind === 'delete') {
        const res = await sessionsApi.create({
          vehicle_id: snapshot.session.vehicle_id,
          odometer_miles: snapshot.session.odometer_miles,
          initial_battery_pct: snapshot.session.initial_battery_pct,
          initial_range_miles: snapshot.session.initial_range_miles,
          final_battery_pct: snapshot.session.final_battery_pct,
          final_range_miles: snapshot.session.final_range_miles,
          air_temp_celsius: snapshot.session.air_temp_celsius,
          date_started: snapshot.session.date_started,
          date_unplugged: snapshot.session.date_unplugged,
        });

        if (isPersistableCostDraft(snapshot.costDraft)) {
          await chargerApi.create({
            session_id: res.data.session.id,
            energy_kwh: Number(snapshot.costDraft.kwh),
            energy_source: snapshot.costDraft.energySource,
            price_pence: Math.round(Number(snapshot.costDraft.price) * 100),
            price_calculated: snapshot.costDraft.priceCalculated,
            charger_type: snapshot.costDraft.type,
          });
        }
      } else {
        await sessionsApi.update(sessionId, {
        odometer_miles: snapshot.session.odometer_miles,
        initial_battery_pct: snapshot.session.initial_battery_pct,
        initial_range_miles: snapshot.session.initial_range_miles,
        final_battery_pct: snapshot.session.final_battery_pct,
        final_range_miles: snapshot.session.final_range_miles,
        air_temp_celsius: snapshot.session.air_temp_celsius,
        date_started: snapshot.session.date_started,
        date_unplugged: snapshot.session.date_unplugged,
        });

        if (snapshot.costDraft.costId && isPersistableCostDraft(snapshot.costDraft)) {
          await chargerApi.update(snapshot.costDraft.costId, {
            energy_kwh: Number(snapshot.costDraft.kwh),
            energy_source: snapshot.costDraft.energySource,
            price_pence: Math.round(Number(snapshot.costDraft.price) * 100),
            price_calculated: snapshot.costDraft.priceCalculated,
            charger_type: snapshot.costDraft.type,
          });
        } else if (currentDraft.costId && !snapshot.costDraft.costId) {
          await chargerApi.delete(currentDraft.costId);
        }
      }

      setLastRevert(null);
      void loadData();
    } catch {
      setFormError('Could not revert that row. Please try again.');
      void loadData();
    } finally {
      setSavingId(null);
    }
  }

  // ─── Auto-enumerate costs ─────────────────────────────────────────────────
  // Calculates and saves home charge costs for every Home row currently showing £0.00.
  async function autoEnumerateCosts() {
    const availableTariffs = tariffsRef.current;
    if (availableTariffs.length === 0) return;

    const targets = sessions.filter((s) => {
      const draft = costDrafts[s.id];
      return draft?.type === 'home' && Number(draft.price) === 0;
    });
    if (targets.length === 0) return;

    setEnumerating(true);
    try {
      await Promise.all(
        targets.map(async (s) => {
          const draft = costDrafts[s.id];
          const kwh = Number(draft.kwh);
          if (!isFinite(kwh) || kwh <= 0) return;
          const tariff = getTariffForDate(availableTariffs, s.date_unplugged);
          if (!tariff) return;
          const pricePence = Math.round(calcHomeChargeCost(kwh, tariff) * 100);
          if (draft.costId) {
            await chargerApi.update(draft.costId, {
              energy_kwh: kwh,
              price_pence: pricePence,
              price_calculated: true,
              charger_type: 'home',
            });
          } else {
            await chargerApi.create({
              session_id: s.id,
              energy_kwh: kwh,
              price_pence: pricePence,
              price_calculated: true,
              charger_type: 'home',
            });
          }
        }),
      );
      void loadData();
    } catch {/* ignore */} finally {
      setEnumerating(false);
    }
  }

  async function estimateKwhInputs() {
    const updates = sessions.flatMap((s) => {
      const vehicle = vehicles.find((v) => v.id === (s.vehicle_id ?? selectedVehicleId));
      if (!vehicle?.battery_kwh) return [];

      const pctCharged = s.final_battery_pct - s.initial_battery_pct;
      if (pctCharged <= 0) return [];

      const estimatedKwh = Math.round(vehicle.battery_kwh * (pctCharged / 100) * 100) / 100;
      return [{ session: s, estimatedKwh }];
    });

    setShowEstimateKwhConfirm(false);
    setCostDrafts((prev) => {
      const next = { ...prev };
      for (const { session, estimatedKwh } of updates) {
        const current = next[session.id] ?? emptyCostDraft();
        next[session.id] = {
          ...current,
          kwh: String(estimatedKwh),
          energySource: 'estimated',
          isEstimate: true,
        };
      }
      return next;
    });

    setEnumerating(true);
    try {
      await Promise.all(
        updates.map(async ({ session, estimatedKwh }) => {
          const current = costDrafts[session.id] ?? emptyCostDraft();
          const nextDraft = {
            ...current,
            kwh: String(estimatedKwh),
            energySource: 'estimated' as const,
            isEstimate: true,
          };
          if (!isPersistableCostDraft(nextDraft)) return;

          if (nextDraft.costId) {
            await chargerApi.update(nextDraft.costId, {
              energy_kwh: estimatedKwh,
              energy_source: 'estimated',
              price_pence: Math.round(Number(nextDraft.price) * 100),
              price_calculated: nextDraft.priceCalculated,
              charger_type: nextDraft.type,
            });
          } else {
            const res = await chargerApi.create({
              session_id: session.id,
              energy_kwh: estimatedKwh,
              energy_source: 'estimated',
              price_pence: Math.round(Number(nextDraft.price) * 100),
              price_calculated: nextDraft.priceCalculated,
              charger_type: nextDraft.type,
            });
            setCostDrafts((prev) => ({
              ...prev,
              [session.id]: { ...prev[session.id], costId: res.data.cost.id },
            }));
          }
        }),
      );
      void loadData();
    } catch {
      setFormError('Could not save one or more kWh estimates. Please try again.');
      void loadData();
    } finally {
      setEnumerating(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-6">Add Charging Session</h1>

      {tariffs.length === 0 && <TariffSetupPrompt />}

      {/* ── Vehicle selector ─────────────────────────────────────────────── */}
      {vehicles.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm text-amber-800">
          No vehicles added yet.{' '}
          <Link to="/vehicles" className="font-semibold underline hover:text-amber-900">
            Add a vehicle
          </Link>{' '}
          to link sessions to a specific vehicle.
        </div>
      ) : (
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Vehicle</label>
          <div className="flex flex-wrap gap-2">
            {vehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVehicleId(v.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors border ${
                  selectedVehicleId === v.id
                    ? 'bg-green-700 text-white border-green-700'
                    : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
                }`}
              >
                🚗 {v.nickname ? `${v.nickname} (${v.licence_plate})` : v.licence_plate}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Entry form ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 mb-8">
        {formSuccess && (
          <div className="bg-green-50 border border-green-300 text-green-700 rounded-lg px-4 py-3 mb-5 text-sm">
            {formSuccess}
          </div>
        )}
        {formError && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm">
            {formError}
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Paste charging sessions CSV
            </label>
            <p className="text-sm text-gray-500 mb-3">
              Paste CSV-formatted charging session data here. Note, because of the potential for different types of charging sessions and costs, inputted sessions will appear in the table below without charge type or kwh or cost values, so these must be manually entered using the table below.
            </p>
            <textarea
              rows={8}
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setCsvRows([]);
                setCsvStats(null);
                setHasTestedCsv(false);
                setFormError(null);
                setFormSuccess(null);
              }}
              placeholder="odo,init%,initRng,Final%,FinalRng,AirTemp,dd/mm/yyyy&#10;17200,22,64,100,238,12,15/04/2026"
              className={`${inputClass} font-mono resize-y`}
            />
            <p className="text-xs text-gray-400 mt-2">
              Format: odo,init%,initRng,Final%,FinalRng,AirTemp,dd/mm/yyyy.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={testCsv}
              className="bg-white hover:bg-green-50 border border-green-300 text-green-800 font-bold px-5 py-2.5 rounded-lg transition-colors text-sm"
            >
              Test
            </button>
            <button
              type="button"
              onClick={() => void submitCsvRows()}
              disabled={submitting || !hasTestedCsv || (csvStats?.invalidRows ?? 1) > 0 || (csvStats?.validRows ?? 0) === 0}
              className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-6 py-2.5 rounded-lg transition-colors text-sm"
            >
              {submitting ? 'Importing…' : 'Submit'}
            </button>
          </div>

          {csvStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <CsvStat label="Rows" value={`${csvStats.totalRows}`} />
              <CsvStat label="Valid" value={`${csvStats.validRows}`} />
              <CsvStat label="Errors" value={`${csvStats.invalidRows}`} tone={csvStats.invalidRows > 0 ? 'error' : 'normal'} />
              <CsvStat
                label="Date Range"
                value={csvStats.earliestDate && csvStats.latestDate ? `${csvStats.earliestDate} to ${csvStats.latestDate}` : '—'}
              />
              <CsvStat
                label="Odometer Range"
                value={csvStats.minOdometer !== null && csvStats.maxOdometer !== null ? `${csvStats.minOdometer} to ${csvStats.maxOdometer} mi` : '—'}
              />
              <CsvStat
                label="Avg Temp"
                value={csvStats.averageAirTemp !== null ? `${csvStats.averageAirTemp}°C` : '—'}
              />
            </div>
          )}

          {csvRows.length > 0 && (
            <div className="overflow-x-auto border border-green-100 rounded-lg">
              <table className="w-full text-xs min-w-[860px]">
                <thead className="bg-green-50 text-green-800">
                  <tr>
                    <th className="text-left px-3 py-2">Line</th>
                    <th className="text-left px-3 py-2">Odo</th>
                    <th className="text-left px-3 py-2">Init%</th>
                    <th className="text-left px-3 py-2">Init Range</th>
                    <th className="text-left px-3 py-2">Final%</th>
                    <th className="text-left px-3 py-2">Final Range</th>
                    <th className="text-left px-3 py-2">Air Temp</th>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.map((row) => (
                    <tr key={row.lineNumber} className={`border-t ${row.errors.length > 0 ? 'bg-red-50' : 'bg-white'}`}>
                      <td className="px-3 py-2 font-mono">{row.lineNumber}</td>
                      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                        <td key={i} className="px-3 py-2 font-mono">{row.values[i] ?? ''}</td>
                      ))}
                      <td className={`px-3 py-2 ${row.errors.length > 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {row.errors.length > 0 ? row.errors.join('; ') : 'Ready'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Sessions + inline charger costs ──────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <h2 className="text-lg font-bold text-green-900">Charging Sessions</h2>
          {sessions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowEstimateKwhConfirm(true)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 transition-colors whitespace-nowrap"
                title="Estimate kWh from state of charge gained and vehicle battery size"
              >
                Estimate kWh
              </button>
              <button
                type="button"
                onClick={() => void autoEnumerateCosts()}
                disabled={enumerating || tariffs.length === 0}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50 transition-colors whitespace-nowrap"
                title="Calculate and save home charge costs for all rows currently showing £0.00"
              >
                {enumerating ? '⏳ Calculating…' : '⚡ Auto-enumerate costs'}
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Changes save automatically. The latest changed row can be reverted until you edit another row.
        </p>

        {sessions.length === 0 ? (
          <p className="text-gray-400 text-sm">No sessions recorded yet.</p>
        ) : (
          <div className="overflow-auto max-h-[580px]">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_#d1fae5]">
                <tr className="text-left text-green-700 border-b border-green-100">
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3" aria-label="Odometer (miles)">Odo (mi)</th>
                  <th className="pb-2 pr-1" aria-label="Initial battery percentage">Init%</th>
                  <th className="pb-2 pr-1" aria-label="Initial range (miles)">Init Range</th>
                  <th className="pb-2 pr-1" aria-label="Final battery percentage">Final%</th>
                  <th className="pb-2 pr-1" aria-label="Final range (miles)">Final Range</th>
                  <th className="pb-2 pr-1" aria-label="Air temperature (°C)">Temp</th>
                  <th className="pb-2 pr-2 border-l border-green-100 pl-3">Type</th>
                  <th className="pb-2 pr-2" aria-label="Energy (kWh)">kWh</th>
                  <th className="pb-2 pr-2" aria-label="Cost (£)">£</th>
                  <th className="pb-2 w-24" aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const draft = costDrafts[s.id];
                  const isSaving = savingId === s.id;
                  const canRevert = lastRevert?.sessionId === s.id;
                  const isPendingDelete = canRevert && lastRevert?.kind === 'delete';
                  const hasCalculatedValues = draft?.isEstimate || draft?.priceCalculated;
                  return (
                    <tr
                      key={s.id}
                      className={`border-b border-gray-50 align-middle ${
                        isPendingDelete
                          ? 'bg-gray-50 text-gray-400 opacity-70'
                          : `hover:bg-green-50 ${hasCalculatedValues ? 'bg-green-50/40' : ''}`
                      }`}
                    >
                      {/* ── Session field cells (all editable) ── */}
                      <td className="py-2 pr-3">
                        <input
                          type="date"
                          value={s.date_unplugged}
                          disabled={isPendingDelete}
                          onChange={(e) => void patchSessionEdit(s.id, { date_unplugged: e.target.value })}
                          className={rowInputClass}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number" step="0.1" min="0" max="999999"
                          value={s.odometer_miles}
                          disabled={isPendingDelete}
                          onChange={(e) => void patchSessionEdit(s.id, { odometer_miles: Number(e.target.value) })}
                          className={`${rowInputClass} w-[89px]`}
                        />
                      </td>
                      <td className="py-2 pr-1">
                        <input
                          type="number" min="0" max="100" step="1"
                          value={s.initial_battery_pct}
                          disabled={isPendingDelete}
                          onChange={(e) => void patchSessionEdit(s.id, { initial_battery_pct: Number(e.target.value) })}
                          className={`${rowInputClass} w-[49px]`}
                        />
                      </td>
                      <td className="py-2 pr-1">
                        <input
                          type="number" step="0.1" min="0" max="1000"
                          value={s.initial_range_miles}
                          disabled={isPendingDelete}
                          onChange={(e) => void patchSessionEdit(s.id, { initial_range_miles: Number(e.target.value) })}
                          className={`${rowInputClass} w-[57px]`}
                        />
                      </td>
                      <td className="py-2 pr-1">
                        <input
                          type="number" min="0" max="100" step="1"
                          value={s.final_battery_pct}
                          disabled={isPendingDelete}
                          onChange={(e) => void patchSessionEdit(s.id, { final_battery_pct: Number(e.target.value) })}
                          className={`${rowInputClass} w-[49px]`}
                        />
                      </td>
                      <td className="py-2 pr-1">
                        <input
                          type="number" step="0.1" min="0" max="1000"
                          value={s.final_range_miles}
                          disabled={isPendingDelete}
                          onChange={(e) => void patchSessionEdit(s.id, { final_range_miles: Number(e.target.value) })}
                          className={`${rowInputClass} w-[57px]`}
                        />
                      </td>
                      <td className="py-2 pr-1">
                        <input
                          type="number" step="0.1" min="-60" max="60"
                          value={s.air_temp_celsius}
                          disabled={isPendingDelete}
                          onChange={(e) => void patchSessionEdit(s.id, { air_temp_celsius: Number(e.target.value) })}
                          className={`${rowInputClass} w-[49px]`}
                        />
                      </td>

                      {/* ── Inline cost cells ── */}
                      <td className="py-2 pr-2 border-l border-green-100 pl-3">
                        <select
                          value={draft?.type ?? ''}
                          disabled={isPendingDelete}
                          onChange={(e) => void patchDraft(s.id, { type: e.target.value as '' | 'home' | 'public' })}
                          className="border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                        >
                          <option value="">—</option>
                          <option value="home">🏠 Home</option>
                          <option value="public">⚡ Away</option>
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number" step="0.01" min="0" max="200"
                          value={draft?.kwh ?? ''}
                          disabled={isPendingDelete}
                          onChange={(e) => void patchDraft(s.id, { kwh: e.target.value, energySource: 'measured', isEstimate: false })}
                          className={`w-20 border rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 ${draft?.isEstimate ? calculatedInputClass : 'border-gray-200'}`}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number" step="0.01" min="0" max="10000"
                          value={draft?.price ?? ''}
                          disabled={isPendingDelete}
                          onChange={(e) => void patchDraft(s.id, { price: e.target.value, priceCalculated: false })}
                          className={`w-20 border rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 ${draft?.priceCalculated ? calculatedInputClass : 'border-gray-200'}`}
                        />
                      </td>
                      <td className="py-2 pl-1">
                        {canRevert && (
                          <button
                            onClick={() => void revertLastRowChange()}
                            disabled={isSaving}
                            className="inline-flex h-7 items-center justify-center rounded-full px-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 hover:text-amber-900 disabled:opacity-50 whitespace-nowrap"
                            aria-label="Revert last row change"
                            title="Revert last change"
                          >
                            {isSaving ? '…' : 'Revert'}
                          </button>
                        )}
                        {!canRevert && (
                          <button
                            onClick={() => void deleteSession(s.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-red-500 hover:bg-red-100 hover:text-red-700"
                            aria-label="Delete row"
                            title="Delete"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-white shadow-[0_-1px_0_#d1fae5]">
                <tr className="text-green-900 font-semibold text-sm">
                  <td colSpan={8} className="pt-2 pb-1 pl-3 text-right text-xs text-gray-500 uppercase tracking-wide border-t border-green-100">
                    Total cost
                  </td>
                  <td colSpan={3} className="pt-2 pb-1 pr-2 border-t border-green-100 text-right">
                    £{Object.entries(costDrafts)
                      .filter(([sessionId]) => Number(sessionId) !== (lastRevert?.kind === 'delete' ? lastRevert.sessionId : -1))
                      .reduce((sum, [, d]) => sum + (Number(d.price) || 0), 0)
                      .toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {showEstimateKwhConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-green-100 max-w-sm w-full p-5">
            <h2 className="text-lg font-bold text-green-900 mb-2">Estimate kWh?</h2>
            <p className="text-sm text-gray-600 mb-5">
              this will affect charge efficiency calculations
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => void estimateKwhInputs()}
                className="bg-green-700 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-lg text-sm"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => setShowEstimateKwhConfirm(false)}
                className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-semibold px-4 py-2 rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';

const rowInputClass =
  'w-28 border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500';

const calculatedInputClass =
  'border-green-200 bg-green-50 text-green-900';

function CsvStat({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'error' }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone === 'error' ? 'border-red-200 bg-red-50' : 'border-green-100 bg-green-50'}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wide ${tone === 'error' ? 'text-red-700' : 'text-green-700'}`}>
        {label}
      </div>
      <div className="text-sm font-semibold text-green-950 mt-0.5">{value}</div>
    </div>
  );
}
