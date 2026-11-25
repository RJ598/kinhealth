import React, { useMemo, useState } from 'react';

export interface ChartPoint {
  date: string;
  label: string;
  value: number;
}

export interface ChartSeries {
  id: string;
  name: string;
  color: string;
  data: ChartPoint[];
}

export const SERIES_COLORS = [
  '#059669', // Emerald (You)
  '#2563eb', // Cobalt Blue
  '#d97706', // Amber
  '#7c3aed', // Violet
  '#e11d48', // Rose
  '#0d9488', // Teal
  '#ea580c', // Orange
  '#4f46e5', // Indigo
  '#0284c7', // Sky
  '#65a30d', // Lime
];

interface MultiTrendChartProps {
  title: string;
  unit: string;
  series: ChartSeries[];
  targetValue?: number;
  height?: number;
}

export const MultiTrendChart: React.FC<MultiTrendChartProps> = ({
  title,
  unit,
  series,
  targetValue,
  height = 240,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const activeSeries = useMemo(
    () => series.filter((s) => s.data.length > 0),
    [series]
  );

  const allDates = useMemo(() => {
    const set = new Set<string>();
    activeSeries.forEach((s) => s.data.forEach((p) => set.add(p.date)));
    return Array.from(set).sort();
  }, [activeSeries]);

  const seriesMaps = useMemo(() => {
    return activeSeries.map((s) => {
      const m = new Map<string, number>();
      s.data.forEach((p) => m.set(p.date, p.value));
      return { ...s, map: m };
    });
  }, [activeSeries]);

  const values = useMemo(() => {
    const arr: number[] = [];
    activeSeries.forEach((s) => s.data.forEach((p) => arr.push(p.value)));
    if (typeof targetValue === 'number' && targetValue > 0) arr.push(targetValue);
    return arr;
  }, [activeSeries, targetValue]);

  if (allDates.length === 0) {
    return (
      <div className="py-12 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
        <p className="text-sm text-slate-600">No entries yet for {title.toLowerCase()}.</p>
        <p className="mt-1 text-xs text-slate-400">
          Log at least one entry to render the trend line.
        </p>
      </div>
    );
  }

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = Math.max(1, rawMax - rawMin);
  const minY = rawMin - span * 0.12;
  const maxY = rawMax + span * 0.12;

  const width = 680;
  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xFor = (idx: number) => {
    if (allDates.length === 1) return padL + plotW / 2;
    return padL + (idx / (allDates.length - 1)) * plotW;
  };

  const yFor = (val: number) => {
    return padT + plotH - ((val - minY) / (maxY - minY)) * plotH;
  };

  const buildPath = (map: Map<string, number>) => {
    let d = '';
    allDates.forEach((date, idx) => {
      const val = map.get(date);
      if (typeof val !== 'number') return;
      const x = xFor(idx);
      const y = yFor(val);
      d += d === '' ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return d;
  };

  const yTicks = [0, 0.5, 1].map((t) => {
    const val = minY + (maxY - minY) * t;
    return { val, y: yFor(val) };
  });

  const hoveredDate = hoverIdx !== null ? allDates[hoverIdx] : null;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          {seriesMaps.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-2 font-medium text-slate-800">
              <span
                className="w-3 h-0.5 inline-block"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </span>
          ))}
          {typeof targetValue === 'number' && targetValue > 0 && (
            <span className="inline-flex items-center gap-2 text-slate-500">
              <span className="w-3 h-0 border-t border-dashed border-slate-400 inline-block" />
              Target ({targetValue} {unit})
            </span>
          )}
        </div>

        <div className="min-h-5 text-xs font-mono tabular-nums text-slate-600">
          {hoveredDate ? (
            <span>
              {hoveredDate}
              {seriesMaps.map((s) => {
                const v = s.map.get(hoveredDate);
                return typeof v === 'number' ? ` · ${s.name}: ${v} ${unit}` : '';
              })}
            </span>
          ) : (
            <span className="text-slate-400">Hover points to inspect values</span>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible select-none"
        role="img"
        aria-label={title}
      >
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={width - padR}
              y1={tick.y}
              y2={tick.y}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <text
              x={padL - 8}
              y={tick.y + 4}
              textAnchor="end"
              className="fill-slate-400 text-[11px] font-mono tabular-nums"
            >
              {tick.val.toFixed(tick.val >= 100 ? 0 : 1)}
            </text>
          </g>
        ))}

        {typeof targetValue === 'number' && targetValue > 0 && (
          <line
            x1={padL}
            x2={width - padR}
            y1={yFor(targetValue)}
            y2={yFor(targetValue)}
            stroke="#94a3b8"
            strokeWidth="1.2"
            strokeDasharray="4 4"
          />
        )}

        {seriesMaps.map((s, sIdx) => {
          const path = buildPath(s.map);
          if (!path) return null;
          return (
            <path
              key={s.id}
              d={path}
              fill="none"
              stroke={s.color}
              strokeWidth={sIdx === 0 ? '2.25' : '1.9'}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {allDates.map((date, idx) => {
          const x = xFor(idx);
          const isHovered = hoverIdx === idx;
          const showXLabel =
            allDates.length <= 6 ||
            idx === 0 ||
            idx === allDates.length - 1 ||
            idx === Math.floor(allDates.length / 2);

          return (
            <g key={date}>
              {isHovered && (
                <line
                  x1={x}
                  x2={x}
                  y1={padT}
                  y2={padT + plotH}
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
              )}

              {seriesMaps.map((s) => {
                const val = s.map.get(date);
                if (typeof val !== 'number') return null;
                return (
                  <circle
                    key={s.id}
                    cx={x}
                    cy={yFor(val)}
                    r={isHovered ? 4.8 : 3.2}
                    fill={s.color}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                );
              })}

              {showXLabel && (
                <text
                  x={x}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px] font-mono tabular-nums"
                >
                  {date.slice(5)}
                </text>
              )}

              <rect
                x={x - Math.max(12, plotW / Math.max(allDates.length * 2, 2))}
                y={padT}
                width={Math.max(24, plotW / Math.max(allDates.length, 1))}
                height={plotH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

interface DualTrendChartProps {
  title: string;
  unit: string;
  myName: string;
  partnerName?: string;
  myData: ChartPoint[];
  partnerData?: ChartPoint[];
  targetValue?: number;
  height?: number;
}

export const DualTrendChart: React.FC<DualTrendChartProps> = ({
  title,
  unit,
  myName,
  partnerName,
  myData,
  partnerData = [],
  targetValue,
  height = 240,
}) => {
  const series: ChartSeries[] = [
    { id: 'me', name: myName, color: SERIES_COLORS[0], data: myData },
  ];
  if (partnerName && partnerData.length > 0) {
    series.push({
      id: 'partner',
      name: partnerName,
      color: SERIES_COLORS[1],
      data: partnerData,
    });
  }
  return (
    <MultiTrendChart
      title={title}
      unit={unit}
      series={series}
      targetValue={targetValue}
      height={height}
    />
  );
};

interface ProgressBarProps {
  value: number;
  target: number;
  colorClass?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  target,
  colorClass = 'bg-emerald-600',
}) => {
  const safeTarget = Math.max(1, target);
  const pct = Math.min(100, Math.round((value / safeTarget) * 100));
  const isOver = value > safeTarget * 1.1;

  return (
    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full transition-all duration-300 ${isOver ? 'bg-amber-500' : colorClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};
