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
  if (max <= 0) return Array.from({ length: n + 1 }, (_, i) => i);
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
