import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { analyticsApi, AnalyticsResult } from '../utils/api';

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
  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      let params: { startDate?: string; endDate?: string } = {};
      if (period === 'custom') {
        params = { startDate: customStart || undefined, endDate: customEnd || undefined };
      } else {
        params = getDateRange(period);
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
  }, [period]);

  const periodButtons: { key: Period; label: string }[] = [
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'all', label: 'All Time' },
    { key: 'custom', label: 'Custom Range' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-6">Analytics</h1>

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
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.efficiency_data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0fdf4" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="battery_efficiency" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} name="kWh/mile" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Chart 2: Cost per session */}
          {data.cost_per_session.length > 0 && (
            <ChartCard title="Cost per Charging Session">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.cost_per_session}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0fdf4" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`£${(v / 100).toFixed(2)}`, 'Cost']} />
                  <Legend />
                  <Bar dataKey="cost_pence" fill="#22c55e" name="Cost (pence)" />
                  <Bar dataKey="energy_kwh" fill="#86efac" name="kWh" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Chart 3: Temperature vs range efficiency */}
          {data.temp_vs_range.length > 0 && (
            <ChartCard title="Temperature vs Range per 1% Battery">
              <ResponsiveContainer width="100%" height={250}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0fdf4" />
                  <XAxis dataKey="temp_celsius" name="Temp (°C)" tick={{ fontSize: 11 }} label={{ value: '°C', position: 'insideRight', fontSize: 11 }} />
                  <YAxis dataKey="range_per_pct" name="Range/%" tick={{ fontSize: 11 }} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter data={data.temp_vs_range} fill="#16a34a" name="Range per %" />
                </ScatterChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Chart 4: Miles per % */}
          {data.miles_per_pct.length > 0 && (
            <ChartCard title="Miles per 1% Battery Over Time">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.miles_per_pct}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0fdf4" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="miles_per_pct" stroke="#15803d" strokeWidth={2} dot={{ r: 3 }} name="mi per %" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {data.efficiency_data.length === 0 && data.cost_per_session.length === 0 && (
            <div className="text-gray-400 text-sm text-center py-8">
              Not enough data to display charts yet. Add sessions with charger costs to see analytics.
            </div>
          )}
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
