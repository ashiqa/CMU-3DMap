import React, { useEffect, useMemo, useState } from 'react';
import { CloudRain, Radio } from 'lucide-react';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataGrid, DataGridBody, DataGridCell, DataGridHead, DataGridHeader, DataGridRow } from '@/components/ui/data-grid';
import { Switch } from '@/components/ui/switch';
import ForecastChart from '@/components/pulse/ForecastChart';
import { CrowdForecast, CrowdState, Scenario, ZoneRecommendation } from '@/Interfaces';
import { forecastZone, recommendZone, simulateCrowd } from '@/shared/campusApi';
import { DEMO_MINUTE_OF_DAY, LEVEL_LABEL, clockLabel, currentMinuteOfDay, defaultScenario, forecastHeadline, pct } from '@/shared/campusTheme';
import '@/styles/campus-pulse.css';

const POLL_MS = 6000;

export default function CrowdPage() {
  const { reportError } = useErrorBoundary();
  const [scenario, setScenario] = useState<Scenario>(defaultScenario);
  const [demoClock, setDemoClock] = useState(false);
  const [states, setStates] = useState<CrowdState[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [forecast, setForecast] = useState<CrowdForecast | null>(null);
  const [rec, setRec] = useState<ZoneRecommendation | null>(null);

  useEffect(() => {
    setScenario((s) => ({ ...s, minuteOfDay: demoClock ? DEMO_MINUTE_OF_DAY : currentMinuteOfDay() }));
  }, [demoClock]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const sc = demoClock ? scenario : { ...scenario, minuteOfDay: currentMinuteOfDay() };
        const res = await simulateCrowd(sc);
        if (!cancelled) setStates(res);
      } catch (err) {
        if (!cancelled) reportError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [scenario, demoClock, reportError]);

  useEffect(() => {
    if (!zoneId) return undefined;
    let cancelled = false;
    Promise.all([forecastZone(zoneId, scenario), recommendZone(zoneId, scenario)])
      .then(([f, r]) => {
        if (cancelled) return;
        setForecast(f);
        setRec(r);
      })
      .catch((err) => {
        if (!cancelled) reportError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [zoneId, scenario, reportError]);

  const sorted = useMemo(() => [...states].sort((a, b) => b.fraction - a.fraction), [states]);
  const atCapacity = states.filter((s) => s.level >= 4).length;
  const busy = states.filter((s) => s.level === 3).length;
  const avg = states.length ? states.reduce((a, s) => a + s.fraction, 0) / states.length : 0;
  const people = states.reduce((a, s) => a + s.occupancy, 0);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-c3-bold-heading-h4 text-foreground">
            <Radio className="size-5" /> Crowd Pulse
          </h1>
          <p className="text-c3-regular-body-p2 text-muted-foreground">
            Simulated occupancy for every <code className="cp-kbd">CrowdZone</code>, recomputed every few seconds from the scenario model. <strong>All values are simulated.</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-sm border border-border bg-card px-3 py-2">
          <label className="flex items-center gap-2 text-c3-regular-body-p3 text-foreground">
            <Switch size="sm" checked={scenario.rain} onCheckedChange={(v) => setScenario({ ...scenario, rain: v })} aria-label="Rain" />
            <CloudRain className="size-4" /> Rain
          </label>
          <label className="flex items-center gap-2 text-c3-regular-body-p3 text-foreground">
            <Switch size="sm" checked={scenario.eventNearby} onCheckedChange={(v) => setScenario({ ...scenario, eventNearby: v })} aria-label="Event nearby" />
            Event nearby
          </label>
          <label className="flex items-center gap-2 text-c3-regular-body-p3 text-foreground">
            <Switch size="sm" checked={scenario.examWeek} onCheckedChange={(v) => setScenario({ ...scenario, examWeek: v })} aria-label="Exam week" />
            Exam week
          </label>
          <label className="flex items-center gap-2 text-c3-regular-body-p3 text-foreground">
            <Switch size="sm" checked={demoClock} onCheckedChange={setDemoClock} aria-label="Demo clock" />
            {demoClock ? 'Demo' : 'Live'} {clockLabel(scenario.minuteOfDay)}
          </label>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Zones at capacity</CardDescription>
            <CardTitle>{atCapacity}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Busy zones</CardDescription>
            <CardTitle>{busy}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Average occupancy</CardDescription>
            <CardTitle>{pct(avg)}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Simulated people on campus</CardDescription>
            <CardTitle>{people.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <DataGrid className="w-full">
          <DataGridHeader>
            <DataGridRow>
              <DataGridHead>Zone</DataGridHead>
              <DataGridHead>Kind</DataGridHead>
              <DataGridHead>Occupancy</DataGridHead>
              <DataGridHead>Level</DataGridHead>
              <DataGridHead>Trend</DataGridHead>
              <DataGridHead />
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody>
            {sorted.map((s) => (
              <DataGridRow key={s.zone.id}>
                <DataGridCell>
                  <span className="font-medium">{s.zone.name}</span>
                  <div className="text-c3-regular-body-p3 text-muted-foreground">
                    {s.zone.building?.name ?? 'Outdoor'}
                    {s.zone.floor ? ` · floor ${s.zone.floor}` : ''}
                  </div>
                </DataGridCell>
                <DataGridCell>{s.zone.kind}</DataGridCell>
                <DataGridCell>
                  <div className="flex items-center gap-2">
                    <div className="cp-bar w-32">
                      <span className={`cp-level-${s.level} ${widthClass(s.fraction)}`} />
                    </div>
                    <span className="tabular-nums">
                      {pct(s.fraction)} <span className="text-muted-foreground">({s.occupancy.toLocaleString()} / {s.zone.capacity.toLocaleString()})</span>
                    </span>
                  </div>
                </DataGridCell>
                <DataGridCell>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold cp-level-${s.level}`}>{LEVEL_LABEL[s.level]}</span>
                </DataGridCell>
                <DataGridCell>
                  <Badge variant="soft" appearance={s.trend === 'rising' ? 'warning' : s.trend === 'falling' ? 'success' : 'secondary'} size="sm">
                    {s.trend}
                  </Badge>
                </DataGridCell>
                <DataGridCell>
                  <Button variant="outline" appearance="secondary" size="sm" onClick={() => setZoneId(s.zone.id)}>
                    Forecast
                  </Button>
                </DataGridCell>
              </DataGridRow>
            ))}
            {!loading && sorted.length === 0 ? (
              <DataGridRow>
                <DataGridCell colSpan={6}>No crowd zones found.</DataGridCell>
              </DataGridRow>
            ) : null}
          </DataGridBody>
        </DataGrid>

        <aside className="flex flex-col gap-3">
          {forecast ? (
            <Card size="md">
              <CardHeader>
                <CardDescription>3-hour forecast · simulated</CardDescription>
                <CardTitle>{forecast.zone.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-sm border border-border bg-background p-1">
                  <ForecastChart forecast={forecast} />
                </div>
                <p className="mt-2 text-c3-bold-body-p2 text-foreground">{forecastHeadline(forecast)}</p>
                <ul className="mt-1 flex flex-col gap-0.5 text-c3-regular-body-p3">
                  {forecast.drivers.slice(0, 3).map((d) => (
                    <li key={d.label} className="flex justify-between gap-2">
                      <span>{d.label}</span>
                      <span className="tabular-nums">
                        {d.contribution >= 0 ? '+' : ''}
                        {Math.round(d.contribution * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
                {rec ? <p className="mt-2 text-c3-regular-body-p3 text-muted-foreground">{rec.summary}</p> : null}
                <p className="mt-2 text-c3-regular-body-p3 text-muted-foreground">{forecast.method}</p>
              </CardContent>
            </Card>
          ) : (
            <Card size="md">
              <CardHeader>
                <CardTitle>Pick a zone</CardTitle>
                <CardDescription>Choose “Forecast” on a row to see its 3-hour band, drivers, and the recommended alternative.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Tailwind width step for an occupancy fraction (static class names so the build can see them). */
function widthClass(fraction: number): string {
  const steps = ['w-0', 'w-[10%]', 'w-[20%]', 'w-[30%]', 'w-[40%]', 'w-[50%]', 'w-[60%]', 'w-[70%]', 'w-[80%]', 'w-[90%]', 'w-full'];
  const i = Math.max(0, Math.min(10, Math.round(Math.min(fraction, 1) * 10)));
  return steps[i];
}
