import { useEffect, useState } from 'react';
import {
  MiniLineChart, MiniBarChart, MiniScatterChart,
  BatteryHealthChart, ThermalImpactChart, GOMAccuracyChart,
  RangeAnxietyChart, ChargingHabitsChart,
} from '../charts';
import { analyticsApi, vehiclesApi, AnalyticsResult, Vehicle } from '../utils/api';

type Period = 'week' | 'month' | 'all' | 'custom';

function getDateRange(period: Period): { startDate?: string; endDate?: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return { startDate: fmt(start), endDate: fmt(now) };
  }
  if (period === 'month') {
    const start = new Date(now);
    start.setMonth(now.getMonth() - 1);
    return { startDate: fmt(start), endDate: fmt(now) };
  }
  return {};
}

export default function Analytics() {
  const [period, setPeriod] = useState<Period>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadVehicles() {
      try {
        const res = await vehiclesApi.getAll();
        setVehicles(res.data.vehicles);
      } catch {/* ignore */}
    }
    void loadVehicles();
  }, []);

  async function load() {
    setLoading(true);
    try {
      let params: { startDate?: string; endDate?: string; vehicleId?: number } = {};
      if (period === 'custom') {
        params = { startDate: customStart || undefined, endDate: customEnd || undefined };
      } else {
        params = getDateRange(period);
      }
      if (selectedVehicleId !== null) {
        params.vehicleId = selectedVehicleId;
      }
      const res = await analyticsApi.get(params);
      setData(res.data);
    } catch {/* ignore */} finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (period !== 'custom') void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, selectedVehicleId]);

  const periodButtons: { key: Period; label: string }[] = [
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'all', label: 'All Time' },
    { key: 'custom', label: 'Custom Range' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-6">Analytics</h1>

      {/* Vehicle selector */}
      {vehicles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
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
              🚗 {v.nickname ? `${v.nickname} (${v.licence_plate})` : v.licence_plate}
            </button>
          ))}
        </div>
      )}

      {/* Period selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {periodButtons.map((b) => (
          <button
            key={b.key}
            onClick={() => setPeriod(b.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              period === b.key
                ? 'bg-green-700 text-white'
                : 'bg-white border border-green-300 text-green-700 hover:bg-green-50'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap gap-3 mb-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">From</label>
            <input type="date" className={inputClass} value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">To</label>
            <input type="date" className={inputClass} value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
          <button
            onClick={() => void load()}
            className="bg-green-700 hover:bg-green-600 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            Apply
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-green-700 animate-pulse py-8 text-center">Loading analytics…</div>
      ) : !data ? (
        <div className="text-gray-400 py-8 text-center">No data available.</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Cost" value={`£${(data.total_cost_pence / 100).toFixed(2)}`} />
            <StatCard label="Cost per Mile" value={`${data.cost_per_mile_pence.toFixed(1)}p`} />
            <StatCard label="Total kWh" value={`${data.total_kwh.toFixed(2)} kWh`} />
            <StatCard label="Miles Driven" value={`${data.miles_driven.toFixed(1)} mi`} />
          </div>

          {/* Chart 1: Battery efficiency */}
          {data.efficiency_data.length > 0 && (
            <ChartCard title="Battery Efficiency Over Time (kWh/mile)">
              <MiniLineChart
                data={data.efficiency_data as unknown as Record<string, unknown>[]}
                xKey="date"
                series={[{ key: 'battery_efficiency', color: '#16a34a', label: 'kWh/mile' }]}
                height={250}
              />
            </ChartCard>
          )}

          {/* Chart 2: Cost per session */}
          {data.cost_per_session.length > 0 && (
            <ChartCard title="Cost per Charging Session">
              <MiniBarChart
                data={data.cost_per_session as unknown as Record<string, unknown>[]}
                xKey="date"
                bars={[
                  { key: 'cost_pence', color: '#22c55e', label: 'Cost (pence)' },
                  { key: 'energy_kwh', color: '#86efac', label: 'kWh' },
                ]}
                height={250}
                yFmt={(v) => v >= 100 ? `£${(v / 100).toFixed(2)}` : `${v.toFixed(0)}p`}
              />
            </ChartCard>
          )}

          {/* Chart 3: Temperature vs range efficiency */}
          {data.temp_vs_range.length > 0 && (
            <ChartCard title="Temperature vs Range per 1% Battery">
              <MiniScatterChart
                data={data.temp_vs_range as unknown as Record<string, unknown>[]}
                xKey="temp_celsius"
                yKey="range_per_pct"
                color="#16a34a"
                label="Range per %"
                height={250}
                xLabel="°C"
                yLabel="mi/%"
              />
            </ChartCard>
          )}

          {/* Chart 4: Miles per % */}
          {data.miles_per_pct.length > 0 && (
            <ChartCard title="Miles per 1% Battery Over Time">
              <MiniLineChart
                data={data.miles_per_pct as unknown as Record<string, unknown>[]}
                xKey="date"
                series={[{ key: 'miles_per_pct', color: '#15803d', label: 'mi per %' }]}
                height={250}
              />
            </ChartCard>
          )}

          {data.efficiency_data.length === 0 && data.cost_per_session.length === 0 && (
            <div className="text-gray-400 text-sm text-center py-8">
              Not enough data to display charts yet. Add sessions with charger costs to see analytics.
            </div>
          )}

          {/* ── Advanced Analytics ─────────────────────────────── */}
          {data.enriched_sessions && data.enriched_sessions.length > 0 && (() => {
            const es = data.enriched_sessions;

            // Chart 1: Battery Health Proxy
            const batteryHealthData = es
              .filter(s => s.max_range_100_pct > 0)
              .map(s => ({ odometer: s.odometer, date: s.date, max_range_100_pct: s.max_range_100_pct }));

            // Chart 2: Thermal Impact
            const thermalData = es
              .filter(s => s.energy_kwh > 0)
              .map(s => ({
                end_charge_temperature: s.end_charge_temperature,
                energy_kwh: s.energy_kwh,
                initial_battery_percent: s.initial_battery_percent,
              }));

            // Chart 3: GOM Accuracy
            const gomData = es
              .filter(s => s.distance_driven != null && s.distance_driven > 0 && s.estimated_range_consumed != null && s.estimated_range_consumed > 0)
              .map(s => ({
                estimated_range_consumed: s.estimated_range_consumed!,
                distance_driven: s.distance_driven!,
                date: s.date,
              }));

            // Chart 4: Range Anxiety
            const anxietyData = es.map(s => s.initial_battery_percent);

            // Chart 5: Charging Habits
            const habitsData = es.map(s => ({
              date: s.date,
              energy_kwh: s.energy_kwh,
              pct_charged: s.pct_charged,
            }));

            return (
              <>
                {batteryHealthData.length >= 2 && (
                  <ChartCard title="Battery Health Proxy">
                    <BatteryHealthChart data={batteryHealthData} height={280} />
                  </ChartCard>
                )}

                {thermalData.length > 0 && (
                  <ChartCard title="Thermal Impact on Charging">
                    <ThermalImpactChart data={thermalData} height={280} />
                  </ChartCard>
                )}

                {gomData.length > 0 && (
                  <ChartCard title="GOM Accuracy: Estimated vs Real Range">
                    <GOMAccuracyChart data={gomData} height={300} />
                  </ChartCard>
                )}

                {anxietyData.length > 0 && (
                  <ChartCard title="Range Anxiety Gauge">
                    <RangeAnxietyChart data={anxietyData} height={280} />
                  </ChartCard>
                )}

                {habitsData.length > 0 && (
                  <ChartCard title="Charging Habits by Day">
                    <ChargingHabitsChart data={habitsData} height={280} />
                  </ChartCard>
                )}
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4">
      <div className="text-xl font-bold text-green-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5 mb-6">
      <h3 className="text-sm font-bold text-green-800 mb-4">{title}</h3>
      {children}
    </div>
  );
}

const inputClass =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';
