import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { maintenanceApi, MaintenanceLog, NewMaintenance } from '../utils/api';

interface MaintenanceForm {
  description: string;
  log_date: string;
  cost_pounds?: number | string;
}

export default function Maintenance() {
  const [entries, setEntries] = useState<MaintenanceLog[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MaintenanceForm>({ defaultValues: { log_date: today } });

  async function load() {
    try {
      const res = await maintenanceApi.getAll();
      setEntries(res.data.entries);
    } catch {/* ignore */}
  }

  useEffect(() => { void load(); }, []);

  async function onSubmit(data: MaintenanceForm) {
    setApiError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const payload: NewMaintenance = {
        description: data.description,
        log_date: data.log_date,
        cost_pence:
          data.cost_pounds !== '' && data.cost_pounds !== undefined
            ? Math.round(Number(data.cost_pounds) * 100)
            : null,
      };
      await maintenanceApi.create(payload);
      setSuccess('Entry saved!');
      reset({ log_date: today });
      void load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to save';
      setApiError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteEntry(id: number) {
    if (!confirm('Delete this maintenance entry?')) return;
    try {
      await maintenanceApi.delete(id);
      void load();
    } catch {/* ignore */}
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-6">Maintenance Log</h1>

      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 mb-8">
        <h2 className="text-lg font-semibold text-green-800 mb-4">Add Entry</h2>

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
            <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
            <textarea
              rows={3}
              placeholder="e.g. Tyre rotation, cabin air filter replacement"
              maxLength={2000}
              className={`${inputClass} resize-none`}
              {...register('description', {
                required: 'Description is required',
                maxLength: { value: 2000, message: 'Description too long (max 2000 characters)' },
              })}
            />
            {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Date</label>
              <input
                type="date"
                className={inputClass}
                {...register('log_date', { required: 'Date is required' })}
              />
              {errors.log_date && <p className="text-red-500 text-xs mt-1">{errors.log_date.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Cost (£) <span className="font-normal text-gray-400">optional</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100000"
                inputMode="decimal"
                placeholder="0.00"
                className={inputClass}
                {...register('cost_pounds', {
                  min: { value: 0, message: 'Must be ≥ 0' },
                  max: { value: 100000, message: 'Value too large' },
                  validate: (v) =>
                    v === '' || v === undefined || isFinite(Number(v)) || 'Must be a valid number',
                })}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            {submitting ? 'Saving…' : 'Save Entry'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
        <h2 className="text-lg font-bold text-green-900 mb-4">Maintenance History</h2>
        {entries.length === 0 ? (
          <p className="text-gray-400 text-sm">No maintenance entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-green-700 border-b border-green-100">
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Description</th>
                  <th className="pb-2 pr-3">Cost</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-green-50">
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{e.log_date}</td>
                    <td className="py-2 pr-3">{e.description}</td>
                    <td className="py-2 pr-3 font-semibold text-green-700">
                      {e.cost_pence != null ? `£${(e.cost_pence / 100).toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => deleteEntry(e.id)}
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
