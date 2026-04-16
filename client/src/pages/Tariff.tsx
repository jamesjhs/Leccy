import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { tariffApi, TariffConfig, NewTariff } from '../utils/api';

const TARIFF_DEFAULTS = {
  effective_from: new Date().toISOString().split('T')[0],
  peak_start_time: '07:00',
  off_peak_start_time: '00:00',
  off_peak_rate_pence_per_kwh: 0,
} as const;

export default function Tariff() {
  const [tariffs, setTariffs] = useState<TariffConfig[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<NewTariff>({ defaultValues: TARIFF_DEFAULTS });

  async function load() {
    try {
      const res = await tariffApi.getAll();
      setTariffs(res.data.tariffs);
    } catch {/* ignore */}
  }

  useEffect(() => { void load(); }, []);

  async function onSubmit(data: NewTariff) {
    setApiError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const payload: NewTariff = {
        tariff_name: data.tariff_name,
        rate_pence_per_kwh: Number(data.rate_pence_per_kwh),
        peak_start_time: data.peak_start_time,
        off_peak_rate_pence_per_kwh: Number(data.off_peak_rate_pence_per_kwh),
        off_peak_start_time: data.off_peak_start_time,
        effective_from: data.effective_from,
      };

      if (editingId !== null) {
        await tariffApi.update(editingId, payload);
        setSuccess('Tariff updated!');
        setEditingId(null);
      } else {
        await tariffApi.create(payload);
        setSuccess('Tariff saved!');
      }
      reset(TARIFF_DEFAULTS);
      void load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to save';
      setApiError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(t: TariffConfig) {
    setEditingId(t.id);
    setValue('tariff_name', t.tariff_name);
    setValue('rate_pence_per_kwh', t.rate_pence_per_kwh);
    setValue('peak_start_time', t.peak_start_time ?? TARIFF_DEFAULTS.peak_start_time);
    setValue('off_peak_rate_pence_per_kwh', t.off_peak_rate_pence_per_kwh ?? TARIFF_DEFAULTS.off_peak_rate_pence_per_kwh);
    setValue('off_peak_start_time', t.off_peak_start_time ?? TARIFF_DEFAULTS.off_peak_start_time);
    setValue('effective_from', t.effective_from);
    setSuccess(null);
    setApiError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    reset(TARIFF_DEFAULTS);
  }

  async function deleteTariff(id: number) {
    if (!confirm('Delete this tariff?')) return;
    try {
      await tariffApi.delete(id);
      if (editingId === id) cancelEdit();
      void load();
    } catch {/* ignore */}
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-6">Tariff Configuration</h1>

      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 mb-8">
        <h2 className="text-lg font-semibold text-green-800 mb-4">
          {editingId !== null ? 'Edit Tariff' : 'Add Tariff'}
        </h2>

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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Tariff Name</label>
              <input
                type="text"
                placeholder="e.g. Octopus Agile"
                className={inputClass}
                {...register('tariff_name', { required: 'Name is required' })}
              />
              {errors.tariff_name && <p className="text-red-500 text-xs mt-1">{errors.tariff_name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Effective From</label>
              <input
                type="date"
                className={inputClass}
                {...register('effective_from', { required: 'Required' })}
              />
              {errors.effective_from && <p className="text-red-500 text-xs mt-1">{errors.effective_from.message}</p>}
            </div>
          </div>

          {/* Peak rate */}
          <fieldset className="border border-amber-200 rounded-lg p-4 bg-amber-50">
            <legend className="text-sm font-bold text-amber-700 px-1">☀️ Peak Rate</legend>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Rate (p/kWh)</label>
                <input
                  type="number" step="0.01" min="0"
                  className={inputClass}
                  {...register('rate_pence_per_kwh', { required: 'Required', min: { value: 0, message: 'Must be ≥ 0' } })}
                />
                {errors.rate_pence_per_kwh && <p className="text-red-500 text-xs mt-1">{errors.rate_pence_per_kwh.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Starts at</label>
                <input
                  type="time"
                  className={inputClass}
                  {...register('peak_start_time', { required: 'Required' })}
                />
                {errors.peak_start_time && <p className="text-red-500 text-xs mt-1">{errors.peak_start_time.message}</p>}
              </div>
            </div>
          </fieldset>

          {/* Off-peak rate */}
          <fieldset className="border border-blue-200 rounded-lg p-4 bg-blue-50">
            <legend className="text-sm font-bold text-blue-700 px-1">🌙 Off-Peak Rate</legend>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Rate (p/kWh)</label>
                <input
                  type="number" step="0.01" min="0"
                  className={inputClass}
                  {...register('off_peak_rate_pence_per_kwh', { required: 'Required', min: { value: 0, message: 'Must be ≥ 0' } })}
                />
                {errors.off_peak_rate_pence_per_kwh && <p className="text-red-500 text-xs mt-1">{errors.off_peak_rate_pence_per_kwh.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Starts at</label>
                <input
                  type="time"
                  className={inputClass}
                  {...register('off_peak_start_time', { required: 'Required' })}
                />
                {errors.off_peak_start_time && <p className="text-red-500 text-xs mt-1">{errors.off_peak_start_time.message}</p>}
              </div>
            </div>
          </fieldset>

          <div className="flex gap-3">
            <button
              type="submit" disabled={submitting}
              className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-6 py-2.5 rounded-lg transition-colors text-sm"
            >
              {submitting ? 'Saving…' : editingId !== null ? 'Update Tariff' : 'Save Tariff'}
            </button>
            {editingId !== null && (
              <button
                type="button" onClick={cancelEdit}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
        <h2 className="text-lg font-bold text-green-900 mb-4">Tariff History</h2>
        {tariffs.length === 0 ? (
          <p className="text-gray-400 text-sm">No tariffs configured yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-green-700 border-b border-green-100">
                  <th className="pb-2 pr-3">Name</th>
                  <th className="pb-2 pr-3">☀️ Peak (p/kWh)</th>
                  <th className="pb-2 pr-3">Peak starts</th>
                  <th className="pb-2 pr-3">🌙 Off-Peak (p/kWh)</th>
                  <th className="pb-2 pr-3">Off-Peak starts</th>
                  <th className="pb-2 pr-3">Effective From</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {tariffs.map((t) => (
                  <tr key={t.id} className={`border-b border-gray-50 hover:bg-green-50 ${editingId === t.id ? 'bg-green-50' : ''}`}>
                    <td className="py-2 pr-3 font-semibold">{t.tariff_name}</td>
                    <td className="py-2 pr-3 font-mono">{t.rate_pence_per_kwh}p</td>
                    <td className="py-2 pr-3 text-gray-600">{t.peak_start_time ?? '—'}</td>
                    <td className="py-2 pr-3 font-mono">{t.off_peak_rate_pence_per_kwh ?? 0}p</td>
                    <td className="py-2 pr-3 text-gray-600">{t.off_peak_start_time ?? '—'}</td>
                    <td className="py-2 pr-3 text-gray-600">{t.effective_from}</td>
                    <td className="py-2 flex gap-2">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-green-600 hover:text-green-800 text-xs font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteTariff(t.id)}
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
