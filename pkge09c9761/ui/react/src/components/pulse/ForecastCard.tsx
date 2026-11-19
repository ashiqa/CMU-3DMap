import React from 'react';
import { CloudRain, Footprints, Info, X } from 'lucide-react';
import { CrowdForecast, Scenario, ZoneRecommendation } from '@/Interfaces';
import { forecastHeadline, pct } from '@/shared/campusTheme';
import ForecastChart from './ForecastChart';

interface ForecastCardProps {
  forecast: CrowdForecast;
  recommendation: ZoneRecommendation | null;
  scenario: Scenario;
  loading: boolean;
  onScenario: (patch: Partial<Scenario>) => void;
  onGoAlternative: (zoneId: string) => void;
  onClose: () => void;
}

function Toggle({ label, icon, on, onChange }: { label: string; icon?: React.ReactNode; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className="cp-chip" data-active={on} aria-pressed={on} onClick={() => onChange(!on)}>
      {icon}
      {label}
      <span className="text-[10px] opacity-70">{on ? 'ON' : 'OFF'}</span>
    </button>
  );
}

export default function ForecastCard({ forecast, recommendation, scenario, loading, onScenario, onGoAlternative, onClose }: ForecastCardProps) {
  const alt = recommendation?.alternatives?.[0];
  return (
    <section className="cp-glass cp-card-in flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-3 p-3" aria-label={`Forecast for ${forecast.zone.name}`}>
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cp-muted)]">Pin &amp; predict · simulated</p>
          <h2 className="truncate text-[15px] font-bold leading-tight text-[var(--cp-ink)]">{forecast.zone.name}</h2>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-black leading-none text-[var(--cp-sienna)]">{pct(forecast.nowFraction)}</div>
          <div className="text-[11px] text-[var(--cp-muted)]">now</div>
        </div>
        <button type="button" className="cp-btn-secondary !min-h-7 !px-1.5" aria-label="Close forecast" onClick={onClose}>
          <X className="size-4" />
        </button>
      </header>

      <div className={`rounded-md border border-[var(--cp-border)]/40 bg-[var(--cp-paper)] p-1 ${loading ? 'opacity-60' : ''}`}>
        <ForecastChart forecast={forecast} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Toggle label="Rain" icon={<CloudRain className="size-3.5" />} on={scenario.rain} onChange={(v) => onScenario({ rain: v })} />
        <Toggle label="Event nearby" on={scenario.eventNearby} onChange={(v) => onScenario({ eventNearby: v })} />
        <Toggle label="Exam week" on={scenario.examWeek} onChange={(v) => onScenario({ examWeek: v })} />
      </div>

      <div className="flex items-baseline justify-between">
        <span className={`text-[14px] font-bold ${forecast.timeToCapacityMin != null ? 'text-[var(--cp-rust)]' : 'text-[var(--cp-ink)]'}`}>{forecastHeadline(forecast)}</span>
        <span className="text-[11px] text-[var(--cp-muted)]">band = scenario range, not a CI</span>
      </div>

      {forecast.drivers.length ? (
        <ul className="flex flex-col gap-1" aria-label="Forecast drivers">
          {forecast.drivers.slice(0, 3).map((d) => (
            <li key={d.label} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-[var(--cp-ink)]">{d.label}</span>
              <span className={`shrink-0 font-semibold ${d.contribution >= 0 ? 'text-[var(--cp-terracotta)]' : 'text-[var(--cp-bathroom)]'}`}>
                {d.contribution >= 0 ? '+' : ''}
                {Math.round(d.contribution * 100)}%
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {recommendation ? (
        <div className="rounded-md border border-[var(--cp-sienna)]/40 bg-[var(--cp-sand)]/35 p-2.5">
          <p className="text-[12px] leading-snug text-[var(--cp-ink)]">{recommendation.summary}</p>
          {alt ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[12px] text-[var(--cp-muted)]">
                <Footprints className="size-3.5" /> {alt.reason}
              </span>
              <button type="button" className="cp-btn-primary !min-h-8 !px-3 text-[12px]" onClick={() => onGoAlternative(alt.zone.id)}>
                Go to {alt.zone.name.split(' ')[0]}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <details className="text-[11px] text-[var(--cp-muted)]">
        <summary className="flex cursor-pointer items-center gap-1 font-semibold">
          <Info className="size-3.5" /> How this works
        </summary>
        <p className="mt-1 leading-snug">{forecast.method}</p>
      </details>
    </section>
  );
}
