import React from 'react';
import { Accessibility, ArrowDownUp, Play, Square, X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { NavRoute, RouteMode } from '@/Interfaces';

interface RoutePanelProps {
  route: NavRoute | null;
  altRoute: NavRoute | null;
  mode: RouteMode;
  stepFree: boolean;
  loading: boolean;
  following: boolean;
  activeStep: number;
  onMode: (m: RouteMode) => void;
  onStepFree: (v: boolean) => void;
  onStart: () => void;
  onEnd: () => void;
  onClose: () => void;
  onSwap: () => void;
}

function eta(r: NavRoute | null): string {
  if (!r || r.unreachable || r.etaMinutes == null) return '—';
  return `${r.etaMinutes} min`;
}

function arrival(r: NavRoute | null): string {
  if (!r || r.unreachable || r.etaMinutes == null) return '';
  const d = new Date(Date.now() + r.etaMinutes * 60000);
  return `arrive ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default function RoutePanel({ route, altRoute, mode, stepFree, loading, following, activeStep, onMode, onStepFree, onStart, onEnd, onClose, onSwap }: RoutePanelProps) {
  const fast = mode === 'Fast' ? route : altRoute;
  const calm = mode === 'Calm' ? route : altRoute;
  const steps = route?.steps ?? [];
  return (
    <section className="cp-glass cp-card-in flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-3 p-3" aria-label="Route preview">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cp-muted)]">{following ? 'Route follow' : 'Route preview'}</p>
          <h2 className="truncate text-[14px] font-bold leading-tight text-[var(--cp-ink)]">
            {route?.fromNode?.label ?? 'Start'} → {route?.toNode?.label ?? 'Destination'}
          </h2>
        </div>
        <button type="button" className="cp-btn-secondary !min-h-7 !px-1.5" aria-label="Swap start and destination" onClick={onSwap}>
          <ArrowDownUp className="size-4" />
        </button>
        <button type="button" className="cp-btn-secondary !min-h-7 !px-1.5" aria-label="Close route" onClick={onClose}>
          <X className="size-4" />
        </button>
      </header>

      <Tabs value={mode} onValueChange={(v) => onMode(v as RouteMode)} variant="boxed" size="sm">
        <TabsList className="w-full">
          <TabsTrigger value="Fast" className="flex-1">
            Fast · {eta(fast)}
          </TabsTrigger>
          <TabsTrigger value="Calm" className="flex-1">
            Calm · {eta(calm)}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[12px] text-[var(--cp-ink)]">
          <Switch size="sm" checked={stepFree} onCheckedChange={onStepFree} aria-label="Step-free route" />
          <span className="flex items-center gap-1">
            <Accessibility className="size-3.5" /> Step-free
          </span>
        </label>
        {loading ? <Spinner size="sm" /> : <span className="text-[11px] text-[var(--cp-muted)]">{arrival(route)}</span>}
      </div>

      {route?.unreachable ? (
        <p className="rounded-md border border-[var(--cp-rust)]/40 bg-[var(--cp-sand)]/30 p-2 text-[12px] text-[var(--cp-rust)]">
          No {stepFree ? 'step-free ' : ''}route reaches this destination in the demo graph.
        </p>
      ) : route ? (
        <>
          <div className="flex items-baseline gap-3">
            <span className="text-[26px] font-black leading-none text-[var(--cp-sienna)]">{route.etaMinutes} min</span>
            <span className="text-[12px] text-[var(--cp-muted)]">
              {route.distanceM} m{route.crowdPenaltyMin ? ` · +${route.crowdPenaltyMin} min around crowds` : ''}
              {route.floorsVisited && route.floorsVisited.length ? ` · floors ${route.floorsVisited.join(' → ')}` : ''}
            </span>
          </div>
          <ol className="cp-scroll flex max-h-40 flex-col gap-1 overflow-y-auto pr-1" aria-label="Route steps">
            {steps.map((s, i) => (
              <li
                key={`${i}-${s.text}`}
                className={`flex items-start gap-2 rounded px-1.5 py-1 text-[12px] ${following && i === activeStep ? 'bg-[var(--cp-sienna)] text-[var(--cp-cream)]' : 'text-[var(--cp-ink)]'}`}
              >
                <span className={`mt-px grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${following && i === activeStep ? 'bg-[var(--cp-cream)] text-[var(--cp-sienna)]' : 'bg-[var(--cp-sand)]'}`}>{i + 1}</span>
                <span className="flex-1">{s.text}</span>
                {s.distanceM ? <span className={`shrink-0 ${following && i === activeStep ? 'opacity-80' : 'text-[var(--cp-muted)]'}`}>{s.distanceM} m</span> : null}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-[12px] text-[var(--cp-muted)]">Computing route…</p>
      )}

      <footer className="flex gap-2">
        {following ? (
          <button type="button" className="cp-btn-secondary flex flex-1 items-center justify-center gap-1.5" onClick={onEnd}>
            <Square className="size-4" /> End
          </button>
        ) : (
          <button type="button" className="cp-btn-primary flex flex-1 items-center justify-center gap-1.5" disabled={!route || route.unreachable} onClick={onStart}>
            <Play className="size-4" /> Start
          </button>
        )}
      </footer>
    </section>
  );
}
