import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../App';
import { tariffApi, analyticsApi, vehiclesApi, TariffConfig, Vehicle } from '../utils/api';

interface SummaryStats {
  total_cost_pence: number;
  sessions_count: number;
  miles_driven: number;
  cost_per_mile_pence: number;
}

// ── Petrol/diesel comparison constants ──────────────────────────────────────
type FuelType = 'petrol' | 'diesel';

// UK average pump prices (pence per litre), April 2026
const DEFAULT_FUEL_PRICE_PPL: Record<FuelType, number> = {
  petrol: 148,
  diesel: 155,
};

// Typical real-world fuel economy for an average UK car
const TYPICAL_MPG: Record<FuelType, number> = {
  petrol: 40,
  diesel: 50,
};

// Imperial gallon in litres
const LITRES_PER_GALLON = 4.54609;

/** Returns petrol/diesel cost in pence for a given number of miles. */
function fuelCostPence(miles: number, fuelPricePpl: number, mpg: number): number {
  if (miles <= 0 || mpg <= 0) return 0;
  const gallons = miles / mpg;
  const litres = gallons * LITRES_PER_GALLON;
  return litres * fuelPricePpl;
}

export default function Dashboard() {
  const { user } = useAuthContext();
  const [tariffs, setTariffs] = useState<TariffConfig[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Petrol/diesel comparison state
  const [fuelType, setFuelType] = useState<FuelType>('petrol');
  const [fuelPriceInput, setFuelPriceInput] = useState<string>(
    (DEFAULT_FUEL_PRICE_PPL.petrol / 100).toFixed(2),
  );

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
          cost_per_mile_pence: analyticsRes.data.cost_per_mile_pence,
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

          {/* Petrol/diesel comparison */}
          {(stats?.miles_driven ?? 0) > 0 && (
            <FuelComparison
              evCostPence={stats?.total_cost_pence ?? 0}
              milesDriver={stats?.miles_driven ?? 0}
              fuelType={fuelType}
              onFuelTypeChange={(ft) => {
                setFuelType(ft);
                setFuelPriceInput((DEFAULT_FUEL_PRICE_PPL[ft] / 100).toFixed(2));
              }}
              fuelPriceInput={fuelPriceInput}
              onFuelPriceInputChange={setFuelPriceInput}
            />
          )}

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

// ── Fuel comparison component ────────────────────────────────────────────────

interface FuelComparisonProps {
  evCostPence: number;
  milesDriver: number;
  fuelType: FuelType;
  onFuelTypeChange: (ft: FuelType) => void;
  fuelPriceInput: string;
  onFuelPriceInputChange: (v: string) => void;
}

function FuelComparison({
  evCostPence,
  milesDriver,
  fuelType,
  onFuelTypeChange,
  fuelPriceInput,
  onFuelPriceInputChange,
}: FuelComparisonProps) {
  const fuelPricePpl = Math.max(0, parseFloat(fuelPriceInput) || 0) * 100;
  const mpg = TYPICAL_MPG[fuelType];
  const fuelCost = fuelCostPence(milesDriver, fuelPricePpl, mpg);
  const saved = fuelCost - evCostPence;
  const savedPct = fuelCost > 0 ? (saved / fuelCost) * 100 : 0;
  const evPpm = milesDriver > 0 ? evCostPence / milesDriver : 0;
  const fuelPpm = milesDriver > 0 ? fuelCost / milesDriver : 0;

  const hasSaving = saved > 0;

  return (
    <div className="bg-white rounded-xl border border-green-100 shadow-sm p-5 mb-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">⛽</span>
        <h2 className="text-base font-bold text-green-900">vs Petrol / Diesel</h2>
        <span className="ml-auto text-xs text-gray-400">Based on {milesDriver.toLocaleString()} miles driven</span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end mb-5">
        {/* Fuel type toggle */}
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1.5">Fuel type</p>
          <div className="flex rounded-lg overflow-hidden border border-gray-200">
            {(['petrol', 'diesel'] as FuelType[]).map((ft) => (
              <button
                key={ft}
                type="button"
                onClick={() => onFuelTypeChange(ft)}
                className={`px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${
                  fuelType === ft
                    ? 'bg-amber-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-amber-50'
                }`}
              >
                {ft}
              </button>
            ))}
          </div>
        </div>

        {/* Price input */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Fuel price (£/litre)
          </label>
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <span className="px-3 bg-gray-50 border-r border-gray-300 text-sm text-gray-500 py-2">£</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="5"
              value={fuelPriceInput}
              onChange={(e) => onFuelPriceInputChange(e.target.value)}
              className="w-24 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
            />
            <span className="px-3 bg-gray-50 border-l border-gray-300 text-xs text-gray-400 py-2">/litre</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            UK avg {fuelType} ≈ £{(DEFAULT_FUEL_PRICE_PPL[fuelType] / 100).toFixed(2)}/litre
          </p>
        </div>

        <div className="text-xs text-gray-400 pb-5">
          Assuming typical {fuelType} car: <span className="font-semibold text-gray-600">{mpg} mpg</span>
        </div>
      </div>

      {/* Comparison grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚡</span>
            <span className="text-sm font-bold text-green-800">Your EV</span>
          </div>
          <div className="text-2xl font-extrabold text-green-900">
            £{(evCostPence / 100).toFixed(2)}
          </div>
          <div className="text-xs text-green-700 mt-0.5">
            {evPpm.toFixed(1)}p per mile
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⛽</span>
            <span className="text-sm font-bold text-amber-800 capitalize">
              Typical {fuelType} car
            </span>
          </div>
          <div className="text-2xl font-extrabold text-amber-900">
            {fuelCost > 0 ? `£${(fuelCost / 100).toFixed(2)}` : '—'}
          </div>
          <div className="text-xs text-amber-700 mt-0.5">
            {fuelPpm > 0 ? `${fuelPpm.toFixed(1)}p per mile` : 'Enter a fuel price'}
          </div>
        </div>
      </div>

      {/* Savings callout */}
      {fuelCost > 0 && (
        <div
          className={`rounded-xl px-4 py-3 flex items-center gap-3 text-sm font-semibold ${
            hasSaving
              ? 'bg-green-700 text-white'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <span className="text-xl">{hasSaving ? '🎉' : '📊'}</span>
          <span>
            {hasSaving
              ? `You've saved £${(saved / 100).toFixed(2)} (${savedPct.toFixed(0)}%) compared to a typical ${fuelType} car over these ${milesDriver.toLocaleString()} miles`
              : `Your EV cost £${(Math.abs(saved) / 100).toFixed(2)} more than a typical ${fuelType} car over these miles`}
          </span>
        </div>
      )}
    </div>
  );
}

