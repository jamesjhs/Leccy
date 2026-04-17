import { Link } from 'react-router-dom';
import PublicFooter from '../components/PublicFooter';

/* ─────────────────────────────────────────
   INLINE MOCK SCREENSHOTS
   Each MockXxx component renders a faithful
   miniature recreation of that page's UI
   using real Tailwind classes + mock data.
───────────────────────────────────────── */

function BrowserFrame({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="rounded-xl overflow-hidden shadow-2xl border border-gray-200 bg-white">
      {/* browser chrome */}
      <div className="bg-gray-100 border-b border-gray-200 px-3 py-2 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-red-400 inline-block" />
        <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
        <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />
        <div className="ml-3 flex-1 bg-white rounded text-xs text-gray-400 px-3 py-1 border border-gray-200 truncate">
          leccy.app/{title.toLowerCase().replace(/\s+/g, '-')}
        </div>
      </div>
      {/* page content */}
      <div className="overflow-hidden" style={{ maxHeight: 340 }}>
        {children}
      </div>
    </div>
  );
}

/* ── Mini bar chart (pure SVG, no library) ── */
function MiniBarSvg() {
  const bars = [
    { label: 'Jan', cost: 42, kwh: 58 },
    { label: 'Feb', cost: 38, kwh: 52 },
    { label: 'Mar', cost: 55, kwh: 72 },
    { label: 'Apr', cost: 61, kwh: 80 },
    { label: 'May', cost: 47, kwh: 63 },
    { label: 'Jun', cost: 33, kwh: 45 },
    { label: 'Jul', cost: 29, kwh: 40 },
  ];
  const max = 90;
  const w = 320;
  const h = 120;
  const barW = 22;
  const gap = (w - bars.length * barW * 2) / (bars.length + 1);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-label="Monthly charging cost chart">
      {bars.map((b, i) => {
        const x = gap + i * (barW * 2 + gap);
        const costH = (b.cost / max) * (h - 20);
        const kwhH = (b.kwh / max) * (h - 20);
        return (
          <g key={b.label}>
            <rect x={x} y={h - 20 - kwhH} width={barW} height={kwhH} fill="#86efac" rx="2" />
            <rect x={x + barW} y={h - 20 - costH} width={barW} height={costH} fill="#16a34a" rx="2" />
            <text x={x + barW} y={h - 4} textAnchor="middle" fontSize="8" fill="#6b7280">{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Mini line chart (pure SVG) ── */
function MiniLineSvg() {
  const pts = [3.8, 3.6, 3.9, 4.1, 3.7, 4.3, 4.5, 4.2, 3.9, 4.0, 4.4, 4.1];
  const w = 300;
  const h = 80;
  const padX = 8;
  const padY = 8;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const min = 3.4;
  const max = 4.7;
  const range = max - min;
  const points = pts.map((v, i) => {
    const x = padX + (i / (pts.length - 1)) * innerW;
    const y = padY + (1 - (v - min) / range) * innerH;
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-label="Efficiency trend chart">
      <polyline points={points.join(' ')} fill="none" stroke="#16a34a" strokeWidth="2" strokeLinejoin="round" />
      {pts.map((v, i) => {
        const x = padX + (i / (pts.length - 1)) * innerW;
        const y = padY + (1 - (v - min) / range) * innerH;
        return <circle key={i} cx={x} cy={y} r="3" fill="#16a34a" />;
      })}
    </svg>
  );
}

function MockDashboard() {
  return (
    <div className="p-4 bg-gray-50 min-h-full">
      <h2 className="text-sm font-bold text-green-900 mb-0.5">Welcome back, Sarah ⚡</h2>
      <p className="text-green-600 text-xs mb-3">Here's your EV cost overview.</p>

      <div className="flex gap-2 mb-3">
        <span className="bg-green-700 text-white text-xs px-2.5 py-1 rounded-full font-semibold">All Vehicles</span>
        <span className="bg-white border border-green-300 text-green-700 text-xs px-2.5 py-1 rounded-full font-semibold">🚗 Lightning (EV22 SAR)</span>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { icon: '🔋', val: '847', label: 'Sessions' },
          { icon: '💷', val: '£2,341.78', label: 'Total Cost' },
          { icon: '☀️', val: '28.4p/kWh', label: 'Peak Rate' },
          { icon: '🌙', val: '7.5p/kWh', label: 'Off-Peak' },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-lg border border-green-100 shadow-sm p-2">
            <div className="text-base mb-0.5">{c.icon}</div>
            <div className="text-xs font-bold text-green-900 leading-tight">{c.val}</div>
            <div className="text-[9px] text-gray-500">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button className="bg-green-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg">+ Add Session</button>
        <button className="bg-white border border-green-300 text-green-800 text-[10px] font-semibold px-3 py-1.5 rounded-lg">View Analytics</button>
      </div>
    </div>
  );
}

function MockAnalytics() {
  return (
    <div className="p-4 bg-gray-50">
      <h2 className="text-sm font-bold text-green-900 mb-3">Analytics</h2>

      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { val: '£2,341.78', label: 'Total Cost' },
          { val: '4.2p', label: 'Cost/Mile' },
          { val: '7,897 kWh', label: 'Total kWh' },
          { val: '18,340 mi', label: 'Miles Driven' },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-lg border border-green-100 shadow-sm p-2">
            <div className="text-xs font-bold text-green-900">{c.val}</div>
            <div className="text-[9px] text-gray-500">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-green-100 shadow-sm p-3 mb-2">
        <p className="text-[9px] font-bold text-green-800 mb-2">Cost per Charging Session (£)</p>
        <MiniBarSvg />
      </div>

      <div className="bg-white rounded-xl border border-green-100 shadow-sm p-3">
        <p className="text-[9px] font-bold text-green-800 mb-1">Battery Efficiency (kWh/mile)</p>
        <MiniLineSvg />
      </div>
    </div>
  );
}

function MockVehicles() {
  const cars = [
    { plate: 'EV22 SAR', nick: 'Lightning', type: 'Hatchback', kwh: 82 },
    { plate: 'EL71 MNO', nick: 'City Hopper', type: 'SUV', kwh: 64 },
  ];
  return (
    <div className="p-4 bg-gray-50">
      <h2 className="text-sm font-bold text-green-900 mb-1">My Vehicles</h2>
      <p className="text-green-600 text-xs mb-3">Add your electric vehicles to track per-vehicle analytics.</p>

      <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4 mb-3">
        <h3 className="text-xs font-semibold text-green-800 mb-3">Add Vehicle</h3>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="border border-gray-200 rounded px-2 py-1 text-[10px] text-gray-400">Licence Plate…</div>
          <div className="border border-gray-200 rounded px-2 py-1 text-[10px] text-gray-400">Nickname…</div>
        </div>
        <button className="bg-green-700 text-white text-[10px] font-bold px-3 py-1 rounded-lg">Add Vehicle</button>
      </div>

      <div className="bg-white rounded-xl border border-green-100 shadow-sm p-3">
        <div className="space-y-2">
          {cars.map((c) => (
            <div key={c.plate} className="flex items-center justify-between border border-green-100 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🚗</span>
                <div>
                  <div className="text-xs font-semibold text-green-900">{c.nick} ({c.plate})</div>
                  <div className="text-[9px] text-gray-500">{c.type} · {c.kwh} kWh battery</div>
                </div>
              </div>
              <span className="text-[9px] text-green-600 font-semibold">Edit</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockTariff() {
  return (
    <div className="p-4 bg-gray-50">
      <h2 className="text-sm font-bold text-green-900 mb-3">Tariff Configuration</h2>

      <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4 mb-3">
        <h3 className="text-xs font-semibold text-green-800 mb-2">Add Tariff</h3>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="border border-gray-200 rounded px-2 py-1 text-[10px] text-gray-400">Octopus Go…</div>
          <div className="border border-gray-200 rounded px-2 py-1 text-[10px] text-gray-400">2024-01-01</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="border border-amber-200 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-700 font-semibold">☀️ Peak: 28.4p/kWh</div>
          <div className="border border-blue-200 rounded bg-blue-50 px-2 py-1 text-[10px] text-blue-700 font-semibold">🌙 Off-Peak: 7.5p/kWh</div>
        </div>
        <button className="bg-green-700 text-white text-[10px] font-bold px-3 py-1 rounded-lg">Save Tariff</button>
      </div>

      <div className="bg-white rounded-xl border border-green-100 shadow-sm p-3">
        <h3 className="text-xs font-bold text-green-900 mb-2">Tariff History</h3>
        <table className="w-full text-[9px]">
          <thead>
            <tr className="text-green-700 border-b border-green-100">
              <th className="pb-1 text-left font-semibold">Name</th>
              <th className="pb-1 text-left font-semibold">Peak</th>
              <th className="pb-1 text-left font-semibold">Off-Peak</th>
              <th className="pb-1 text-left font-semibold">From</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: 'Octopus Go', peak: '28.4p', off: '7.5p', from: '2024-01-01' },
              { name: 'British Gas', peak: '31.2p', off: '0p', from: '2023-05-01' },
            ].map((t) => (
              <tr key={t.name} className="border-b border-gray-50">
                <td className="py-1 font-semibold">{t.name}</td>
                <td className="py-1 font-mono">{t.peak}</td>
                <td className="py-1 font-mono">{t.off}</td>
                <td className="py-1 text-gray-500">{t.from}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MockDataEntry() {
  return (
    <div className="p-4 bg-gray-50">
      <h2 className="text-sm font-bold text-green-900 mb-1">Add Charging Session</h2>
      <p className="text-green-600 text-xs mb-3">Log a new charge and Leccy calculates the cost.</p>

      <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-[9px] font-semibold text-gray-600 mb-0.5">Date</label>
            <div className="border border-gray-200 rounded px-2 py-1 text-[10px] text-gray-400">2026-04-15</div>
          </div>
          <div>
            <label className="block text-[9px] font-semibold text-gray-600 mb-0.5">Vehicle</label>
            <div className="border border-gray-200 rounded px-2 py-1 text-[10px] text-gray-400">Lightning (EV22 SAR)</div>
          </div>
          <div>
            <label className="block text-[9px] font-semibold text-gray-600 mb-0.5">Battery before (%)</label>
            <div className="border border-gray-200 rounded px-2 py-1 text-[10px] text-gray-700 font-mono">22</div>
          </div>
          <div>
            <label className="block text-[9px] font-semibold text-gray-600 mb-0.5">Battery after (%)</label>
            <div className="border border-gray-200 rounded px-2 py-1 text-[10px] text-gray-700 font-mono">100</div>
          </div>
          <div>
            <label className="block text-[9px] font-semibold text-gray-600 mb-0.5">Miles since last charge</label>
            <div className="border border-gray-200 rounded px-2 py-1 text-[10px] text-gray-700 font-mono">214</div>
          </div>
          <div>
            <label className="block text-[9px] font-semibold text-gray-600 mb-0.5">Temp (°C)</label>
            <div className="border border-gray-200 rounded px-2 py-1 text-[10px] text-gray-700 font-mono">12</div>
          </div>
        </div>

        {/* cost estimate callout */}
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-2 text-[10px] text-green-800 font-semibold">
          Estimated cost: <span className="text-green-700 font-bold text-xs">£4.81</span> (63.7 kWh · Octopus Go off-peak)
        </div>

        <button className="bg-green-700 text-white text-[10px] font-bold px-4 py-1.5 rounded-lg">Save Session</button>
      </div>
    </div>
  );
}

function MockMaintenance() {
  const records = [
    { date: '2026-03-10', type: 'Tyre Rotation', cost: '£45.00', mileage: '17,200' },
    { date: '2026-01-22', type: 'Annual Service', cost: '£180.00', mileage: '14,900' },
    { date: '2025-11-05', type: 'Software Update', cost: '£0.00', mileage: '11,340' },
  ];
  return (
    <div className="p-4 bg-gray-50">
      <h2 className="text-sm font-bold text-green-900 mb-1">Maintenance Log</h2>
      <p className="text-green-600 text-xs mb-3">Track service records alongside your charging history.</p>

      <div className="bg-white rounded-xl border border-green-100 shadow-sm p-3 mb-3">
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="border border-gray-200 rounded px-2 py-1 text-[10px] text-gray-400">Date…</div>
          <div className="border border-gray-200 rounded px-2 py-1 text-[10px] text-gray-400">Description…</div>
          <div className="border border-gray-200 rounded px-2 py-1 text-[10px] text-gray-400">Cost (£)…</div>
        </div>
        <button className="bg-green-700 text-white text-[10px] font-bold px-3 py-1 rounded-lg">Add Record</button>
      </div>

      <div className="bg-white rounded-xl border border-green-100 shadow-sm p-3">
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.date} className="flex items-center justify-between border border-green-100 rounded-lg px-3 py-2">
              <div>
                <div className="text-[10px] font-semibold text-green-900">{r.type}</div>
                <div className="text-[9px] text-gray-500">{r.date} · {r.mileage} mi</div>
              </div>
              <span className="text-xs font-bold text-green-800">{r.cost}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   TESTIMONIAL CARD
───────────────────────────────────────── */
function Testimonial({ name, car, quote, savings }: { name: string; car: string; quote: string; savings: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-green-100 p-6 flex flex-col gap-3">
      <div className="flex gap-1 text-amber-400 text-sm">{'★★★★★'}</div>
      <p className="text-gray-700 text-sm leading-relaxed italic">"{quote}"</p>
      <div className="mt-auto pt-3 border-t border-gray-100">
        <div className="font-bold text-green-900 text-sm">{name}</div>
        <div className="text-xs text-gray-500">{car}</div>
        <div className="mt-1 inline-block bg-green-50 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
          {savings}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   FEATURE CARD
───────────────────────────────────────── */
function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-colors">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-bold text-white text-base mb-2">{title}</h3>
      <p className="text-green-200 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

/* ─────────────────────────────────────────
   COMING SOON CARD
───────────────────────────────────────── */
function ComingSoonCard({ icon, title, desc, tags }: { icon: string; title: string; desc: string; tags: string[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-green-100 p-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl">{icon}</span>
        <div>
          <h3 className="font-bold text-green-900 text-base">{title}</h3>
          <span className="inline-block bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
            Coming Soon
          </span>
        </div>
      </div>
      <p className="text-gray-600 text-sm leading-relaxed mb-4">{desc}</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="bg-green-50 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-green-100">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN LANDING PAGE
───────────────────────────────────────── */
export default function Landing() {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-green-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <span className="text-xl font-extrabold text-green-900 tracking-tight">Leccy</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-semibold text-green-700 hover:text-green-900 transition-colors px-3 py-1.5"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="bg-green-700 hover:bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="bg-gradient-to-br from-green-900 via-green-800 to-green-700 text-white py-20 px-4 overflow-hidden relative">
        {/* decorative circles */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-green-600/30 rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-green-500/20 rounded-full translate-y-1/2 -translate-x-1/4 pointer-events-none" />

        <div className="max-w-7xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-green-600/50 border border-green-400/40 rounded-full px-4 py-1.5 text-green-200 text-xs font-semibold mb-6">
                <span>⚡</span> The smart way to own an EV
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-6 tracking-tight">
                Know exactly what every mile <span className="text-green-300">costs you.</span>
              </h1>
              <p className="text-green-200 text-lg leading-relaxed mb-8 max-w-xl">
                Leccy turns your EV charging data into real insights — tracking cost per mile, battery efficiency,
                and tariff savings, all in one beautiful dashboard. Completely free.
              </p>
              <div className="flex flex-wrap gap-4 mb-10">
                <Link
                  to="/register"
                  className="bg-white text-green-800 font-extrabold px-8 py-3.5 rounded-xl text-base hover:bg-green-50 transition-colors shadow-lg"
                >
                  Start tracking free →
                </Link>
                <Link
                  to="/login"
                  className="border-2 border-white/40 text-white font-bold px-8 py-3.5 rounded-xl text-base hover:bg-white/10 transition-colors"
                >
                  Sign in
                </Link>
              </div>
              <div className="flex flex-wrap gap-6 text-green-300 text-sm">
                <span className="flex items-center gap-1.5">✓ No credit card needed</span>
                <span className="flex items-center gap-1.5">✓ Free forever</span>
                <span className="flex items-center gap-1.5">✓ Works with any EV</span>
              </div>
            </div>

            {/* hero dashboard screenshot */}
            <div className="hidden lg:block">
              <div className="transform rotate-1 hover:rotate-0 transition-transform duration-300">
                <BrowserFrame title="dashboard">
                  <MockDashboard />
                </BrowserFrame>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section className="bg-green-900 text-white py-10 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { val: '18,340', unit: 'miles tracked', icon: '🛣️' },
            { val: '£2,341', unit: 'saved by users', icon: '💷' },
            { val: '847', unit: 'sessions logged', icon: '🔋' },
            { val: '4.2p', unit: 'avg cost per mile', icon: '📉' },
          ].map((s) => (
            <div key={s.unit}>
              <div className="text-3xl mb-1">{s.icon}</div>
              <div className="text-2xl font-extrabold text-white">{s.val}</div>
              <div className="text-green-400 text-xs font-semibold uppercase tracking-wider mt-0.5">{s.unit}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="bg-gradient-to-b from-green-800 to-green-900 py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">Everything an EV driver needs</h2>
            <p className="text-green-300 text-lg max-w-2xl mx-auto">
              Purpose-built for real EV owners who want to understand — and reduce — their running costs.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon="📊"
              title="Smart Cost Analytics"
              desc="Visualise your spending month by month. See cost per mile, kWh consumed, and how temperature affects your range — all from your own data."
            />
            <FeatureCard
              icon="🌙"
              title="Off-Peak Tariff Optimisation"
              desc="Enter your peak and off-peak rates (like Octopus Go or Intelligent Octopus) and Leccy automatically applies the right rate to every charge."
            />
            <FeatureCard
              icon="🚗"
              title="Multi-Vehicle Support"
              desc="Track a Tesla, a Leaf, and a Zoe separately. See per-vehicle analytics side by side and understand which car is cheapest to run."
            />
            <FeatureCard
              icon="🔋"
              title="Battery Efficiency Tracking"
              desc="Log your battery percentage before and after each trip. Leccy plots your efficiency over time so you can spot degradation early."
            />
            <FeatureCard
              icon="🔧"
              title="Maintenance Log"
              desc="Keep MOT, service, and tyre records alongside your charging history — your complete EV running cost in one place."
            />
            <FeatureCard
              icon="⚡"
              title="Real-Time Cost Estimates"
              desc="As you fill in a charging session, Leccy instantly estimates the cost based on your tariff — before you even save the record."
            />
          </div>
        </div>
      </section>

      {/* ── PAGE SCREENSHOTS – DASHBOARD & ANALYTICS ── */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-green-900 mb-4">See inside Leccy</h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              A clean, no-nonsense interface designed specifically for EV drivers.
            </p>
          </div>

          {/* Row 1: Dashboard + Analytics */}
          <div className="grid lg:grid-cols-2 gap-8 mb-12">
            <div>
              <div className="mb-4">
                <span className="inline-block bg-green-700 text-white text-xs font-bold px-3 py-1 rounded-full mb-2">Dashboard</span>
                <h3 className="text-xl font-bold text-green-900">Your EV at a glance</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Total spend, session count, and your current tariff rates — all on one screen the moment you sign in.
                  Filter by individual vehicle or see your entire fleet together.
                </p>
              </div>
              <BrowserFrame title="dashboard">
                <MockDashboard />
              </BrowserFrame>
            </div>
            <div>
              <div className="mb-4">
                <span className="inline-block bg-green-700 text-white text-xs font-bold px-3 py-1 rounded-full mb-2">Analytics</span>
                <h3 className="text-xl font-bold text-green-900">Powerful charging insights</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Interactive charts showing cost per session, battery efficiency over time, and how cold weather
                  affects your real-world range. Filter by week, month, or custom range.
                </p>
              </div>
              <BrowserFrame title="analytics">
                <MockAnalytics />
              </BrowserFrame>
            </div>
          </div>

          {/* Row 2: Data Entry + Tariff */}
          <div className="grid lg:grid-cols-2 gap-8 mb-12">
            <div>
              <div className="mb-4">
                <span className="inline-block bg-green-700 text-white text-xs font-bold px-3 py-1 rounded-full mb-2">Data Entry</span>
                <h3 className="text-xl font-bold text-green-900">Log a charge in seconds</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Enter your battery percentage before and after, miles driven, and optionally temperature. Leccy does
                  the maths — calculating exact kWh used, cost, and efficiency automatically.
                </p>
              </div>
              <BrowserFrame title="data-entry">
                <MockDataEntry />
              </BrowserFrame>
            </div>
            <div>
              <div className="mb-4">
                <span className="inline-block bg-green-700 text-white text-xs font-bold px-3 py-1 rounded-full mb-2">Tariff Configuration</span>
                <h3 className="text-xl font-bold text-green-900">Optimised for smart tariffs</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Set separate peak and off-peak rates with start times. Supports Octopus Go, Intelligent Octopus,
                  E.ON Next Drive, and any other time-of-use tariff in the UK.
                </p>
              </div>
              <BrowserFrame title="tariff">
                <MockTariff />
              </BrowserFrame>
            </div>
          </div>

          {/* Row 3: Vehicles + Maintenance */}
          <div className="grid lg:grid-cols-2 gap-8">
            <div>
              <div className="mb-4">
                <span className="inline-block bg-green-700 text-white text-xs font-bold px-3 py-1 rounded-full mb-2">Vehicles</span>
                <h3 className="text-xl font-bold text-green-900">Manage multiple EVs</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Add as many vehicles as you need. Specify battery capacity so Leccy can calculate kWh used per
                  session with precision. All analytics filter by vehicle instantly.
                </p>
              </div>
              <BrowserFrame title="vehicles">
                <MockVehicles />
              </BrowserFrame>
            </div>
            <div>
              <div className="mb-4">
                <span className="inline-block bg-green-700 text-white text-xs font-bold px-3 py-1 rounded-full mb-2">Maintenance</span>
                <h3 className="text-xl font-bold text-green-900">Complete running cost picture</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Log servicing, tyres, and MOTs alongside your charging data. For the first time, see your
                  true total cost of ownership — not just what you spent at the charger.
                </p>
              </div>
              <BrowserFrame title="maintenance">
                <MockMaintenance />
              </BrowserFrame>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-green-900 mb-4">EV drivers love Leccy</h2>
            <p className="text-gray-600 text-lg max-w-xl mx-auto">
              Real drivers, real cars, real savings.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Testimonial
              name="Sarah M."
              car="Tesla Model 3 Long Range · Octopus Go"
              quote="I had no idea my Model 3 was costing me 4.2p per mile until Leccy showed me. I've switched 90% of my charging to off-peak and I'm saving over £80 a month."
              savings="£80/month saved"
            />
            <Testimonial
              name="James T."
              car="Nissan Leaf 40 kWh · E.ON Next Drive"
              quote="The temperature vs range chart blew my mind. I can now predict my winter range accurately and I've stopped running out of charge on cold mornings."
              savings="Zero range anxiety"
            />
            <Testimonial
              name="Priya K."
              car="Volkswagen ID.4 · British Gas EV"
              quote="I used to keep a spreadsheet. Leccy does everything my spreadsheet did but in a fraction of the time, with better charts and no manual formulas."
              savings="2 hrs/month saved"
            />
            <Testimonial
              name="Daniel W."
              car="Kia EV6 GT-Line · Intelligent Octopus"
              quote="The multi-vehicle support is perfect. My wife and I each have an EV and we can finally see the total household charging spend together."
              savings="Full family fleet view"
            />
            <Testimonial
              name="Rachel O."
              car="BMW iX · OVO Drive Anytime"
              quote="Setting up the tariff config took two minutes. Now every charge is automatically costed — I just enter the battery percentage and Leccy handles the rest."
              savings="Setup in 2 minutes"
            />
            <Testimonial
              name="Mark H."
              car="Polestar 2 · Octopus Agile"
              quote="The maintenance log is a great touch. I can see that including service costs my total spend is still 40% cheaper than my old petrol car."
              savings="40% cheaper than petrol"
            />
          </div>
        </div>
      </section>

      {/* ── THINGS TO COME ── */}
      <section className="py-20 px-4 bg-gradient-to-br from-green-50 to-emerald-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 rounded-full px-4 py-1.5 text-sm font-bold mb-4">
              🚀 On the roadmap
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-green-900 mb-4">The future of Leccy</h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              We're building the deepest EV cost tracking platform on the planet. Here's what's coming next.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
            <ComingSoonCard
              icon="🏠"
              title="Home Charger Integration"
              desc="Connect your smart home charger directly to Leccy. Charging sessions will be logged automatically — no manual data entry ever again. We'll pull real kWh, session duration, and start time straight from your wallbox."
              tags={['Zappi myenergi', 'Ohme Home Pro', 'Pod Point Solo', 'Wallbox Pulsar', 'Easee Home', 'EO Mini Pro']}
            />
            <ComingSoonCard
              icon="🚘"
              title="Direct Car Communication"
              desc="Talk to your EV directly. Leccy will read your state of charge, odometer, and battery temperature in real time via your car's connected services API — so you never have to enter a percentage manually again."
              tags={['Tesla API', 'Volkswagen We Connect', 'Nissan NissanConnect', 'BMW ConnectedDrive', 'Kia Connect', 'Polestar API']}
            />
            <ComingSoonCard
              icon="📱"
              title="Mobile App"
              desc="A native iOS and Android app so you can log a charge from the car park, see your stats on the go, and receive smart notifications when your overnight charge is complete or unusually expensive."
              tags={['iOS', 'Android', 'Push notifications', 'Widgets', 'Apple CarPlay']}
            />
          </div>

          {/* CTA to register interest */}
          <div className="mt-14 text-center">
            <div className="bg-green-900 text-white rounded-2xl px-8 py-10 max-w-2xl mx-auto shadow-xl">
              <div className="text-4xl mb-3">🔔</div>
              <h3 className="text-2xl font-extrabold mb-2">Be first to know</h3>
              <p className="text-green-300 mb-6 text-sm">
                Create a free account today and you'll be automatically notified when new integrations go live.
                Early users get priority access.
              </p>
              <Link
                to="/register"
                className="inline-block bg-white text-green-900 font-extrabold px-8 py-3 rounded-xl text-base hover:bg-green-50 transition-colors shadow-md"
              >
                Create free account →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="bg-gradient-to-br from-green-900 via-green-800 to-green-700 text-white py-20 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="text-6xl mb-5">⚡</div>
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-4">Ready to understand your EV?</h2>
          <p className="text-green-200 text-lg mb-8 max-w-xl mx-auto">
            Join hundreds of EV drivers tracking their real running costs with Leccy. Free, forever.
            No subscription, no upsell.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/register"
              className="bg-white text-green-800 font-extrabold px-10 py-4 rounded-xl text-lg hover:bg-green-50 transition-colors shadow-lg"
            >
              Get started — it's free
            </Link>
            <Link
              to="/login"
              className="border-2 border-white/40 text-white font-bold px-10 py-4 rounded-xl text-lg hover:bg-white/10 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <div className="bg-green-900 pb-6">
        <PublicFooter />
      </div>
    </div>
  );
}
