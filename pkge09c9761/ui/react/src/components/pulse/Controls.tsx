import React from 'react';
import { ChevronLeft, ChevronRight, CloudRain, Clock3, Compass, Film, Gauge, Pause, Play, Radio, Square } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { LayerId, LayerVisibility, Scenario } from '@/Interfaces';
import { LAYER_LABEL, clockLabel } from '@/shared/campusTheme';

const LAYER_ORDER: LayerId[] = ['food', 'events', 'bathrooms', 'printers', 'study', 'crowd', 'route', 'streets'];

export function LayerChips({ layers, onToggle }: { layers: LayerVisibility; onToggle: (id: LayerId) => void }) {
  return (
    <nav className="cp-glass flex flex-col gap-1 p-1.5" aria-label="Map layers">
      {LAYER_ORDER.map((id) => (
        <button key={id} type="button" className="cp-chip cp-chip--layer !justify-start" data-active={layers[id]} aria-pressed={layers[id]} onClick={() => onToggle(id)}>
          <span className={`cp-chip-dot cp-dot--${id}`} aria-hidden />
          {LAYER_LABEL[id]}
        </button>
      ))}
    </nav>
  );
}

export interface CameraPreset {
  id: string;
  label: string;
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'overview', label: 'Campus', lng: -79.9443, lat: 40.4428, zoom: 16.35, pitch: 58, bearing: -22 },
  { id: 'wean', label: 'Wean / Sorrells', lng: -79.94575, lat: 40.4426, zoom: 17.6, pitch: 62, bearing: -35 },
  { id: 'hunt', label: 'Hunt', lng: -79.9438, lat: 40.4411, zoom: 17.8, pitch: 60, bearing: 15 },
  { id: 'gates', label: 'Gates', lng: -79.9445, lat: 40.4435, zoom: 17.5, pitch: 60, bearing: -60 },
];

export interface TourState {
  paused: boolean;
  index: number;
  total: number;
  label: string;
  speed: number;
}

interface ScenarioBarProps {
  scenario: Scenario;
  demoClock: boolean;
  touring: boolean;
  tour: TourState;
  llmConfigured: boolean;
  onScenario: (patch: Partial<Scenario>) => void;
  onDemoClock: (v: boolean) => void;
  onPreset: (p: CameraPreset) => void;
  onTour: () => void;
  onStopTour: () => void;
  onPauseTour: () => void;
  onResumeTour: () => void;
  onPrevStep: () => void;
  onNextStep: () => void;
  onCycleSpeed: () => void;
}

function speedLabel(speed: number): string {
  return `${speed}×`;
}

export function ScenarioBar({
  scenario,
  demoClock,
  touring,
  tour,
  llmConfigured,
  onScenario,
  onDemoClock,
  onPreset,
  onTour,
  onStopTour,
  onPauseTour,
  onResumeTour,
  onPrevStep,
  onNextStep,
  onCycleSpeed,
}: ScenarioBarProps) {
  return (
    <div className="cp-glass flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2" role="toolbar" aria-label="Scenario controls">
      <label className="flex items-center gap-2 text-[12px] font-semibold text-[var(--cp-ink)]">
        <Switch size="sm" checked={scenario.rain} onCheckedChange={(v) => onScenario({ rain: v })} aria-label="Rain scenario" />
        <span className="flex items-center gap-1">
          <CloudRain className="size-3.5" /> Rain
        </span>
      </label>
      <label className="flex items-center gap-2 text-[12px] text-[var(--cp-ink)]">
        <Switch size="sm" checked={scenario.eventNearby} onCheckedChange={(v) => onScenario({ eventNearby: v })} aria-label="Event nearby scenario" />
        Event
      </label>
      <label className="flex items-center gap-2 text-[12px] text-[var(--cp-ink)]">
        <Switch size="sm" checked={scenario.examWeek} onCheckedChange={(v) => onScenario({ examWeek: v })} aria-label="Exam week scenario" />
        Exams
      </label>
      <span className="h-5 w-px bg-[var(--cp-border)]/50" aria-hidden />
      <label className="flex items-center gap-2 text-[12px] text-[var(--cp-ink)]" title="Freeze the simulated clock at 2:10 PM for a deterministic demo">
        <Switch size="sm" checked={demoClock} onCheckedChange={onDemoClock} aria-label="Demo clock" />
        <span className="flex items-center gap-1">
          <Clock3 className="size-3.5" /> {demoClock ? 'Demo' : 'Live'} {clockLabel(scenario.minuteOfDay)}
        </span>
      </label>
      <span className="h-5 w-px bg-[var(--cp-border)]/50" aria-hidden />
      <span className="flex items-center gap-1 text-[11px] text-[var(--cp-muted)]">
        <Compass className="size-3.5" />
        {CAMERA_PRESETS.map((p) => (
          <button key={p.id} type="button" className="cp-chip !min-h-6 !px-2 !text-[11px] !font-medium" onClick={() => onPreset(p)}>
            {p.label}
          </button>
        ))}
      </span>
      {/* second row: status chips + tour controls. `basis-full` guarantees its own line so the strip never clips. */}
      <span className="flex basis-full flex-wrap items-center justify-end gap-2">
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--cp-border)]/60 bg-[var(--cp-paper)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--cp-muted)]" title="Crowd and forecast values are simulated from a scenario model">
          <Radio className="size-3" /> Simulated
        </span>
        {!llmConfigured ? (
          <span className="shrink-0 whitespace-nowrap rounded-full border border-[var(--cp-border)]/60 bg-[var(--cp-paper)] px-2 py-0.5 text-[10px] font-semibold text-[var(--cp-muted)]" title="Assistant uses the deterministic parser until a Gemini key is configured">
            LLM off
          </span>
        ) : null}
        <button type="button" className="cp-chip !min-h-7 !px-2 !text-[11px] !font-semibold" onClick={onCycleSpeed} title="Tour speed (click to change)" aria-label={`Tour speed ${speedLabel(tour.speed)}`}>
          <Gauge className="size-3.5" /> {speedLabel(tour.speed)}
        </button>
        {touring ? (
          <span className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-[var(--cp-red)]/50 bg-[var(--cp-paper)] p-0.5" role="group" aria-label="Tour controls">
            <button type="button" className="cp-btn-secondary !min-h-7 !border-0 !px-1.5" onClick={onPrevStep} disabled={tour.index === 0} aria-label="Previous step (←)" title="Previous step (←)">
              <ChevronLeft className="size-4" />
            </button>
            {tour.paused ? (
              <button type="button" className="cp-btn-primary flex !min-h-7 items-center gap-1 !px-2.5 text-[12px]" onClick={onResumeTour} title="Resume (Space)">
                <Play className="size-3.5" /> Resume
              </button>
            ) : (
              <button type="button" className="cp-btn-secondary flex !min-h-7 items-center gap-1 !border-0 !px-2.5 text-[12px]" onClick={onPauseTour} title="Pause (Space)">
                <Pause className="size-3.5" /> Pause
              </button>
            )}
            <button type="button" className="cp-btn-secondary !min-h-7 !border-0 !px-1.5" onClick={onNextStep} disabled={tour.index >= tour.total - 1} aria-label="Next step (→)" title="Next step (→)">
              <ChevronRight className="size-4" />
            </button>
            <span className="max-w-[180px] truncate px-1.5 text-[11px] font-semibold text-[var(--cp-ink)]" aria-live="polite" title={`${tour.index + 1}/${tour.total} · ${tour.label}`}>
              {tour.index + 1}/{tour.total} · {tour.label}
              {tour.paused ? <span className="ml-1 rounded bg-[var(--cp-gold)] px-1 text-[10px] font-bold text-[var(--cp-ink)]">PAUSED</span> : null}
            </span>
            <button type="button" className="cp-btn-secondary flex !min-h-7 items-center gap-1 !border-0 !px-2 text-[12px] !text-[var(--cp-red)]" onClick={onStopTour} title="Stop the tour (Esc)">
              <Square className="size-3.5" /> Stop
            </button>
          </span>
        ) : (
          <button type="button" className="cp-btn-primary flex !min-h-8 items-center gap-1.5 !px-3 text-[12px]" onClick={onTour}>
            <Film className="size-4" /> Tour
          </button>
        )}
      </span>
    </div>
  );
}
