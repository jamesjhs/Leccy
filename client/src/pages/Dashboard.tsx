import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../App';
import { sessionsApi, tariffApi, analyticsApi, ChargingSession, TariffConfig } from '../utils/api';

interface SummaryStats {
  total_cost_pence: number;
  sessions_count: number;
  miles_driven: number;
}

export default function Dashboard() {
  const { user } = useAuthContext();
  const [sessions, setSessions] = useState<ChargingSession[]>([]);
  const [tariffs, setTariffs] = useState<TariffConfig[]>([]);
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [sessRes, tariffRes, analyticsRes] = await Promise.all([
          sessionsApi.getAll(),
          tariffApi.getAll(),
          analyticsApi.get(),
        ]);
        setSessions(sessRes.data.sessions);
        setTariffs(tariffRes.data.tariffs);
        setStats({
          total_cost_pence: analyticsRes.data.total_cost_pence,
          sessions_count: analyticsRes.data.sessions_count,
          miles_driven: analyticsRes.data.miles_driven,
        });
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const latestSession = sessions[0];
  const currentTariff = tariffs[0];
  const recent5 = sessions.slice(0, 5);

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-1">
        Welcome back, <span className="font-mono">{user?.licence_plate}</span> ⚡
      </h1>
      <p className="text-green-600 mb-6 text-sm">Here's your EV cost overview.</p>

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
              label="Current Rate"
              value={currentTariff ? `${currentTariff.rate_pence_per_kwh}p/kWh` : 'N/A'}
              icon="⚡"
            />
            <SummaryCard
              label="Latest Odometer"
              value={latestSession ? `${latestSession.odometer_miles.toLocaleString()} mi` : 'N/A'}
              icon="🚗"
            />
          </div>

          {/* Quick links */}
          <div className="flex gap-3 mb-8">
            <Link
              to="/data-entry"
              className="bg-green-700 hover:bg-green-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              + Add Charging Session
            </Link>
            <Link
              to="/charger-costs"
              className="bg-white hover:bg-green-50 border border-green-300 text-green-800 font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              + Add Charger Cost
            </Link>
          </div>

          {/* Recent activity */}
          <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
            <h2 className="text-lg font-bold text-green-900 mb-4">Recent Sessions</h2>
            {recent5.length === 0 ? (
              <p className="text-gray-400 text-sm">No sessions yet. Add your first charging session!</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-green-700 border-b border-green-100">
                      <th className="pb-2 pr-4">Date</th>
                      <th className="pb-2 pr-4">Odometer</th>
                      <th className="pb-2 pr-4">Initial %</th>
                      <th className="pb-2 pr-4">Final %</th>
                      <th className="pb-2">Temp °C</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent5.map((s) => (
                      <tr key={s.id} className="border-b border-gray-50 hover:bg-green-50">
                        <td className="py-2 pr-4 text-gray-600">{s.date_unplugged}</td>
                        <td className="py-2 pr-4 font-mono">{s.odometer_miles.toLocaleString()} mi</td>
                        <td className="py-2 pr-4">{s.initial_battery_pct}%</td>
                        <td className="py-2 pr-4 text-green-700 font-semibold">{s.final_battery_pct}%</td>
                        <td className="py-2">{s.air_temp_celsius}°C</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
