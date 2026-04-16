import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { vehiclesApi, Vehicle, NewVehicle } from '../utils/api';

interface VehicleForm {
  licence_plate: string;
  nickname?: string;
  vehicle_type?: string;
  battery_kwh?: string;
}

const VEHICLE_TYPES = [
  'Hatchback',
  'Saloon',
  'Estate',
  'SUV',
  'Crossover',
  'MPV',
  'Coupe',
  'Convertible',
  'Van',
  'Pickup',
  'Other',
];

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';

export default function Vehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<VehicleForm>();

  async function load() {
    try {
      const res = await vehiclesApi.getAll();
      setVehicles(res.data.vehicles);
    } catch {/* ignore */}
  }

  useEffect(() => { void load(); }, []);

  function startEdit(v: Vehicle) {
    setEditingId(v.id);
    setValue('licence_plate', v.licence_plate);
    setValue('nickname', v.nickname ?? '');
    setValue('vehicle_type', v.vehicle_type ?? '');
    setValue('battery_kwh', v.battery_kwh != null ? String(v.battery_kwh) : '');
    setSuccess(null);
    setApiError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    reset();
    setSuccess(null);
    setApiError(null);
  }

  async function onSubmit(data: VehicleForm) {
    setApiError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const payload: NewVehicle = {
        licence_plate: data.licence_plate,
        nickname: data.nickname || undefined,
        vehicle_type: data.vehicle_type || undefined,
        battery_kwh: data.battery_kwh !== '' && data.battery_kwh !== undefined
          ? Number(data.battery_kwh)
          : null,
      };

      if (editingId !== null) {
        await vehiclesApi.update(editingId, payload);
        setSuccess('Vehicle updated!');
      } else {
        await vehiclesApi.create(payload);
        setSuccess('Vehicle added!');
      }

      reset();
      setEditingId(null);
      void load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to save vehicle';
      setApiError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteVehicle(id: number) {
    if (!confirm('Delete this vehicle? All associated charging sessions and maintenance entries will lose their vehicle link.')) return;
    try {
      await vehiclesApi.delete(id);
      void load();
    } catch {/* ignore */}
  }

  function vehicleLabel(v: Vehicle) {
    return v.nickname ? `${v.nickname} (${v.licence_plate})` : v.licence_plate;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-1">My Vehicles</h1>
      <p className="text-green-600 mb-6 text-sm">
        Add your electric vehicles to track charging data and analytics per vehicle.
      </p>

      {/* Form */}
      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 mb-8">
        <h2 className="text-lg font-semibold text-green-800 mb-4">
          {editingId !== null ? 'Edit Vehicle' : 'Add Vehicle'}
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Licence Plate <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. AB12 CDE"
                maxLength={30}
                className={inputClass}
                {...register('licence_plate', {
                  required: 'Licence plate is required',
                  maxLength: { value: 30, message: 'Too long' },
                })}
              />
              {errors.licence_plate && (
                <p className="text-red-500 text-xs mt-1">{errors.licence_plate.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nickname <span className="font-normal text-gray-400">optional</span>
              </label>
              <input
                type="text"
                placeholder="e.g. The Tesla"
                maxLength={100}
                className={inputClass}
                {...register('nickname', { maxLength: { value: 100, message: 'Too long' } })}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Vehicle Type <span className="font-normal text-gray-400">optional</span>
              </label>
              <select className={inputClass} {...register('vehicle_type')}>
                <option value="">— Select type —</option>
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Battery Capacity (kWh) <span className="font-normal text-gray-400">optional</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="500"
                inputMode="decimal"
                placeholder="e.g. 75"
                className={inputClass}
                {...register('battery_kwh', {
                  min: { value: 0, message: 'Must be ≥ 0' },
                  max: { value: 500, message: 'Value too large' },
                  validate: (v) =>
                    v === '' || v === undefined || isFinite(Number(v)) || 'Must be a valid number',
                })}
              />
              {errors.battery_kwh && (
                <p className="text-red-500 text-xs mt-1">{errors.battery_kwh.message}</p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-6 py-2.5 rounded-lg transition-colors text-sm"
            >
              {submitting ? 'Saving…' : editingId !== null ? 'Update Vehicle' : 'Add Vehicle'}
            </button>
            {editingId !== null && (
              <button
                type="button"
                onClick={cancelEdit}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Vehicle list */}
      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
        <h2 className="text-lg font-bold text-green-900 mb-4">Your Vehicles</h2>

        {vehicles.length === 0 ? (
          <p className="text-gray-400 text-sm">No vehicles added yet. Add your first vehicle above.</p>
        ) : (
          <div className="space-y-3">
            {vehicles.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between border border-green-100 rounded-lg px-4 py-3 hover:bg-green-50 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="text-2xl">🚗</div>
                  <div className="min-w-0">
                    <div className="font-semibold text-green-900 text-sm">{vehicleLabel(v)}</div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      {v.vehicle_type && <span>{v.vehicle_type}</span>}
                      {v.battery_kwh != null && <span>{v.battery_kwh} kWh battery</span>}
                      {!v.vehicle_type && v.battery_kwh == null && (
                        <span className="italic">No type or battery info</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  <button
                    onClick={() => startEdit(v)}
                    className="text-green-600 hover:text-green-800 text-xs font-semibold transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteVehicle(v.id)}
                    className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
