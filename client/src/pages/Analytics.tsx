import { useEffect, useState } from 'react';
import {
  MiniLineChart, MiniBarChart, MiniScatterChart,
  BatteryHealthChart, ThermalImpactChart, GOMAccuracyChart,
  RangeAnxietyChart, ChargingHabitsChart,
} from '../charts';
import TariffSetupPrompt from '../components/TariffSetupPrompt';
import VehicleSetupPrompt from '../components/VehicleSetupPrompt';
import { analyticsApi, tariffApi, vehiclesApi, AnalyticsResult, TariffConfig, Vehicle } from '../utils/api';

type Period = 'week' | 'month' | 'all' | 'custom';
type ChargeTypeFilter = 'all' | 'home' | 'public';

interface GOMChartPoint {
  estimated_range_consumed: number;
  distance_driven: number;
  date: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function excludeStdDevOutliers<T>(
  data: T[],
  getValue: (item: T) => number,
  maxStdDev = 2,
): T[] {
  if (data.length < 3) return data;

  const values = data.map(getValue).filter((value) => Number.isFinite(value));
  if (values.length < 3) return data;

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return data;

  return data.filter((item) => Math.abs(getValue(item) - mean) <= maxStdDev * stdDev);
}

function excludeGOMOutliers(
  data: GOMChartPoint[],
  maxStdDev = 2,
): { filtered: GOMChartPoint[]; removed: number } {
  if (data.length < 5) return { filtered: data, removed: 0 };

  const withLogRatio = data
    .map((point) => ({
      point,
      value: Math.log(point.distance_driven / point.estimated_range_consumed),
    }))
    .filter(({ value }) => Number.isFinite(value));
  if (withLogRatio.length < 5) return { filtered: data, removed: 0 };

  const values = withLogRatio.map(({ value }) => value);
  const center = median(values);
  const deviations = values.map((value) => Math.abs(value - center));
  const mad = median(deviations);
  if (mad === 0) return { filtered: data, removed: 0 };

  // Iglewicz-Hoaglin modified z-score, scaled by the user's noise-reduction setting
  // (the conventional 3.5 threshold corresponds to a 2 std-dev noise-reduction level).
  const modifiedZThreshold = maxStdDev * 1.75;
  const kept = new Set(
    withLogRatio
      .filter(({ value }) => Math.abs((0.6745 * (value - center)) / mad) <= modifiedZThreshold)
      .map(({ point }) => point),
  );
  const filtered = data.filter((point) => kept.has(point));
  return { filtered, removed: data.length - filtered.length };
}

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

function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function periodLabel(period: Period, customStart: string, customEnd: string): string {
  if (period === 'week') return 'the selected week';
  if (period === 'month') return 'the selected month';
  if (period === 'all') return 'all time';
  if (customStart && customEnd) return `${customStart} to ${customEnd}`;
  if (customStart) return `from ${customStart}`;
  if (customEnd) return `up to ${customEnd}`;
  return 'the selected custom period';
}

export default function Analytics() {
  const [period, setPeriod] = useState<Period>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [tariffs, setTariffs] = useState<TariffConfig[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [chargeTypeFilter, setChargeTypeFilter] = useState<ChargeTypeFilter>('all');
  const [noiseReductionStdDev, setNoiseReductionStdDev] = useState(2);

  useEffect(() => {
    async function loadSetupData() {
      try {
        const [vehicleRes, tariffRes] = await Promise.all([
          vehiclesApi.getAll(),
          tariffApi.getAll(),
        ]);
        setVehicles(vehicleRes.data.vehicles);
        setTariffs(tariffRes.data.tariffs);
      } catch {/* ignore */}
    }
    void loadSetupData();
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

  const filteredEfficiencyData = data
    ? excludeStdDevOutliers(data.efficiency_data, (point) => point.battery_efficiency, noiseReductionStdDev)
    : [];
  const chargeTypeButtons: { key: ChargeTypeFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'home', label: 'Home' },
    { key: 'public', label: 'Away' },
  ];
  const filteredCostPerSession = data
    ? data.cost_per_session.filter((point) =>
        chargeTypeFilter === 'all' ? true : point.charger_type === chargeTypeFilter,
      )
    : [];
  const costChartData = excludeStdDevOutliers(
    filteredCostPerSession.filter((point) => point.cost_pence > 0),
    (point) => point.cost_pence,
    noiseReductionStdDev,
  );
  const kwhChartData = excludeStdDevOutliers(
    filteredCostPerSession.filter((point) => point.energy_kwh > 0),
    (point) => point.energy_kwh,
    noiseReductionStdDev,
  );
  const filteredTempVsRange = data
    ? excludeStdDevOutliers(data.temp_vs_range, (point) => point.predicted_100_pct_range, noiseReductionStdDev)
    : [];
  const filteredMilesPerPct = data
    ? excludeStdDevOutliers(data.miles_per_pct, (point) => point.miles_per_pct, noiseReductionStdDev)
    : [];
  const insights = data?.derived_insights;
  const filteredOdometerEfficiency = insights
    ? excludeStdDevOutliers(insights.odometer_efficiency, (point) => point.kwh_per_mile, noiseReductionStdDev)
    : [];
  const filteredBatteryCapacity = insights
    ? excludeStdDevOutliers(insights.battery_capacity, (point) => point.estimated_usable_capacity_kwh, noiseReductionStdDev)
    : [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-6">Analytics</h1>

      {/* Noise reduction slider */}
      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-4 mb-6">
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="noise-reduction" className="text-sm font-semibold text-green-800">
            Noise Reduction
          </label>
          <span className="text-sm font-bold text-green-700">{noiseReductionStdDev.toFixed(1)}σ</span>
        </div>
        <input
          id="noise-reduction"
          type="range"
          min={0.5}
          max={4}
          step={0.1}
          value={noiseReductionStdDev}
          onChange={(e) => setNoiseReductionStdDev(Number(e.target.value))}
          className="w-full accent-green-700"
        />
        <p className="text-xs text-gray-400 mt-1">
          Rejects data points that fall outside {noiseReductionStdDev.toFixed(1)} standard deviations from the mean on every chart below. Lower values filter more aggressively.
        </p>
      </div>

      {tariffs.length === 0 && <TariffSetupPrompt />}
      {vehicles.length === 0 && <VehicleSetupPrompt />}

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

          {insights && (
            <>
              <section className="mb-8">
                <h2 className="text-lg font-bold text-green-900 mb-3">Ownership Intelligence</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <InsightCard label="Charging Style" value={insights.charging_behavior.profile} />
                  <InsightCard label="Battery Stress" value={`${insights.battery_stress.level} (${insights.battery_stress.score}/100)`} />
                  <InsightCard label="GOM Trust" value={`${insights.gom_trust.label}${insights.gom_trust.sample_count > 0 ? ` (${insights.gom_trust.ratio_pct}%)` : ''}`} />
                  <InsightCard label="Running Cost" value={`${insights.ownership_cost.running_cost_per_mile_pence.toFixed(1)}p/mi`} />
                  <InsightCard label="Median Plug-in SOC" value={`${insights.charging_behavior.median_plugin_soc.toFixed(1)}%`} />
                  <InsightCard label="Median SOC Gain" value={`${insights.charging_behavior.median_soc_gain.toFixed(1)}%`} />
                  <InsightCard label="Measured kWh" value={`${insights.data_quality.measured_kwh_pct}%`} />
                  <InsightCard label="Total Ownership Cost" value={pounds(insights.ownership_cost.total_running_cost_pence)} />
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-lg font-bold text-green-900 mb-3">Home vs Away Economics</h2>
                <p className="text-sm text-gray-500 mb-3">
                  Costs and averages below are calculated for {periodLabel(period, customStart, customEnd)} using sessions in the current vehicle filter.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <InsightCard label="Home Sessions" value={`${insights.home_away.home_sessions}`} />
                  <InsightCard label="Away Sessions" value={`${insights.home_away.away_sessions}`} />
                  <InsightCard label="Home Total Cost" value={pounds(insights.home_away.home_cost_pence)} />
                  <InsightCard label="Away Total Cost" value={pounds(insights.home_away.away_cost_pence)} />
                  <InsightCard label="Home Avg/Charge" value={pounds(insights.home_away.home_avg_cost_per_charge_pence)} />
                  <InsightCard label="Away Avg/Charge" value={pounds(insights.home_away.away_avg_cost_per_charge_pence)} />
                  <InsightCard label="Home Avg/kWh" value={`${insights.home_away.home_avg_pence_per_kwh.toFixed(1)}p/kWh`} />
                  <InsightCard label="Away Avg/kWh" value={`${insights.home_away.away_avg_pence_per_kwh.toFixed(1)}p/kWh`} />
                </div>
                {(insights.home_away.home_costed_sessions < insights.home_away.home_sessions ||
                  insights.home_away.away_costed_sessions < insights.home_away.away_sessions) && (
                  <p className="text-xs text-gray-400 mb-2">
                    Average cost per charge uses costed sessions only: {insights.home_away.home_costed_sessions} home and {insights.home_away.away_costed_sessions} away.
                  </p>
                )}
                {insights.home_away.away_cost_premium_pence > 0 && (
                  <p className="text-sm text-gray-500">
                    Away charging is averaging {insights.home_away.away_cost_premium_pence.toFixed(1)}p/kWh more than home charging in this period.
                  </p>
                )}
              </section>

              {filteredOdometerEfficiency.length > 0 && (
                <ChartCard title="Odometer-Based Efficiency (kWh/mile)">
                  <MiniLineChart
                    data={filteredOdometerEfficiency as unknown as Record<string, unknown>[]}
                    xKey="date"
                    series={[{ key: 'kwh_per_mile', color: '#0d9488', label: 'kWh/mile' }]}
                    height={250}
                    yFmt={(v) => v.toFixed(2)}
                  />
                </ChartCard>
              )}

              {insights.temperature_efficiency.length > 0 && (
                <ChartCard title="Temperature-Normalised Efficiency">
                  <MiniBarChart
                    data={insights.temperature_efficiency as unknown as Record<string, unknown>[]}
                    xKey="band"
                    bars={[{ key: 'avg_kwh_per_mile', color: '#14b8a6', label: 'Avg kWh/mile' }]}
                    height={250}
                    yFmt={(v) => v.toFixed(2)}
                  />
                </ChartCard>
              )}

              {filteredBatteryCapacity.length > 0 && (
                <ChartCard title="Measured-kWh Usable Capacity Proxy">
                  <MiniLineChart
                    data={filteredBatteryCapacity as unknown as Record<string, unknown>[]}
                    xKey="date"
                    series={[
                      { key: 'estimated_usable_capacity_kwh', color: '#7c3aed', label: 'Usable kWh' },
                      { key: 'nominal_battery_kwh', color: '#c4b5fd', label: 'Nominal kWh' },
                    ]}
                    height={250}
                    yFmt={(v) => `${v.toFixed(1)} kWh`}
                  />
                  <p className="text-xs text-gray-400 mt-3">
                    Uses only sessions with measured charger kWh and SOC gain of at least 20%. AC charging losses can make this higher than true battery-stored energy, so trends matter more than single points.
                  </p>
                </ChartCard>
              )}

              <section className="mb-8">
                <h2 className="text-lg font-bold text-green-900 mb-3">Data Quality</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <InsightCard label="Sessions" value={`${insights.data_quality.total_sessions}`} />
                  <InsightCard label="Measured kWh" value={`${insights.data_quality.measured_kwh_sessions}`} />
                  <InsightCard label="Estimated kWh" value={`${insights.data_quality.estimated_kwh_sessions}`} />
                  <InsightCard label="No kWh" value={`${insights.data_quality.no_kwh_sessions}`} />
                  <InsightCard label="Costed" value={`${insights.data_quality.costed_sessions}`} />
                </div>
              </section>
            </>
          )}

          {/* Chart 1: Battery efficiency */}
          {filteredEfficiencyData.length > 0 && (
            <ChartCard title="Battery Efficiency Over Time (kWh/mile)">
              <MiniLineChart
                data={filteredEfficiencyData as unknown as Record<string, unknown>[]}
                xKey="date"
                series={[{ key: 'battery_efficiency', color: '#16a34a', label: 'kWh/mile' }]}
                height={250}
                secondarySeries={{ key: 'temp_celsius', color: '#fb923c', label: 'End-charge temp' }}
                secondaryYFmt={(v) => `${v.toFixed(0)}°C`}
              />
            </ChartCard>
          )}

          {/* Charging session cost / energy charts */}
          {data.cost_per_session.length > 0 && (
            <section className="mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="text-lg font-bold text-green-900">Charging Sessions</h2>
                <div className="flex rounded-lg overflow-hidden border border-green-300">
                  {chargeTypeButtons.map((button) => (
                    <button
                      key={button.key}
                      type="button"
                      onClick={() => setChargeTypeFilter(button.key)}
                      className={`px-4 py-1.5 text-sm font-semibold transition-colors ${
                        chargeTypeFilter === button.key
                          ? 'bg-green-700 text-white'
                          : 'bg-white text-green-700 hover:bg-green-50'
                      }`}
                    >
                      {button.label}
                    </button>
                  ))}
                </div>
              </div>

              {costChartData.length > 0 ? (
                <ChartCard title="Cost per Charging Session">
                  <MiniBarChart
                    data={costChartData as unknown as Record<string, unknown>[]}
                    xKey="date"
                    bars={[{ key: 'cost_pence', color: '#22c55e', label: 'Cost' }]}
                    height={250}
                    yFmt={(v) => v >= 100 ? `£${(v / 100).toFixed(2)}` : `${v.toFixed(0)}p`}
                  />
                </ChartCard>
              ) : (
                <EmptyChartMessage message="No cost data for this charging type." />
              )}

              {kwhChartData.length > 0 ? (
                <ChartCard title="kWh per Charging Session">
                  <MiniBarChart
                    data={kwhChartData as unknown as Record<string, unknown>[]}
                    xKey="date"
                    bars={[{ key: 'energy_kwh', color: '#86efac', label: 'kWh' }]}
                    height={250}
                    yFmt={(v) => `${v.toFixed(1)} kWh`}
                  />
                </ChartCard>
              ) : (
                <EmptyChartMessage message="No kWh data for this charging type." />
              )}
            </section>
          )}

          {/* Chart 3: Temperature vs predicted 100% range */}
          {filteredTempVsRange.length > 0 && (
            <ChartCard title="Temperature vs Predicted 100% Range">
              <MiniScatterChart
                data={filteredTempVsRange as unknown as Record<string, unknown>[]}
                xKey="temp_celsius"
                yKey="predicted_100_pct_range"
                color="#16a34a"
                label="Predicted 100% range"
                height={250}
                xLabel="°C"
                yLabel="mi"
                showTrendline
              />
            </ChartCard>
          )}

          {/* Chart 4: Miles per % */}
          {filteredMilesPerPct.length > 0 && (
            <ChartCard title="Miles per 1% Battery Over Time">
              <MiniLineChart
                data={filteredMilesPerPct as unknown as Record<string, unknown>[]}
                xKey="date"
                series={[{ key: 'miles_per_pct', color: '#15803d', label: 'mi per %' }]}
                height={250}
                secondarySeries={{ key: 'temp_celsius', color: '#fb923c', label: 'End-charge temp' }}
                secondaryYFmt={(v) => `${v.toFixed(0)}°C`}
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
            const batteryHealthData = excludeStdDevOutliers(
              es
                .filter(s => s.max_range_100_pct > 0)
                .map(s => ({
                  odometer: s.odometer,
                  date: s.date,
                  max_range_100_pct: s.max_range_100_pct,
                  end_charge_temperature: s.end_charge_temperature,
                })),
              (point) => point.max_range_100_pct,
              noiseReductionStdDev,
            );

            // Chart 2: Thermal Impact
            const thermalData = excludeStdDevOutliers(
              es
                .filter(s => s.energy_kwh > 0)
                .map(s => ({
                  end_charge_temperature: s.end_charge_temperature,
                  energy_kwh: s.energy_kwh,
                  initial_battery_percent: s.initial_battery_percent,
                })),
              (point) => point.energy_kwh,
              noiseReductionStdDev,
            );

            // Chart 3: GOM Accuracy
            const gomData = es
              .filter(s => s.distance_driven != null && s.distance_driven > 0 && s.estimated_range_consumed != null && s.estimated_range_consumed > 0)
              .map(s => ({
                estimated_range_consumed: s.estimated_range_consumed!,
                distance_driven: s.distance_driven!,
                date: s.date,
              }));
            const gomOutlierResult = excludeGOMOutliers(gomData, noiseReductionStdDev);

            // Chart 4: Range Anxiety
            const anxietyData = excludeStdDevOutliers(
              es.map(s => s.initial_battery_percent),
              (value) => value,
              noiseReductionStdDev,
            );

            // Chart 5: Charging Habits
            const habitsData = excludeStdDevOutliers(
              es.map(s => ({
                date: s.date,
                energy_kwh: s.energy_kwh,
                pct_charged: s.pct_charged,
              })),
              (point) => point.energy_kwh,
              noiseReductionStdDev,
            );

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

                {gomOutlierResult.filtered.length > 0 && (
                  <ChartCard title="GOM Accuracy: Estimated vs Real Range">
                    <GOMAccuracyChart data={gomOutlierResult.filtered} height={300} />
                    {gomOutlierResult.removed > 0 && (
                      <p className="text-xs text-gray-400 mt-3">
                        Excludes {gomOutlierResult.removed} outlier{gomOutlierResult.removed === 1 ? '' : 's'} using a robust modified z-score limit of 3.5 on actual-to-estimated range ratio.
                      </p>
                    )}
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

function InsightCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-base font-bold text-green-900 leading-snug">{value}</div>
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

function EmptyChartMessage({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5 mb-6 text-sm text-gray-400 text-center">
      {message}
    </div>
  );
}

const inputClass =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';
