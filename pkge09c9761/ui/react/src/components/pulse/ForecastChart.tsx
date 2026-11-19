import React, { useMemo } from 'react';
import { CrowdForecast } from '@/Interfaces';
import { clockLabel } from '@/shared/campusTheme';

interface ForecastChartProps {
  forecast: CrowdForecast;
  height?: number;
}

/**
 * Hand-drawn SVG band chart: p10–p90 range as a filled band, p50 as a line, a 90% capacity rule, and the
 * "full at" marker. Kept dependency-free so it renders instantly inside the map's glass card.
 */
export default function ForecastChart({ forecast, height = 150 }: ForecastChartProps) {
  const width = 320;
  const pad = { l: 34, r: 10, t: 10, b: 22 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const n = forecast.minutesAhead.length;
  const maxMin = forecast.minutesAhead[n - 1] || 180;
  const yMax = 1.2;

  const x = (minute: number) => pad.l + (minute / maxMin) * innerW;
  const y = (fraction: number) => pad.t + innerH - (Math.min(fraction, yMax) / yMax) * innerH;

  const { bandPath, p50Path } = useMemo(() => {
    const upper = forecast.minutesAhead.map((m, i) => `${x(m).toFixed(1)},${y(forecast.p90[i]).toFixed(1)}`);
    const lower = forecast.minutesAhead.map((m, i) => `${x(m).toFixed(1)},${y(forecast.p10[i]).toFixed(1)}`).reverse();
    const mid = forecast.minutesAhead.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(m).toFixed(1)},${y(forecast.p50[i]).toFixed(1)}`);
    return { bandPath: `M${upper.join(' L')} L${lower.join(' L')} Z`, p50Path: mid.join(' ') };
    // x/y are derived from forecast + fixed layout; recompute only when the forecast changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecast]);

  const ticks = [0, 60, 120, 180].filter((t) => t <= maxMin);
  const capY = y(0.9);
  const ttc = forecast.timeToCapacityMin;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`Occupancy forecast for ${forecast.zone.name}`}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={pad.l} x2={width - pad.r} y1={y(f)} y2={y(f)} stroke="var(--cp-border)" strokeOpacity={0.3} strokeWidth={1} />
          <text x={pad.l - 6} y={y(f) + 3} textAnchor="end" fontSize={9} fill="var(--cp-muted)">
            {Math.round(f * 100)}%
          </text>
        </g>
      ))}
      <line x1={pad.l} x2={width - pad.r} y1={capY} y2={capY} stroke="var(--cp-rust)" strokeDasharray="4 3" strokeWidth={1.2} />
      <text x={width - pad.r} y={capY - 3} textAnchor="end" fontSize={9} fill="var(--cp-rust)" fontWeight={700}>
        capacity
      </text>
      <path d={bandPath} fill="var(--cp-sand)" fillOpacity={0.45} />
      <path d={p50Path} fill="none" stroke="var(--cp-sienna)" strokeWidth={2.4} strokeLinejoin="round" />
      {ttc != null ? (
        <g>
          <line x1={x(ttc)} x2={x(ttc)} y1={pad.t} y2={pad.t + innerH} stroke="var(--cp-terracotta)" strokeWidth={1.5} />
          <circle cx={x(ttc)} cy={y(forecast.p50[Math.round(ttc / 10)] ?? 0.9)} r={4} fill="var(--cp-terracotta)" stroke="var(--cp-paper)" strokeWidth={1.5} />
        </g>
      ) : null}
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={height - 6} textAnchor={t === 0 ? 'start' : 'middle'} fontSize={9} fill="var(--cp-muted)">
          {t === 0 ? `now ${clockLabel(forecast.scenario.minuteOfDay)}` : `+${t / 60}h`}
        </text>
      ))}
    </svg>
  );
}
