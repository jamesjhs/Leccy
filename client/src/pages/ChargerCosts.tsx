import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { chargerApi, sessionsApi, tariffApi, ChargerCostWithDate, ChargingSession, NewChargerCost, TariffConfig } from '../utils/api';

interface ChargerForm {
  session_id: number;
  energy_kwh: number;
  price_pounds: number; // UI uses pounds, convert to pence for API
  charger_type: 'home' | 'public';
  charger_name?: string;
  rate_type: 'peak' | 'off_peak';
}

function getActiveTariff(tariffs: TariffConfig[]): TariffConfig | null {
  const today = new Date().toISOString().split('T')[0];
  const active = tariffs
    .filter((t) => t.effective_from <= today)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return active[0] ?? null;
}

export default function ChargerCosts() {
  const [costs, setCosts] = useState<ChargerCostWithDate[]>([]);
  const [sessions, setSessions] = useState<ChargingSession[]>([]);
  const [tariffs, setTariffs] = useState<TariffConfig[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ChargerForm>({ defaultValues: { charger_type: 'home', rate_type: 'peak' } });

  const chargerType = watch('charger_type');
  const energyKwh = watch('energy_kwh');
  const rateType = watch('rate_type');

  const activeTariff = getActiveTariff(tariffs);
  const isHome = chargerType === 'home';

  // Auto-calculate price for home charges whenever energy or rate type changes
  useEffect(() => {
    if (!isHome || !activeTariff) return;
    const kwhNum = Number(energyKwh);
    if (!isFinite(kwhNum) || kwhNum <= 0) return;
    const ratePencePerKwh =
      rateType === 'off_peak'
        ? (activeTariff.off_peak_rate_pence_per_kwh ?? activeTariff.rate_pence_per_kwh)
        : activeTariff.rate_pence_per_kwh;
    const price = (kwhNum * ratePencePerKwh) / 100;
    setValue('price_pounds', Number(price.toFixed(3)));
  }, [energyKwh, rateType, isHome, activeTariff, setValue]);

  async function load() {
    try {
      const [costsRes, sessRes, tariffRes] = await Promise.all([
        chargerApi.getAll(),
        sessionsApi.getAll(),
        tariffApi.getAll(),
      ]);
      setCosts(costsRes.data.costs);
      setSessions(sessRes.data.sessions);
      setTariffs(tariffRes.data.tariffs);
    } catch {/* ignore */}
  }

  useEffect(() => { void load(); }, []);

  async function onSubmit(data: ChargerForm) {
    setApiError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const payload: NewChargerCost = {
        session_id: Number(data.session_id),
        energy_kwh: Number(data.energy_kwh),
        price_pence: Math.round(Number(data.price_pounds) * 100),
        charger_type: data.charger_type,
        charger_name: data.charger_type === 'public' ? data.charger_name : undefined,
      };
      await chargerApi.create(payload);
      setSuccess('Charger cost saved!');
      reset({ charger_type: 'home', rate_type: 'peak' });
      void load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to save';
      setApiError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteCost(id: number) {
    if (!confirm('Delete this charger cost entry?')) return;
    try {
      await chargerApi.delete(id);
      void load();
    } catch {/* ignore */}
  }

  // Sessions that don't yet have a charger cost entry
  const costSessionIds = new Set(costs.map((c) => c.session_id));
  const sessionsWithoutCost = sessions.filter((s) => !costSessionIds.has(s.id));

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-6">Charger Costs</h1>

      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 mb-8">
        <h2 className="text-lg font-semibold text-green-800 mb-4">Add Charger Cost</h2>

        {success && (
          <div className="bg-green-50 border border-green-300 text-green-700 rounded-lg px-4 py-3 mb-5 text-sm">
            {success}
          </div>
        )}
        {apiError && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Charging Session</label>
            <select
              className={inputClass}
              {...register('session_id', { required: 'Please select a session' })}
            >
              <option value="">— Select a session —</option>
              {sessionsWithoutCost.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.date_unplugged} · {s.odometer_miles.toLocaleString()} mi · {s.initial_battery_pct}% → {s.final_battery_pct}%
                </option>
              ))}
              {sessions
                .filter((s) => costSessionIds.has(s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.date_unplugged} · {s.odometer_miles.toLocaleString()} mi (has cost)
                  </option>
                ))}
            </select>
            {errors.session_id && <p className="text-red-500 text-xs mt-1">{errors.session_id.message}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Energy Delivered (kWh)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                max="200"
                inputMode="decimal"
                className={inputClass}
                {...register('energy_kwh', {
                  required: 'Required',
                  min: { value: 0.001, message: 'Must be > 0' },
                  max: { value: 200, message: 'Value exceeds expected maximum' },
                  validate: (v) => isFinite(Number(v)) || 'Must be a valid number',
                })}
              />
              {errors.energy_kwh && <p className="text-red-500 text-xs mt-1">{errors.energy_kwh.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Total Price (£)
              </label>
              {isHome ? (
                <>
                  {activeTariff ? (
                    <>
                      <input
                        type="number"
                        readOnly
                        tabIndex={-1}
                        className={`${inputClass} bg-green-50 text-green-800 cursor-default`}
                        {...register('price_pounds', {
                          required: 'Required',
                          min: { value: 0, message: 'Must be ≥ 0' },
                          validate: (v) => isFinite(Number(v)) || 'Must be a valid number',
                        })}
                      />
                      <p className="text-xs text-green-700 mt-1">
                        Auto-calculated from tariff <span className="font-semibold">{activeTariff.tariff_name}</span>
                        {' '}({rateType === 'off_peak' ? (activeTariff.off_peak_rate_pence_per_kwh ?? activeTariff.rate_pence_per_kwh) : activeTariff.rate_pence_per_kwh}p/kWh)
                      </p>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max="10000"
                        inputMode="decimal"
                        placeholder="0.000"
                        className={inputClass}
                        {...register('price_pounds', {
                          required: 'Required',
                          min: { value: 0, message: 'Must be ≥ 0' },
                          max: { value: 10000, message: 'Value too large' },
                          validate: (v) => isFinite(Number(v)) || 'Must be a valid number',
                        })}
                      />
                      <p className="text-xs text-amber-600 mt-1">No active tariff — enter price manually. Configure a tariff on the <a href="/tariff" className="underline">Tariff page</a>.</p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="10000"
                    inputMode="decimal"
                    placeholder="0.000"
                    className={inputClass}
                    {...register('price_pounds', {
                      required: 'Required',
                      min: { value: 0, message: 'Must be ≥ 0' },
                      max: { value: 10000, message: 'Value too large' },
                      validate: (v) => isFinite(Number(v)) || 'Must be a valid number',
                    })}
                  />
                </>
              )}
              {errors.price_pounds && <p className="text-red-500 text-xs mt-1">{errors.price_pounds.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Charger Type</label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" value="home" {...register('charger_type')} className="accent-green-600" />
                <span className="text-sm">🏠 Home</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" value="public" {...register('charger_type')} className="accent-green-600" />
                <span className="text-sm">⚡ Public</span>
              </label>
            </div>
          </div>

          {isHome && activeTariff && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Tariff Rate</label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="peak" {...register('rate_type')} className="accent-amber-500" />
                  <span className="text-sm">☀️ Peak ({activeTariff.rate_pence_per_kwh}p/kWh)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="off_peak" {...register('rate_type')} className="accent-blue-500" />
                  <span className="text-sm">🌙 Off-Peak ({activeTariff.off_peak_rate_pence_per_kwh != null ? `${activeTariff.off_peak_rate_pence_per_kwh}p/kWh` : 'N/A'})</span>
                </label>
              </div>
            </div>
          )}

          {chargerType === 'public' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Charger Name / Network</label>
              <input
                type="text"
                placeholder="e.g. Pod Point, Osprey"
                maxLength={100}
                className={inputClass}
                {...register('charger_name', {
                  maxLength: { value: 100, message: 'Name too long (max 100 characters)' },
                })}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            {submitting ? 'Saving…' : 'Save Cost'}
          </button>
        </form>
      </div>

      {/* Existing costs */}
      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
        <h2 className="text-lg font-bold text-green-900 mb-4">Charger Cost History</h2>
        {costs.length === 0 ? (
          <p className="text-gray-400 text-sm">No charger costs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-green-700 border-b border-green-100">
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">kWh</th>
                  <th className="pb-2 pr-3">Cost</th>
                  <th className="pb-2 pr-3">Type</th>
                  <th className="pb-2 pr-3">Charger</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-green-50">
                    <td className="py-1.5 pr-3 text-gray-600">{c.date_unplugged}</td>
                    <td className="py-1.5 pr-3 font-mono">{c.energy_kwh}</td>
                    <td className="py-1.5 pr-3 font-semibold text-green-700">£{(c.price_pence / 100).toFixed(3)}</td>
                    <td className="py-1.5 pr-3 capitalize">{c.charger_type}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{c.charger_name ?? '—'}</td>
                    <td className="py-1.5">
                      <button
                        onClick={() => deleteCost(c.id)}
                        className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
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
