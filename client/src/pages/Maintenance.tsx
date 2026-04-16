import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { maintenanceApi, vehiclesApi, MaintenanceLog, NewMaintenance, Vehicle } from '../utils/api';

interface MaintenanceForm {
  description: string;
  log_date: string;
  cost_pounds?: number | string;
}

export default function Maintenance() {
  const [entries, setEntries] = useState<MaintenanceLog[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
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
      const [entriesRes, vehicleRes] = await Promise.all([
        maintenanceApi.getAll(selectedVehicleId ?? undefined),
        vehiclesApi.getAll(),
      ]);
      setEntries(entriesRes.data.entries);
      setVehicles(vehicleRes.data.vehicles);
    } catch {/* ignore */}
  }

  useEffect(() => { void load(); }, [selectedVehicleId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(data: MaintenanceForm) {
    setApiError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const payload: NewMaintenance = {
        vehicle_id: selectedVehicleId,
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

  function vehicleLabel(v: Vehicle) {
    return v.nickname ? `${v.nickname} (${v.licence_plate})` : v.licence_plate;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-6">Maintenance Log</h1>

      {/* Vehicle selector */}
      {vehicles.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm text-amber-800">
          No vehicles added yet.{' '}
          <Link to="/vehicles" className="font-semibold underline hover:text-amber-900">
            Add a vehicle
          </Link>{' '}
          to link maintenance entries to a specific vehicle.
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
              All Vehicles
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
                🚗 {vehicleLabel(v)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 mb-8">
        <h2 className="text-lg font-semibold text-green-800 mb-1">Add Entry</h2>
        {selectedVehicleId !== null && (
          <p className="text-xs text-gray-500 mb-4">
            Logging for: <span className="font-semibold">{vehicleLabel(vehicles.find((v) => v.id === selectedVehicleId)!)}</span>
          </p>
        )}
        {selectedVehicleId === null && vehicles.length > 0 && (
          <p className="text-xs text-gray-500 mb-4">Select a vehicle above to link this entry, or log without a vehicle.</p>
        )}

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
