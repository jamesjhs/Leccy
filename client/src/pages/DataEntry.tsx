import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import {
  sessionsApi, chargerApi, tariffApi,
  ChargingSession, ChargerCostWithDate, TariffConfig, NewSession,
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
  const [costDrafts, setCostDrafts] = useState<Record<number, CostDraft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

      const currentTariff = tariffs[0] ?? null;

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
      const [sessRes, costsRes, tariffRes] = await Promise.all([
        sessionsApi.getAll(),
        chargerApi.getAll(),
        tariffApi.getAll(),
      ]);
      setSessions(sessRes.data.sessions);
      setCosts(costsRes.data.costs);
      setTariffs(tariffRes.data.tariffs);
      buildDrafts(sessRes.data.sessions, costsRes.data.costs, tariffRes.data.tariffs);
    } catch {/* ignore */}
  }, [buildDrafts]);

  useEffect(() => { void loadData(); }, [loadData]);

  // ─── Session form submit ──────────────────────────────────────────────────
  async function onSubmit(data: NewSession) {
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(true);
    try {
      await sessionsApi.create({
        ...data,
        odometer_miles: Number(data.odometer_miles),
        initial_battery_pct: Number(data.initial_battery_pct),
        initial_range_miles: Number(data.initial_range_miles),
        final_battery_pct: Number(data.final_battery_pct),
        final_range_miles: Number(data.final_range_miles),
        air_temp_celsius: Number(data.air_temp_celsius),
      });
      setFormSuccess('Session saved!');
      reset({ date_unplugged: today });
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

  // ─── Inline cost save ─────────────────────────────────────────────────────
  async function saveCost(sessionId: number) {
    const draft = costDrafts[sessionId];
    if (!draft) return;
    const kwh = Number(draft.kwh);
    const pricePence = Math.round(Number(draft.price) * 100);
    if (!isFinite(kwh) || kwh <= 0 || !isFinite(pricePence) || pricePence < 0) return;

    setSavingId(sessionId);
    try {
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
      // Mark as no longer an estimate
      setCostDrafts((prev) => ({
        ...prev,
        [sessionId]: { ...prev[sessionId], isEstimate: false },
      }));
      void loadData();
    } catch {/* ignore */} finally {
      setSavingId(null);
    }
  }

  async function clearCost(sessionId: number) {
    const draft = costDrafts[sessionId];
    if (!draft?.costId) return;
    try {
      await chargerApi.delete(draft.costId);
      void loadData();
    } catch {/* ignore */}
  }

  function patchDraft(sessionId: number, patch: Partial<CostDraft>) {
    setCostDrafts((prev) => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], ...patch },
    }));
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-6">Add Charging Session</h1>

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
        <h2 className="text-lg font-bold text-green-900 mb-1">Charging Sessions</h2>
        <p className="text-xs text-gray-400 mb-4">
          Charger cost columns show <span className="italic">estimated</span> values until you save them manually.
        </p>

        {sessions.length === 0 ? (
          <p className="text-gray-400 text-sm">No sessions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-green-700 border-b border-green-100">
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Odo (mi)</th>
                  <th className="pb-2 pr-3">Init%</th>
                  <th className="pb-2 pr-3">Final%</th>
                  <th className="pb-2 pr-3">Range</th>
                  <th className="pb-2 pr-3">Temp</th>
                  <th className="pb-2 pr-2 border-l border-green-100 pl-3">Type</th>
                  <th className="pb-2 pr-2">kWh</th>
                  <th className="pb-2 pr-2">£</th>
                  <th className="pb-2" colSpan={2}></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const draft = costDrafts[s.id];
                  const isSaving = savingId === s.id;
                  const hasSaved = draft && !draft.isEstimate && draft.costId;
                  return (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-green-50 align-middle">
                      <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{s.date_unplugged}</td>
                      <td className="py-2 pr-3 font-mono">{s.odometer_miles.toLocaleString()}</td>
                      <td className="py-2 pr-3">{s.initial_battery_pct}%</td>
                      <td className="py-2 pr-3 text-green-700 font-semibold">{s.final_battery_pct}%</td>
                      <td className="py-2 pr-3">{s.final_range_miles} mi</td>
                      <td className="py-2 pr-3">{s.air_temp_celsius}°C</td>

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
                          onClick={() => saveCost(s.id)}
                          disabled={isSaving}
                          className={`text-xs font-medium px-2 py-1 rounded transition-colors whitespace-nowrap ${hasSaved ? 'text-green-600 hover:text-green-800' : 'text-blue-500 hover:text-blue-700'}`}
                          title={hasSaved ? 'Update saved cost' : 'Save estimated cost'}
                        >
                          {isSaving ? '…' : hasSaved ? '✓ Saved' : 'Save'}
                        </button>
                      </td>
                      <td className="py-2 pl-1">
                        {hasSaved ? (
                          <button
                            onClick={() => clearCost(s.id)}
                            className="text-gray-300 hover:text-red-400 text-xs transition-colors"
                            title="Clear saved cost"
                          >
                            ✕
                          </button>
                        ) : (
                          <button
                            onClick={() => deleteSession(s.id)}
                            className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors"
                          >
                            Delete
                          </button>
                        )}
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
