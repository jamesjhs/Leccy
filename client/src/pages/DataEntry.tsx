import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { sessionsApi, ChargingSession, NewSession } from '../utils/api';

export default function DataEntry() {
  const [sessions, setSessions] = useState<ChargingSession[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<NewSession>({
    defaultValues: { date_unplugged: today },
  });

  const initialPct = watch('initial_battery_pct');
  const finalPct = watch('final_battery_pct');

  async function loadSessions() {
    try {
      const res = await sessionsApi.getAll();
      setSessions(res.data.sessions);
    } catch {/* ignore */}
  }

  useEffect(() => { void loadSessions(); }, []);

  async function onSubmit(data: NewSession) {
    setApiError(null);
    setSuccess(null);
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
      setSuccess('Session saved successfully!');
      reset({ date_unplugged: today });
      void loadSessions();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to save session';
      setApiError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteSession(id: number) {
    if (!confirm('Delete this session?')) return;
    try {
      await sessionsApi.delete(id);
      void loadSessions();
    } catch {/* ignore */}
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-6">Add Charging Session</h1>

      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 mb-8">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField label="Odometer (miles)" error={errors.odometer_miles?.message}>
              <input
                type="number"
                step="0.1"
                min="0"
                className={inputClass}
                {...register('odometer_miles', { required: 'Required', min: { value: 0, message: 'Must be ≥ 0' } })}
              />
            </FormField>

            <FormField label="Air Temperature (°C)" error={errors.air_temp_celsius?.message}>
              <input
                type="number"
                step="0.1"
                className={inputClass}
                {...register('air_temp_celsius', { required: 'Required' })}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField label={`Initial Battery % (${initialPct ?? 0}%)`} error={errors.initial_battery_pct?.message}>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                className="w-full accent-green-600"
                {...register('initial_battery_pct', { required: 'Required' })}
              />
              <input
                type="number"
                min="0"
                max="100"
                className={`${inputClass} mt-1`}
                {...register('initial_battery_pct', { required: 'Required', min: 0, max: 100 })}
              />
            </FormField>

            <FormField label="Initial Range (miles)" error={errors.initial_range_miles?.message}>
              <input
                type="number"
                step="0.1"
                min="0"
                className={inputClass}
                {...register('initial_range_miles', { required: 'Required', min: 0 })}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField label={`After-Charge Battery % (${finalPct ?? 0}%)`} error={errors.final_battery_pct?.message}>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                className="w-full accent-green-600"
                {...register('final_battery_pct', { required: 'Required' })}
              />
              <input
                type="number"
                min="0"
                max="100"
                className={`${inputClass} mt-1`}
                {...register('final_battery_pct', { required: 'Required', min: 0, max: 100 })}
              />
            </FormField>

            <FormField label="After-Charge Range (miles)" error={errors.final_range_miles?.message}>
              <input
                type="number"
                step="0.1"
                min="0"
                className={inputClass}
                {...register('final_range_miles', { required: 'Required', min: 0 })}
              />
            </FormField>
          </div>

          <FormField label="Date Unplugged" error={errors.date_unplugged?.message}>
            <input
              type="date"
              className={inputClass}
              {...register('date_unplugged', { required: 'Required' })}
            />
          </FormField>

          <button
            type="submit"
            disabled={submitting}
            className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            {submitting ? 'Saving…' : 'Save Session'}
          </button>
        </form>
      </div>

      {/* Recent sessions */}
      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
        <h2 className="text-lg font-bold text-green-900 mb-4">Recent Sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-gray-400 text-sm">No sessions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-green-700 border-b border-green-100">
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Odo (mi)</th>
                  <th className="pb-2 pr-3">Init %</th>
                  <th className="pb-2 pr-3">Final %</th>
                  <th className="pb-2 pr-3">Range</th>
                  <th className="pb-2 pr-3">Temp</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-green-50">
                    <td className="py-1.5 pr-3 text-gray-600">{s.date_unplugged}</td>
                    <td className="py-1.5 pr-3 font-mono">{s.odometer_miles.toLocaleString()}</td>
                    <td className="py-1.5 pr-3">{s.initial_battery_pct}%</td>
                    <td className="py-1.5 pr-3 text-green-700 font-semibold">{s.final_battery_pct}%</td>
                    <td className="py-1.5 pr-3">{s.final_range_miles} mi</td>
                    <td className="py-1.5 pr-3">{s.air_temp_celsius}°C</td>
                    <td className="py-1.5">
                      <button
                        onClick={() => deleteSession(s.id)}
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
