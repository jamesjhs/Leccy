import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  sessionsApi, chargerApi, tariffApi, vehiclesApi,
  ChargingSession, ChargerCostWithDate, TariffConfig, NewSession, Vehicle,
} from '../utils/api';

// Default assumed efficiency when no historical kWh/% data is available.
// 0.3 kWh/mile is a typical real-world EV energy consumption figure
// (roughly 30 kWh per 100 miles), providing a reasonable starting estimate.
const DEFAULT_KWH_PER_MILE = 0.3;

// ─── Cost draft per session ────────────────────────────────────────────────
interface CostDraft {
  costId?: number;          // present if already saved to DB
  type: 'home' | 'public'; // 'public' = Away
  kwh: string;
  price: string;
  isEstimate: boolean;
}

// ─── Session edits per row ────────────────────────────────────────────────
type SessionEdit = Partial<Omit<ChargingSession, 'id' | 'user_id' | 'vehicle_id' | 'created_at'>>;

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

export default function DataEntry() {
  const [sessions, setSessions] = useState<ChargingSession[]>([]);
  const [costs, setCosts] = useState<ChargerCostWithDate[]>([]);
  const [tariffs, setTariffs] = useState<TariffConfig[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [costDrafts, setCostDrafts] = useState<Record<number, CostDraft>>({});
  const [sessionEdits, setSessionEdits] = useState<Record<number, SessionEdit>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Optional charger cost fields on the entry form
  const [formChargerType, setFormChargerType] = useState<'home' | 'public'>('home');
  const [formKwh, setFormKwh] = useState('');
  const [formCost, setFormCost] = useState('');

  // Keep latest tariff and historical ratio available in callbacks
  const tariffRef = useRef<TariffConfig | null>(null);
  const historicalRatioRef = useRef<number | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewSession>({ defaultValues: { date_unplugged: today } });

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

      const currentTariff = tariffs[0] ?? null;
      tariffRef.current = currentTariff;

      const drafts: Record<number, CostDraft> = {};
      for (const s of sessions) {
        const existing = costMap.get(s.id);
        if (existing) {
          drafts[s.id] = {
            costId: existing.id,
            type: existing.charger_type,
            kwh: String(existing.energy_kwh),
            price: (existing.price_pence / 100).toFixed(2),
            isEstimate: false,
          };
        } else {
          const estKwh = estimateKwh(s, historicalRatio);
          const estPrice = currentTariff
            ? Math.round(estKwh * currentTariff.rate_pence_per_kwh) / 100
            : 0;
          drafts[s.id] = {
            type: 'home',
            kwh: String(estKwh),
            price: estPrice.toFixed(2),
            isEstimate: true,
          };
        }
      }
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
      setVehicles(vehicleRes.data.vehicles);
      buildDrafts(sessRes.data.sessions, costsRes.data.costs, tariffRes.data.tariffs);
      // Clear any pending session edits so refreshed data is shown cleanly
      setSessionEdits({});
    } catch {/* ignore */}
  }, [buildDrafts, selectedVehicleId]);

  useEffect(() => { void loadData(); }, [loadData]);

  // ─── Session form submit ──────────────────────────────────────────────────
  async function onSubmit(data: NewSession) {
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(true);
    try {
      const sessRes = await sessionsApi.create({
        ...data,
        vehicle_id: selectedVehicleId ?? null,
        odometer_miles: Number(data.odometer_miles),
        initial_battery_pct: Number(data.initial_battery_pct),
        initial_range_miles: Number(data.initial_range_miles),
        final_battery_pct: Number(data.final_battery_pct),
        final_range_miles: Number(data.final_range_miles),
        air_temp_celsius: Number(data.air_temp_celsius),
      });

      // Auto-create charger cost. Use form-entered values when provided,
      // otherwise estimate from session data and current tariff.
      const newSession = sessRes.data.session;
      const rangeDelta = Math.max(
        0,
        Number(data.final_range_miles) - Number(data.initial_range_miles),
      );
      const autoKwh = Math.round(rangeDelta * DEFAULT_KWH_PER_MILE * 100) / 100;
      const kwh = formKwh && Number(formKwh) > 0 ? Number(formKwh) : autoKwh;
      const currentTariff = tariffRef.current;
      const autoPricePence = currentTariff
        ? Math.round(kwh * currentTariff.rate_pence_per_kwh)
        : 0;
      const pricePence =
        formCost && Number(formCost) >= 0
          ? Math.round(Number(formCost) * 100)
          : autoPricePence;

      if (kwh > 0) {
        await chargerApi.create({
          session_id: newSession.id,
          energy_kwh: kwh,
          price_pence: pricePence,
          charger_type: formChargerType,
        });
      }

      setFormSuccess('Session saved!');
      reset({ date_unplugged: today });
      setFormKwh('');
      setFormCost('');
      setFormChargerType('home');
      void loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to save session';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteSession(id: number) {
    if (!confirm('Delete this session?')) return;
    try {
      await sessionsApi.delete(id);
      void loadData();
    } catch {/* ignore */}
  }

  // ─── Save row: persist session edits + cost draft ─────────────────────────
  async function saveRow(sessionId: number) {
    const draft = costDrafts[sessionId];
    if (!draft) return;

    const kwh = Number(draft.kwh);
    const pricePence = Math.round(Number(draft.price) * 100);
    if (!isFinite(kwh) || kwh <= 0 || !isFinite(pricePence) || pricePence < 0) return;

    setSavingId(sessionId);
    try {
      // Save session field edits if any changes were made
      const edits = sessionEdits[sessionId];
      if (edits && Object.keys(edits).length > 0) {
        await sessionsApi.update(sessionId, edits);
        setSessionEdits((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      }

      // Save cost draft
      if (draft.costId) {
        await chargerApi.update(draft.costId, {
          energy_kwh: kwh,
          price_pence: pricePence,
          charger_type: draft.type,
        });
      } else {
        const res = await chargerApi.create({
          session_id: sessionId,
          energy_kwh: kwh,
          price_pence: pricePence,
          charger_type: draft.type,
        });
        setCostDrafts((prev) => ({
          ...prev,
          [sessionId]: { ...prev[sessionId], costId: res.data.cost.id, isEstimate: false },
        }));
      }
      setCostDrafts((prev) => ({
        ...prev,
        [sessionId]: { ...prev[sessionId], isEstimate: false },
      }));
      void loadData();
    } catch {/* ignore */} finally {
      setSavingId(null);
    }
  }

  function patchDraft(sessionId: number, patch: Partial<CostDraft>) {
    setCostDrafts((prev) => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], ...patch },
    }));
  }

  function patchSessionEdit(sessionId: number, patch: SessionEdit) {
    setSessionEdits((prev) => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], ...patch },
    }));
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-6">Add Charging Session</h1>

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
            <button
              type="button"
              onClick={() => setSelectedVehicleId(null)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors border ${
                selectedVehicleId === null
                  ? 'bg-green-700 text-white border-green-700'
                  : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
              }`}
            >
              No vehicle
            </button>
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField label="Odometer (miles)" error={errors.odometer_miles?.message}>
              <input
                type="number" step="0.1" min="0" max="999999" inputMode="decimal"
                className={inputClass}
                {...register('odometer_miles', {
                  required: 'Required',
                  min: { value: 0, message: 'Must be ≥ 0' },
                  max: { value: 999999, message: 'Value too large' },
                  validate: (v) => isFinite(Number(v)) || 'Must be a valid number',
                })}
              />
            </FormField>

            <FormField label="Air Temperature (°C)" error={errors.air_temp_celsius?.message}>
              <input
                type="number" step="0.1" min="-60" max="60" inputMode="decimal"
                className={inputClass}
                {...register('air_temp_celsius', {
                  required: 'Required',
                  min: { value: -60, message: 'Below expected range' },
                  max: { value: 60, message: 'Above expected range' },
                  validate: (v) => isFinite(Number(v)) || 'Must be a valid number',
                })}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <FormField label="Init Battery %" error={errors.initial_battery_pct?.message}>
              <input
                type="number" min="0" max="100" step="1" inputMode="numeric"
                className={inputClass}
                {...register('initial_battery_pct', {
                  required: 'Required',
                  min: { value: 0, message: '0–100' },
                  max: { value: 100, message: '0–100' },
                })}
              />
            </FormField>

            <FormField label="Init Range (mi)" error={errors.initial_range_miles?.message}>
              <input
                type="number" step="0.1" min="0" max="1000" inputMode="decimal"
                className={inputClass}
                {...register('initial_range_miles', {
                  required: 'Required',
                  min: { value: 0, message: 'Must be ≥ 0' },
                  max: { value: 1000, message: 'Value too large' },
                })}
              />
            </FormField>

            <FormField label="Final Battery %" error={errors.final_battery_pct?.message}>
              <input
                type="number" min="0" max="100" step="1" inputMode="numeric"
                className={inputClass}
                {...register('final_battery_pct', {
                  required: 'Required',
                  min: { value: 0, message: '0–100' },
                  max: { value: 100, message: '0–100' },
                })}
              />
            </FormField>

            <FormField label="Final Range (mi)" error={errors.final_range_miles?.message}>
              <input
                type="number" step="0.1" min="0" max="1000" inputMode="decimal"
                className={inputClass}
                {...register('final_range_miles', {
                  required: 'Required',
                  min: { value: 0, message: 'Must be ≥ 0' },
                  max: { value: 1000, message: 'Value too large' },
                })}
              />
            </FormField>
          </div>

          <FormField label="Date Unplugged" error={errors.date_unplugged?.message}>
            <input
              type="date" className={`${inputClass} max-w-xs`}
              {...register('date_unplugged', { required: 'Required' })}
            />
          </FormField>

          {/* ── Optional charger cost section ──────────────────────────── */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Charger cost <span className="font-normal normal-case text-gray-400">(optional — auto-estimated if left blank)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Type</label>
                <select
                  value={formChargerType}
                  onChange={(e) => setFormChargerType(e.target.value as 'home' | 'public')}
                  className={inputClass}
                >
                  <option value="home">🏠 Home</option>
                  <option value="public">⚡ Away</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Energy (kWh)</label>
                <input
                  type="number" step="0.01" min="0" max="200" inputMode="decimal"
                  placeholder="Auto"
                  value={formKwh}
                  onChange={(e) => setFormKwh(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Cost (£)</label>
                <input
                  type="number" step="0.01" min="0" max="10000" inputMode="decimal"
                  placeholder="Auto"
                  value={formCost}
                  onChange={(e) => setFormCost(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <button
            type="submit" disabled={submitting}
            className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            {submitting ? 'Saving…' : 'Save Session'}
          </button>
        </form>
      </div>

      {/* ── Sessions + inline charger costs ──────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
        <h2 className="text-lg font-bold text-green-900 mb-4">Charging Sessions</h2>

        {sessions.length === 0 ? (
          <p className="text-gray-400 text-sm">No sessions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left text-green-700 border-b border-green-100">
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3" aria-label="Odometer (miles)">Odo (mi)</th>
                  <th className="pb-2 pr-3" aria-label="Initial battery percentage">Init%</th>
                  <th className="pb-2 pr-3" aria-label="Initial range (miles)">Init Range</th>
                  <th className="pb-2 pr-3" aria-label="Final battery percentage">Final%</th>
                  <th className="pb-2 pr-3" aria-label="Final range (miles)">Final Range</th>
                  <th className="pb-2 pr-3" aria-label="Air temperature (°C)">Temp</th>
                  <th className="pb-2 pr-2 border-l border-green-100 pl-3">Type</th>
                  <th className="pb-2 pr-2" aria-label="Energy (kWh)">kWh</th>
                  <th className="pb-2 pr-2" aria-label="Cost (£)">£</th>
                  <th className="pb-2" colSpan={2}></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const draft = costDrafts[s.id];
                  const edit = sessionEdits[s.id] ?? {};
                  const isSaving = savingId === s.id;
                  return (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-green-50 align-middle">
                      {/* ── Session field cells (all editable) ── */}
                      <td className="py-2 pr-3">
                        <input
                          type="date"
                          value={edit.date_unplugged ?? s.date_unplugged}
                          onChange={(e) => patchSessionEdit(s.id, { date_unplugged: e.target.value })}
                          className={rowInputClass}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number" step="0.1" min="0" max="999999"
                          value={edit.odometer_miles ?? s.odometer_miles}
                          onChange={(e) => patchSessionEdit(s.id, { odometer_miles: Number(e.target.value) })}
                          className={`${rowInputClass} w-24`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number" min="0" max="100" step="1"
                          value={edit.initial_battery_pct ?? s.initial_battery_pct}
                          onChange={(e) => patchSessionEdit(s.id, { initial_battery_pct: Number(e.target.value) })}
                          className={`${rowInputClass} w-14`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number" step="0.1" min="0" max="1000"
                          value={edit.initial_range_miles ?? s.initial_range_miles}
                          onChange={(e) => patchSessionEdit(s.id, { initial_range_miles: Number(e.target.value) })}
                          className={`${rowInputClass} w-16`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number" min="0" max="100" step="1"
                          value={edit.final_battery_pct ?? s.final_battery_pct}
                          onChange={(e) => patchSessionEdit(s.id, { final_battery_pct: Number(e.target.value) })}
                          className={`${rowInputClass} w-14`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number" step="0.1" min="0" max="1000"
                          value={edit.final_range_miles ?? s.final_range_miles}
                          onChange={(e) => patchSessionEdit(s.id, { final_range_miles: Number(e.target.value) })}
                          className={`${rowInputClass} w-16`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number" step="0.1" min="-60" max="60"
                          value={edit.air_temp_celsius ?? s.air_temp_celsius}
                          onChange={(e) => patchSessionEdit(s.id, { air_temp_celsius: Number(e.target.value) })}
                          className={`${rowInputClass} w-14`}
                        />
                      </td>

                      {/* ── Inline cost cells ── */}
                      <td className="py-2 pr-2 border-l border-green-100 pl-3">
                        <select
                          value={draft?.type ?? 'home'}
                          onChange={(e) => patchDraft(s.id, { type: e.target.value as 'home' | 'public' })}
                          className="border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                        >
                          <option value="home">🏠 Home</option>
                          <option value="public">⚡ Away</option>
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number" step="0.01" min="0" max="200"
                          value={draft?.kwh ?? ''}
                          onChange={(e) => patchDraft(s.id, { kwh: e.target.value })}
                          className={`w-20 border rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 ${draft?.isEstimate ? 'border-dashed border-gray-300 text-gray-400 italic' : 'border-gray-200'}`}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number" step="0.01" min="0" max="10000"
                          value={draft?.price ?? ''}
                          onChange={(e) => patchDraft(s.id, { price: e.target.value })}
                          className={`w-20 border rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 ${draft?.isEstimate ? 'border-dashed border-gray-300 text-gray-400 italic' : 'border-gray-200'}`}
                        />
                      </td>
                      <td className="py-2 pr-1">
                        <button
                          onClick={() => saveRow(s.id)}
                          disabled={isSaving}
                          className="text-xs font-medium px-2 py-1 rounded transition-colors whitespace-nowrap text-blue-500 hover:text-blue-700 disabled:opacity-50"
                        >
                          {isSaving ? '…' : 'Save'}
                        </button>
                      </td>
                      <td className="py-2 pl-1">
                        <button
                          onClick={() => deleteSession(s.id)}
                          className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';

const rowInputClass =
  'w-28 border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500';

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}
