// Minimal hand-rolled SVG charts — zero external dependencies.
// Replaces recharts to eliminate D3 / victory-vendor from the bundle.
import { useState, useRef, useEffect } from 'react';

// ─── Layout constants ─────────────────────────────────────────────────────────
const M = { top: 10, right: 16, bottom: 38, left: 52 };

// ─── Resize hook ──────────────────────────────────────────────────────────────
function useWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || 600);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

// ─── Y axis nice ticks ────────────────────────────────────────────────────────
function yTicks(max: number, n = 5): number[] {
  if (max <= 0) return [0];
  const raw = max / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = Math.ceil(raw / mag) * mag;
  return Array.from({ length: n + 1 }, (_, i) => +(i * step).toPrecision(6));
}

// ─── Which x-axis indices to label ───────────────────────────────────────────
function xTickIdxs(len: number, iw: number): number[] {
  const step = Math.max(1, Math.round(len / Math.floor(iw / 52)));
  const idxs: number[] = [];
  for (let i = 0; i < len; i++) {
    if (i % step === 0 || i === len - 1) idxs.push(i);
  }
  return idxs;
}

// ─── Floating tooltip box ─────────────────────────────────────────────────────
interface TipLine { label: string; value: string; color: string }
function TipBox({ x, y, iw, ih, lines }: {
  x: number; y: number; iw: number; ih: number; lines: TipLine[];
}) {
  const W = 136;
  const H = 14 + lines.length * 15;
  const tx = x + W + 10 > iw ? x - W - 6 : x + 8;
  const ty = Math.max(0, Math.min(y, ih - H));
  return (
    <g transform={`translate(${tx},${ty})`} style={{ pointerEvents: 'none' }}>
      <rect width={W} height={H} rx={4} fill="white" stroke="#d1d5db" strokeWidth={0.8} />
      {lines.map((l, i) => (
        <text key={i} x={6} y={12 + i * 15} fontSize={10} fill={l.color || '#374151'}>
          {l.label && <tspan fontWeight={i === 0 ? '600' : '400'}>{l.label}: </tspan>}
          {l.value}
        </text>
      ))}
    </g>
  );
}

// ─── MiniLineChart ────────────────────────────────────────────────────────────
export interface LineSeries { key: string; color: string; label: string }
export interface MiniLineChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  series: LineSeries[];
  height?: number;
  yFmt?: (v: number) => string;
}

export function MiniLineChart({ data, xKey, series, height = 250, yFmt = String }: MiniLineChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const w = useWidth(ref);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const iw = w - M.left - M.right;
  const ih = height - M.top - M.bottom;

  if (!data.length) return null;

  const allY = series.flatMap(s => data.map(d => Number(d[s.key]) || 0));
  const ticks = yTicks(Math.max(...allY, 0));
  const yTop = ticks[ticks.length - 1] || 1;
  const toY = (v: number) => ih - (v / yTop) * ih;
  const toX = (i: number) => data.length > 1 ? (i / (data.length - 1)) * iw : iw / 2;

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left - M.left;
    if (mx < 0 || mx > iw) { setHoverIdx(null); return; }
    setHoverIdx(Math.max(0, Math.min(Math.round((mx / iw) * (data.length - 1)), data.length - 1)));
  }

  const tickIdxs = xTickIdxs(data.length, iw);

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={w} height={height} onMouseMove={onMouseMove} onMouseLeave={() => setHoverIdx(null)}>
        <g transform={`translate(${M.left},${M.top})`}>
          {ticks.map((v, i) => <line key={i} x1={0} y1={toY(v)} x2={iw} y2={toY(v)} stroke="#f0fdf4" />)}
          {ticks.map((v, i) => (
            <text key={i} x={-5} y={toY(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#9ca3af">
              {yFmt(v)}
            </text>
          ))}
          {tickIdxs.map(i => (
            <text key={i} x={toX(i)} y={ih + 15} textAnchor="middle" fontSize={10} fill="#9ca3af">
              {String(data[i][xKey]).slice(-5)}
            </text>
          ))}
          <line x1={0} y1={0} x2={0} y2={ih} stroke="#e5e7eb" />
          <line x1={0} y1={ih} x2={iw} y2={ih} stroke="#e5e7eb" />
          {series.map(s => (
            <g key={s.key}>
              <polyline
                points={data.map((d, i) => `${toX(i)},${toY(Number(d[s.key]) || 0)}`).join(' ')}
                fill="none" stroke={s.color} strokeWidth={2}
              />
              {data.map((d, i) => (
                <circle key={i} cx={toX(i)} cy={toY(Number(d[s.key]) || 0)} r={3} fill={s.color} />
              ))}
            </g>
          ))}
          {hoverIdx !== null && (
            <>
              <line x1={toX(hoverIdx)} y1={0} x2={toX(hoverIdx)} y2={ih} stroke="#9ca3af" strokeWidth={1} strokeDasharray="3 2" />
              <TipBox x={toX(hoverIdx)} y={20} iw={iw} ih={ih} lines={[
                { label: String(data[hoverIdx][xKey]), value: '', color: '#374151' },
                ...series.map(s => ({ label: s.label, value: yFmt(Number(data[hoverIdx][s.key]) || 0), color: s.color })),
              ]} />
            </>
          )}
        </g>
        <g transform={`translate(${M.left},${height - 12})`}>
          {series.map((s, i) => (
            <g key={s.key} transform={`translate(${i * 120},0)`}>
              <line x1={0} y1={0} x2={14} y2={0} stroke={s.color} strokeWidth={2} />
              <text x={18} y={4} fontSize={10} fill="#6b7280">{s.label}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

// ─── MiniBarChart ─────────────────────────────────────────────────────────────
export interface BarSeries { key: string; color: string; label: string }
export interface MiniBarChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  bars: BarSeries[];
  height?: number;
  yFmt?: (v: number) => string;
}

export function MiniBarChart({ data, xKey, bars, height = 250, yFmt = String }: MiniBarChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const w = useWidth(ref);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const iw = w - M.left - M.right;
  const ih = height - M.top - M.bottom;

  if (!data.length) return null;

  const allY = bars.flatMap(b => data.map(d => Number(d[b.key]) || 0));
  const ticks = yTicks(Math.max(...allY, 0));
  const yTop = ticks[ticks.length - 1] || 1;
  const toY = (v: number) => ih - (v / yTop) * ih;

  const groupW = iw / data.length;
  const pad = groupW * 0.1;
  const barW = Math.max(2, (groupW - pad * 2) / bars.length);
  const tickIdxs = xTickIdxs(data.length, iw);

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const mx = e.clientX - e.currentTarget.getBoundingClientRect().left - M.left;
    if (mx < 0 || mx > iw) { setHoverIdx(null); return; }
    setHoverIdx(Math.max(0, Math.min(Math.floor((mx / iw) * data.length), data.length - 1)));
  }

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={w} height={height} onMouseMove={onMouseMove} onMouseLeave={() => setHoverIdx(null)}>
        <g transform={`translate(${M.left},${M.top})`}>
          {ticks.map((v, i) => <line key={i} x1={0} y1={toY(v)} x2={iw} y2={toY(v)} stroke="#f0fdf4" />)}
          {ticks.map((v, i) => (
            <text key={i} x={-5} y={toY(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#9ca3af">
              {yFmt(v)}
            </text>
          ))}
          {tickIdxs.map(i => (
            <text key={i} x={i * groupW + groupW / 2} y={ih + 15} textAnchor="middle" fontSize={10} fill="#9ca3af">
              {String(data[i][xKey]).slice(-5)}
            </text>
          ))}
          <line x1={0} y1={0} x2={0} y2={ih} stroke="#e5e7eb" />
          <line x1={0} y1={ih} x2={iw} y2={ih} stroke="#e5e7eb" />
          {data.map((d, gi) => (
            <g key={gi} transform={`translate(${gi * groupW + pad},0)`}>
              {bars.map((b, bi) => {
                const val = Number(d[b.key]) || 0;
                const bh = Math.max(0, ih - toY(val));
                return (
                  <rect
                    key={b.key}
                    x={bi * barW} y={toY(val)} width={barW} height={bh}
                    fill={b.color} opacity={hoverIdx === null || hoverIdx === gi ? 1 : 0.6}
                  />
                );
              })}
            </g>
          ))}
          {hoverIdx !== null && (
            <TipBox x={hoverIdx * groupW + groupW / 2} y={20} iw={iw} ih={ih} lines={[
              { label: String(data[hoverIdx][xKey]), value: '', color: '#374151' },
              ...bars.map(b => ({ label: b.label, value: yFmt(Number(data[hoverIdx][b.key]) || 0), color: b.color })),
            ]} />
          )}
        </g>
        <g transform={`translate(${M.left},${height - 12})`}>
          {bars.map((b, i) => (
            <g key={b.key} transform={`translate(${i * 120},0)`}>
              <rect x={0} y={-8} width={12} height={10} fill={b.color} />
              <text x={16} y={3} fontSize={10} fill="#6b7280">{b.label}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

// ─── MiniScatterChart ─────────────────────────────────────────────────────────
export interface MiniScatterChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  color?: string;
  label?: string;
  height?: number;
  xLabel?: string;
  yLabel?: string;
}

// Maximum pixel distance from cursor to a scatter point to trigger hover
const MAX_HOVER_DISTANCE = 40;

export function MiniScatterChart({
  data, xKey, yKey, color = '#16a34a', label = '', height = 250, xLabel = '', yLabel = '',
}: MiniScatterChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const w = useWidth(ref);
  const [hover, setHover] = useState<number | null>(null);

  const iw = w - M.left - M.right;
  const ih = height - M.top - M.bottom;

  if (!data.length) return null;

  const xs = data.map(d => Number(d[xKey]) || 0);
  const ys = data.map(d => Number(d[yKey]) || 0);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const toX = (v: number) => ((v - xMin) / xRange) * iw;
  const toY = (v: number) => ih - ((v - yMin) / yRange) * ih;

  const xT = Array.from({ length: 5 }, (_, i) => xMin + (xRange * i) / 4);
  const yT = Array.from({ length: 5 }, (_, i) => yMin + (yRange * i) / 4);

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left - M.left;
    const my = e.clientY - rect.top - M.top;
    if (mx < 0 || mx > iw || my < 0 || my > ih) { setHover(null); return; }
    let nearest = -1, minDist = MAX_HOVER_DISTANCE;
    xs.forEach((x, i) => {
      const dist = Math.hypot(toX(x) - mx, toY(ys[i]) - my);
      if (dist < minDist) { minDist = dist; nearest = i; }
    });
    setHover(nearest >= 0 ? nearest : null);
  }

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={w} height={height} onMouseMove={onMouseMove} onMouseLeave={() => setHover(null)}>
        <g transform={`translate(${M.left},${M.top})`}>
          {yT.map((v, i) => <line key={i} x1={0} y1={toY(v)} x2={iw} y2={toY(v)} stroke="#f0fdf4" />)}
          {xT.map((v, i) => <line key={i} x1={toX(v)} y1={0} x2={toX(v)} y2={ih} stroke="#f0fdf4" />)}
          {yT.map((v, i) => (
            <text key={i} x={-5} y={toY(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#9ca3af">
              {v.toFixed(1)}
            </text>
          ))}
          {xT.map((v, i) => (
            <text key={i} x={toX(v)} y={ih + 14} textAnchor="middle" fontSize={10} fill="#9ca3af">
              {v.toFixed(0)}
            </text>
          ))}
          {xLabel && (
            <text x={iw / 2} y={ih + 30} textAnchor="middle" fontSize={10} fill="#9ca3af">{xLabel}</text>
          )}
          <line x1={0} y1={0} x2={0} y2={ih} stroke="#e5e7eb" />
          <line x1={0} y1={ih} x2={iw} y2={ih} stroke="#e5e7eb" />
          {data.map((_, i) => (
            <circle
              key={i} cx={toX(xs[i])} cy={toY(ys[i])}
              r={hover === i ? 6 : 4}
              fill={color} opacity={hover !== null && hover !== i ? 0.35 : 0.8}
            />
          ))}
          {hover !== null && (
            <TipBox x={toX(xs[hover])} y={toY(ys[hover])} iw={iw} ih={ih} lines={[
              { label: xLabel || xKey, value: xs[hover].toFixed(1), color: '#374151' },
              { label: yLabel || yKey, value: ys[hover].toFixed(2), color },
            ]} />
          )}
        </g>
        {label && (
          <g transform={`translate(${M.left},${height - 12})`}>
            <circle cx={6} cy={0} r={4} fill={color} />
            <text x={14} y={4} fontSize={10} fill="#6b7280">{label}</text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ─── BatteryHealthChart ───────────────────────────────────────────────────────
export interface BatteryHealthPoint {
  odometer: number;
  date: string;
  max_range_100_pct: number;
}

export function BatteryHealthChart({
  data,
  height = 280,
}: {
  data: BatteryHealthPoint[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const w = useWidth(ref);
  const [hover, setHover] = useState<number | null>(null);

  const ML = { top: 24, right: 16, bottom: 38, left: 56 };
  const iw = w - ML.left - ML.right;
  const ih = height - ML.top - ML.bottom;

  if (!data.length) return null;

  const sorted = [...data].sort((a, b) => a.odometer - b.odometer);
  const xs = sorted.map(d => d.odometer);
  const ys = sorted.map(d => d.max_range_100_pct);

  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.max(0, Math.min(...ys) - 5);
  const yMax = Math.max(...ys) + 5;
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const toX = (v: number) => ((v - xMin) / xRange) * iw;
  const toY = (v: number) => ih - ((v - yMin) / yRange) * ih;

  // Linear trendline via least-squares
  const n = sorted.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  const trendB = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const trendA = (sumY - trendB * sumX) / n;
  const trendY1 = trendA + trendB * xMin;
  const trendY2 = trendA + trendB * xMax;

  // Y ticks
  const yStep = Math.ceil((yMax - yMin) / 5);
  const yTickVals: number[] = [];
  for (let v = Math.ceil(yMin); v <= yMax + 0.5; v += yStep || 1) yTickVals.push(v);

  // X ticks
  const xT = Array.from({ length: 5 }, (_, i) => xMin + (xRange * i) / 4);

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left - ML.left;
    const my = e.clientY - rect.top - ML.top;
    if (mx < 0 || mx > iw || my < 0 || my > ih) { setHover(null); return; }
    let nearest = -1, minDist = MAX_HOVER_DISTANCE;
    xs.forEach((x, i) => {
      const dist = Math.hypot(toX(x) - mx, toY(ys[i]) - my);
      if (dist < minDist) { minDist = dist; nearest = i; }
    });
    setHover(nearest >= 0 ? nearest : null);
  }

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={w} height={height} onMouseMove={onMouseMove} onMouseLeave={() => setHover(null)}>
        <g transform={`translate(${ML.left},${ML.top})`}>
          {yTickVals.map((v, i) => (
            <line key={i} x1={0} y1={toY(v)} x2={iw} y2={toY(v)} stroke="#f0fdf4" />
          ))}
          {yTickVals.map((v, i) => (
            <text key={i} x={-5} y={toY(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#9ca3af">
              {v.toFixed(0)}
            </text>
          ))}
          {xT.map((v, i) => (
            <text key={i} x={toX(v)} y={ih + 14} textAnchor="middle" fontSize={10} fill="#9ca3af">
              {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
            </text>
          ))}
          <text x={iw / 2} y={ih + 28} textAnchor="middle" fontSize={10} fill="#9ca3af">Odometer (mi)</text>
          <text x={-ih / 2} y={-40} textAnchor="middle" fontSize={10} fill="#9ca3af" transform="rotate(-90)">Max Range @ 100% (mi)</text>
          <line x1={0} y1={0} x2={0} y2={ih} stroke="#e5e7eb" />
          <line x1={0} y1={ih} x2={iw} y2={ih} stroke="#e5e7eb" />
          {/* Trendline */}
          {n >= 2 && (
            <line
              x1={toX(xMin)} y1={Math.max(-4, Math.min(ih + 4, toY(trendY1)))}
              x2={toX(xMax)} y2={Math.max(-4, Math.min(ih + 4, toY(trendY2)))}
              stroke="#86efac" strokeWidth={1.5} strokeDasharray="5 3" opacity={0.7}
            />
          )}
          {/* Data points */}
          {sorted.map((d, i) => (
            <circle
              key={i} cx={toX(d.odometer)} cy={toY(d.max_range_100_pct)}
              r={hover === i ? 6 : 4}
              fill="#16a34a" opacity={hover !== null && hover !== i ? 0.35 : 0.85}
            />
          ))}
          {hover !== null && (
            <TipBox x={toX(xs[hover])} y={toY(ys[hover])} iw={iw} ih={ih} lines={[
              { label: 'Odometer', value: `${xs[hover].toLocaleString()} mi`, color: '#374151' },
              { label: 'Date', value: sorted[hover].date.slice(0, 10), color: '#6b7280' },
              { label: 'Max Range', value: `${ys[hover].toFixed(1)} mi`, color: '#16a34a' },
            ]} />
          )}
        </g>
        <g transform={`translate(${ML.left},${height - 12})`}>
          <circle cx={6} cy={0} r={4} fill="#16a34a" />
          <text x={14} y={4} fontSize={10} fill="#6b7280">Max Range @ 100%</text>
          <line x1={130} y1={0} x2={144} y2={0} stroke="#86efac" strokeWidth={1.5} strokeDasharray="5 3" />
          <text x={148} y={4} fontSize={10} fill="#6b7280">Trend</text>
        </g>
      </svg>
    </div>
  );
}

// ─── ThermalImpactChart ───────────────────────────────────────────────────────
export interface ThermalImpactPoint {
  end_charge_temperature: number;
  energy_kwh: number;
  initial_battery_percent: number;
}

export function ThermalImpactChart({
  data,
  height = 280,
}: {
  data: ThermalImpactPoint[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const w = useWidth(ref);
  const [hover, setHover] = useState<number | null>(null);

  const ML = { top: 10, right: 16, bottom: 46, left: 56 };
  const iw = w - ML.left - ML.right;
  const ih = height - ML.top - ML.bottom;

  const filtered = data.filter(d => d.energy_kwh > 0);
  if (!filtered.length) return null;

  const xs = filtered.map(d => d.end_charge_temperature);
  const ys = filtered.map(d => d.energy_kwh);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.max(0, Math.min(...ys) - 1);
  const yMax = Math.max(...ys) + 1;
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const toX = (v: number) => ((v - xMin) / xRange) * iw;
  const toY = (v: number) => ih - ((v - yMin) / yRange) * ih;

  const xT = Array.from({ length: 5 }, (_, i) => xMin + (xRange * i) / 4);
  const yT = Array.from({ length: 5 }, (_, i) => yMin + (yRange * i) / 4);

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left - ML.left;
    const my = e.clientY - rect.top - ML.top;
    if (mx < 0 || mx > iw || my < 0 || my > ih) { setHover(null); return; }
    let nearest = -1, minDist = MAX_HOVER_DISTANCE;
    xs.forEach((x, i) => {
      const dist = Math.hypot(toX(x) - mx, toY(ys[i]) - my);
      if (dist < minDist) { minDist = dist; nearest = i; }
    });
    setHover(nearest >= 0 ? nearest : null);
  }

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={w} height={height} onMouseMove={onMouseMove} onMouseLeave={() => setHover(null)}>
        <g transform={`translate(${ML.left},${ML.top})`}>
          {yT.map((v, i) => <line key={i} x1={0} y1={toY(v)} x2={iw} y2={toY(v)} stroke="#f0fdf4" />)}
          {xT.map((v, i) => <line key={i} x1={toX(v)} y1={0} x2={toX(v)} y2={ih} stroke="#f0fdf4" />)}
          {yT.map((v, i) => (
            <text key={i} x={-5} y={toY(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#9ca3af">
              {v.toFixed(1)}
            </text>
          ))}
          {xT.map((v, i) => (
            <text key={i} x={toX(v)} y={ih + 14} textAnchor="middle" fontSize={10} fill="#9ca3af">
              {v.toFixed(0)}
            </text>
          ))}
          <text x={iw / 2} y={ih + 30} textAnchor="middle" fontSize={10} fill="#9ca3af">Temperature (°C)</text>
          <text x={-ih / 2} y={-40} textAnchor="middle" fontSize={10} fill="#9ca3af" transform="rotate(-90)">Energy Added (kWh)</text>
          <line x1={0} y1={0} x2={0} y2={ih} stroke="#e5e7eb" />
          <line x1={0} y1={ih} x2={iw} y2={ih} stroke="#e5e7eb" />
          {filtered.map((d, i) => {
            const opacity = 0.25 + (d.initial_battery_percent / 100) * 0.75;
            return (
              <circle
                key={i} cx={toX(d.end_charge_temperature)} cy={toY(d.energy_kwh)}
                r={hover === i ? 7 : 5}
                fill="#0d9488" opacity={opacity}
                stroke={hover === i ? '#0f766e' : 'none'} strokeWidth={1.5}
              />
            );
          })}
          {hover !== null && (
            <TipBox x={toX(xs[hover])} y={toY(ys[hover])} iw={iw} ih={ih} lines={[
              { label: 'Temp', value: `${xs[hover].toFixed(1)} °C`, color: '#374151' },
              { label: 'Energy Added', value: `${ys[hover].toFixed(2)} kWh`, color: '#0d9488' },
              { label: 'Start Battery', value: `${filtered[hover].initial_battery_percent.toFixed(0)}%`, color: '#6b7280' },
            ]} />
          )}
        </g>
        <g transform={`translate(${ML.left},${height - 12})`}>
          <circle cx={6} cy={0} r={4} fill="#0d9488" opacity={0.6} />
          <text x={14} y={4} fontSize={10} fill="#6b7280">Each dot — opacity = starting battery %</text>
        </g>
      </svg>
    </div>
  );
}

// ─── GOMAccuracyChart ─────────────────────────────────────────────────────────
export interface GOMPoint {
  estimated_range_consumed: number;
  distance_driven: number;
  date: string;
}

export function GOMAccuracyChart({
  data,
  height = 300,
}: {
  data: GOMPoint[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const w = useWidth(ref);
  const [hover, setHover] = useState<number | null>(null);

  const SUMMARY_H = 28;
  const ML = { top: SUMMARY_H + 8, right: 16, bottom: 46, left: 56 };
  const iw = w - ML.left - ML.right;
  const ih = height - ML.top - ML.bottom;

  if (!data.length) return null;

  const xs = data.map(d => d.estimated_range_consumed);
  const ys = data.map(d => d.distance_driven);
  const allMax = Math.max(...xs, ...ys, 0);
  const axisMax = allMax * 1.05 || 1;

  const toX = (v: number) => (v / axisMax) * iw;
  const toY = (v: number) => ih - (v / axisMax) * ih;

  const xT = Array.from({ length: 5 }, (_, i) => (axisMax * i) / 4);

  // GOM accuracy summary
  const sumDriven = ys.reduce((a, b) => a + b, 0);
  const sumEstimated = xs.reduce((a, b) => a + b, 0);
  const gomRatio = sumEstimated > 0 ? sumDriven / sumEstimated : null;

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left - ML.left;
    const my = e.clientY - rect.top - ML.top;
    if (mx < 0 || mx > iw || my < 0 || my > ih) { setHover(null); return; }
    let nearest = -1, minDist = MAX_HOVER_DISTANCE;
    xs.forEach((x, i) => {
      const dist = Math.hypot(toX(x) - mx, toY(ys[i]) - my);
      if (dist < minDist) { minDist = dist; nearest = i; }
    });
    setHover(nearest >= 0 ? nearest : null);
  }

  return (
    <div ref={ref} style={{ width: '100%' }}>
      {/* Summary badge */}
      {gomRatio !== null && (
        <div style={{ marginBottom: 4, fontSize: 12, color: '#374151', textAlign: 'center' }}>
          <span style={{ fontWeight: 600 }}>Avg GOM Accuracy: </span>
          <span style={{ color: gomRatio >= 0.95 && gomRatio <= 1.05 ? '#16a34a' : '#f59e0b' }}>
            {(gomRatio * 100).toFixed(1)}%
          </span>
          <span style={{ color: '#9ca3af', marginLeft: 6, fontSize: 10 }}>
            {gomRatio < 1 ? '(car over-estimated range)' : '(car under-estimated range)'}
          </span>
        </div>
      )}
      <svg width={w} height={height} onMouseMove={onMouseMove} onMouseLeave={() => setHover(null)}>
        <g transform={`translate(${ML.left},${ML.top})`}>
          {xT.map((v, i) => <line key={i} x1={toX(v)} y1={0} x2={toX(v)} y2={ih} stroke="#f0fdf4" />)}
          {xT.map((v, i) => <line key={`h${i}`} x1={0} y1={toY(v)} x2={iw} y2={toY(v)} stroke="#f0fdf4" />)}
          {xT.map((v, i) => (
            <text key={i} x={toX(v)} y={ih + 14} textAnchor="middle" fontSize={10} fill="#9ca3af">
              {v.toFixed(0)}
            </text>
          ))}
          {xT.map((v, i) => (
            <text key={`yl${i}`} x={-5} y={toY(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#9ca3af">
              {v.toFixed(0)}
            </text>
          ))}
          <text x={iw / 2} y={ih + 30} textAnchor="middle" fontSize={10} fill="#9ca3af">GOM Estimated Range Used (mi)</text>
          <text x={-ih / 2} y={-40} textAnchor="middle" fontSize={10} fill="#9ca3af" transform="rotate(-90)">Actual Miles Driven</text>
          <line x1={0} y1={0} x2={0} y2={ih} stroke="#e5e7eb" />
          <line x1={0} y1={ih} x2={iw} y2={ih} stroke="#e5e7eb" />
          {/* Diagonal reference line */}
          <line x1={toX(0)} y1={toY(0)} x2={toX(axisMax)} y2={toY(axisMax)}
            stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.7} />
          <text x={toX(axisMax) - 4} y={toY(axisMax) + 12} textAnchor="end" fontSize={9} fill="#94a3b8">Perfect</text>
          {/* Data points */}
          {data.map((d, i) => (
            <circle
              key={i} cx={toX(d.estimated_range_consumed)} cy={toY(d.distance_driven)}
              r={hover === i ? 7 : 5}
              fill="#7c3aed" opacity={hover !== null && hover !== i ? 0.3 : 0.75}
              stroke={hover === i ? '#5b21b6' : 'none'} strokeWidth={1.5}
            />
          ))}
          {hover !== null && (
            <TipBox x={toX(xs[hover])} y={toY(ys[hover])} iw={iw} ih={ih} lines={[
              { label: 'Date', value: data[hover].date.slice(0, 10), color: '#374151' },
              { label: 'Estimated Used', value: `${xs[hover].toFixed(1)} mi`, color: '#7c3aed' },
              { label: 'Actually Driven', value: `${ys[hover].toFixed(1)} mi`, color: '#374151' },
            ]} />
          )}
        </g>
        <g transform={`translate(${ML.left},${height - 12})`}>
          <circle cx={6} cy={0} r={4} fill="#7c3aed" opacity={0.75} />
          <text x={14} y={4} fontSize={10} fill="#6b7280">Trip · above line = under-estimated, below = over-estimated</text>
        </g>
      </svg>
    </div>
  );
}

// ─── RangeAnxietyChart ────────────────────────────────────────────────────────
export function RangeAnxietyChart({
  data,
  height = 280,
}: {
  data: number[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const w = useWidth(ref);
  const [hover, setHover] = useState<number | null>(null);

  const ML = { top: 10, right: 16, bottom: 46, left: 52 };
  const iw = w - ML.left - ML.right;
  const ih = height - ML.top - ML.bottom;

  if (!data.length) return null;

  // Build bins 0-9, 10-19, ..., 90-100
  const BINS = 10;
  const labels = Array.from({ length: BINS }, (_, i) =>
    i < BINS - 1 ? `${i * 10}–${i * 10 + 9}%` : `${i * 10}–100%`,
  );
  const counts = Array(BINS).fill(0) as number[];
  data.forEach(v => {
    const bin = Math.min(Math.floor(v / 10), BINS - 1);
    counts[bin]++;
  });

  const maxCount = Math.max(...counts, 1);
  const ticks = yTicks(maxCount);
  const yTop = ticks[ticks.length - 1] || 1;
  const toY = (v: number) => ih - (v / yTop) * ih;

  // Median
  const sorted = [...data].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const medianBin = Math.min(Math.floor(median / 10), BINS - 1);
  const medianFrac = (median % 10) / 10;

  const groupW = iw / BINS;
  const barW = Math.max(2, groupW * 0.7);
  const barOff = (groupW - barW) / 2;

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const mx = e.clientX - e.currentTarget.getBoundingClientRect().left - ML.left;
    if (mx < 0 || mx > iw) { setHover(null); return; }
    setHover(Math.max(0, Math.min(Math.floor((mx / iw) * BINS), BINS - 1)));
  }

  const medianX = (medianBin + medianFrac) * groupW + groupW / 2;

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={w} height={height} onMouseMove={onMouseMove} onMouseLeave={() => setHover(null)}>
        <g transform={`translate(${ML.left},${ML.top})`}>
          {ticks.map((v, i) => <line key={i} x1={0} y1={toY(v)} x2={iw} y2={toY(v)} stroke="#f0fdf4" />)}
          {ticks.map((v, i) => (
            <text key={i} x={-5} y={toY(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#9ca3af">
              {v}
            </text>
          ))}
          {labels.map((lbl, i) => (
            <text key={i} x={i * groupW + groupW / 2} y={ih + 14} textAnchor="middle" fontSize={9} fill="#9ca3af">
              {lbl}
            </text>
          ))}
          <text x={iw / 2} y={ih + 30} textAnchor="middle" fontSize={10} fill="#9ca3af">Initial Battery %</text>
          <line x1={0} y1={0} x2={0} y2={ih} stroke="#e5e7eb" />
          <line x1={0} y1={ih} x2={iw} y2={ih} stroke="#e5e7eb" />
          {counts.map((cnt, i) => {
            const bh = Math.max(0, ih - toY(cnt));
            const fill = i < 2 ? '#f97316' : '#14b8a6';
            return (
              <rect
                key={i}
                x={i * groupW + barOff} y={toY(cnt)} width={barW} height={bh}
                fill={fill} opacity={hover === null || hover === i ? 1 : 0.55}
              />
            );
          })}
          {/* Median line */}
          <line x1={medianX} y1={0} x2={medianX} y2={ih} stroke="#374151" strokeWidth={1.5} strokeDasharray="4 2" />
          <text x={medianX + 4} y={12} fontSize={10} fill="#374151" fontWeight="600">
            Median: {median.toFixed(0)}%
          </text>
          {hover !== null && counts[hover] > 0 && (
            <TipBox x={hover * groupW + groupW / 2} y={toY(counts[hover])} iw={iw} ih={ih} lines={[
              { label: labels[hover], value: '', color: '#374151' },
              { label: 'Sessions', value: String(counts[hover]), color: hover < 2 ? '#f97316' : '#14b8a6' },
            ]} />
          )}
        </g>
      </svg>
    </div>
  );
}

// ─── ChargingHabitsChart ──────────────────────────────────────────────────────
export interface ChargingHabitsPoint {
  date: string;
  energy_kwh: number;
  pct_charged: number;
}

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function ChargingHabitsChart({
  data,
  height = 280,
}: {
  data: ChargingHabitsPoint[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const w = useWidth(ref);
  const [hover, setHover] = useState<number | null>(null);

  const ML = { top: 10, right: 16, bottom: 46, left: 52 };
  const iw = w - ML.left - ML.right;
  const ih = height - ML.top - ML.bottom;

  if (!data.length) return null;

  // Group by day of week (0=Sun, 1=Mon, ..., 6=Sat in JS)
  // We want Mon=0 ... Sun=6 index
  const countsByDay = Array(7).fill(0) as number[];
  const energyByDay = Array(7).fill(0) as number[];
  const pctByDay = Array(7).fill(0) as number[];

  data.forEach(d => {
    const jsDay = new Date(d.date).getDay(); // 0=Sun
    const idx = jsDay === 0 ? 6 : jsDay - 1; // Mon=0..Sun=6
    countsByDay[idx]++;
    energyByDay[idx] += d.energy_kwh;
    pctByDay[idx] += d.pct_charged;
  });

  const maxCount = Math.max(...countsByDay, 1);
  const ticks = yTicks(maxCount);
  const yTop = ticks[ticks.length - 1] || 1;
  const toY = (v: number) => ih - (v / yTop) * ih;

  const groupW = iw / 7;
  const barW = Math.max(2, groupW * 0.65);
  const barOff = (groupW - barW) / 2;

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const mx = e.clientX - e.currentTarget.getBoundingClientRect().left - ML.left;
    if (mx < 0 || mx > iw) { setHover(null); return; }
    setHover(Math.max(0, Math.min(Math.floor((mx / iw) * 7), 6)));
  }

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={w} height={height} onMouseMove={onMouseMove} onMouseLeave={() => setHover(null)}>
        <g transform={`translate(${ML.left},${ML.top})`}>
          {ticks.map((v, i) => <line key={i} x1={0} y1={toY(v)} x2={iw} y2={toY(v)} stroke="#f0fdf4" />)}
          {ticks.map((v, i) => (
            <text key={i} x={-5} y={toY(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#9ca3af">
              {v}
            </text>
          ))}
          {DAY_ORDER.map((lbl, i) => (
            <text key={i} x={i * groupW + groupW / 2} y={ih + 14} textAnchor="middle" fontSize={10} fill={hover === i ? '#16a34a' : '#9ca3af'}>
              {lbl}
            </text>
          ))}
          <text x={iw / 2} y={ih + 30} textAnchor="middle" fontSize={10} fill="#9ca3af">Day of Week</text>
          <line x1={0} y1={0} x2={0} y2={ih} stroke="#e5e7eb" />
          <line x1={0} y1={ih} x2={iw} y2={ih} stroke="#e5e7eb" />
          {countsByDay.map((cnt, i) => {
            const bh = Math.max(0, ih - toY(cnt));
            return (
              <rect
                key={i}
                x={i * groupW + barOff} y={toY(cnt)} width={barW} height={bh}
                fill="#16a34a" opacity={hover === null || hover === i ? 1 : 0.5}
              />
            );
          })}
          {hover !== null && countsByDay[hover] > 0 && (() => {
            const cnt = countsByDay[hover];
            const avgEnergy = energyByDay[hover] > 0 ? (energyByDay[hover] / cnt).toFixed(2) : null;
            const avgPct = (pctByDay[hover] / cnt).toFixed(1);
            const lines: TipLine[] = [
              { label: DAY_FULL[hover], value: '', color: '#374151' },
              { label: 'Sessions', value: String(cnt), color: '#16a34a' },
              ...(avgEnergy ? [{ label: 'Avg kWh Added', value: `${avgEnergy} kWh`, color: '#6b7280' }] : []),
              { label: 'Avg % Charged', value: `${avgPct}%`, color: '#6b7280' },
            ];
            return (
              <TipBox x={hover * groupW + groupW / 2} y={toY(cnt)} iw={iw} ih={ih} lines={lines} />
            );
          })()}
        </g>
        <g transform={`translate(${ML.left},${height - 12})`}>
          <rect x={0} y={-8} width={12} height={10} fill="#16a34a" />
          <text x={16} y={3} fontSize={10} fill="#6b7280">Sessions per day</text>
        </g>
      </svg>
    </div>
  );
}
