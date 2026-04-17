import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../App';
import { tariffApi, analyticsApi, vehiclesApi, TariffConfig, Vehicle } from '../utils/api';

interface SummaryStats {
  total_cost_pence: number;
  sessions_count: number;
  miles_driven: number;
}

export default function Dashboard() {
  const { user } = useAuthContext();
  const [tariffs, setTariffs] = useState<TariffConfig[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Load vehicles and tariffs once
  useEffect(() => {
    async function loadInitial() {
      try {
        const [tariffRes, vehicleRes] = await Promise.all([
          tariffApi.getAll(),
          vehiclesApi.getAll(),
        ]);
        setTariffs(tariffRes.data.tariffs);
        setVehicles(vehicleRes.data.vehicles);
      } catch {/* ignore */}
    }
    void loadInitial();
  }, []);

  // Load analytics whenever selected vehicle changes
  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const params = selectedVehicleId ? { vehicleId: selectedVehicleId } : undefined;
        const analyticsRes = await analyticsApi.get(params);
        setStats({
          total_cost_pence: analyticsRes.data.total_cost_pence,
          sessions_count: analyticsRes.data.sessions_count,
          miles_driven: analyticsRes.data.miles_driven,
        });
      } catch {/* ignore */} finally {
        setLoading(false);
      }
    }
    void loadStats();
  }, [selectedVehicleId]);

  const currentTariff = tariffs[0];

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? null;

  function vehicleLabel(v: Vehicle) {
    return v.nickname ? `${v.nickname} (${v.licence_plate})` : v.licence_plate;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-1">
        Welcome back, <span className="font-semibold">{user?.display_name || user?.email}</span> ⚡
      </h1>
      <p className="text-green-600 mb-4 text-sm">Here's your EV cost overview.</p>

      {/* Vehicle selector */}
      {vehicles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
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
      )}

      {vehicles.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm text-amber-800">
          No vehicles added yet.{' '}
          <Link to="/vehicles" className="font-semibold underline hover:text-amber-900">
            Add a vehicle
          </Link>{' '}
          to track data per vehicle.
        </div>
      )}

      {/* Vehicle detail pill */}
      {selectedVehicle && (
        <div className="flex flex-wrap gap-3 mb-4 text-xs text-gray-500">
          {selectedVehicle.vehicle_type && <span className="bg-green-50 px-2 py-1 rounded">{selectedVehicle.vehicle_type}</span>}
          {selectedVehicle.battery_kwh != null && (
            <span className="bg-green-50 px-2 py-1 rounded">{selectedVehicle.battery_kwh} kWh battery</span>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-green-700 animate-pulse">Loading…</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <SummaryCard label="Total Sessions" value={String(stats?.sessions_count ?? 0)} icon="🔋" />
            <SummaryCard
              label="Total Cost"
              value={`£${((stats?.total_cost_pence ?? 0) / 100).toFixed(2)}`}
              icon="💷"
            />
            <SummaryCard
              label="Peak Rate"
              value={currentTariff ? `${currentTariff.rate_pence_per_kwh}p/kWh` : 'N/A'}
              icon="☀️"
            />
            <SummaryCard
              label="Off-Peak Rate"
              value={currentTariff ? `${currentTariff.off_peak_rate_pence_per_kwh}p/kWh` : 'N/A'}
              icon="🌙"
            />
          </div>

          {/* Quick links */}
          <div className="flex gap-3">
            <Link
              to="/data-entry"
              className="bg-green-700 hover:bg-green-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              + Add Charging Session
            </Link>
            <Link
              to="/analytics"
              className="bg-white hover:bg-green-50 border border-green-300 text-green-800 font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              View Analytics
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: string;
  icon: string;
}

function SummaryCard({ label, value, icon }: SummaryCardProps) {
  return (
    <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xl font-bold text-green-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

