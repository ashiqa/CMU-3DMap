import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, LineString, Point } from 'geojson';
import { AlertTriangle, Play, Siren } from 'lucide-react';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CampusMap, { CampusMapHandle } from '@/components/map/CampusMap';
import { PointLabels } from '@/components/map/Markers';
import { CampusBuilding, EvacuationPlan, EvacuationRun } from '@/Interfaces';
import { fetchBuildings, planEvacuation } from '@/shared/campusApi';
import { DEFAULT_LAYERS } from '@/shared/campusTheme';
import '@/styles/campus-pulse.css';

const SANDBOX_CODES = ['GHC', 'HL', 'WEH'];
const EXIT_COLORS = ['#2a7f8e', '#e35336', '#5b4b8a', '#6e2c4f', '#6b8e23'];

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function RunSummary({ run, colorFor, highlight }: { run: EvacuationRun; colorFor: (exitId: string) => string; highlight: boolean }) {
  return (
    <Card size="md" className={highlight ? 'border-[var(--c3-style-basic-border-accent)]' : undefined}>
      <CardHeader>
        <CardDescription>{run.method}</CardDescription>
        <CardTitle>{mmss(run.clearanceSec)} to clear</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-c3-regular-body-p3 text-muted-foreground">Busiest exit carries {Math.round(run.maxExitFraction * 100)}% of occupants.</p>
        <ul className="mt-2 flex flex-col gap-2">
          {run.exitLoads.map((l) => (
            <li key={l.exit.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-c3-regular-body-p3">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <span className={`size-2.5 rounded-full ${colorFor(l.exit.id)}`} aria-hidden />
                  {l.exit.name}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {l.assigned} · {Math.round(l.fraction * 100)}% · {mmss(l.clearanceSec)}
                </span>
              </div>
              <div className="cp-bar">
                <span className={`${colorFor(l.exit.id)} ${widthClass(l.fraction)}`} />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function widthClass(fraction: number): string {
  const steps = ['w-0', 'w-[10%]', 'w-[20%]', 'w-[30%]', 'w-[40%]', 'w-[50%]', 'w-[60%]', 'w-[70%]', 'w-[80%]', 'w-[90%]', 'w-full'];
  return steps[Math.max(0, Math.min(10, Math.round(Math.min(fraction, 1) * 10)))];
}

export default function EvacuationPage() {
  const { reportError } = useErrorBoundary();
  const mapRef = useRef<CampusMapHandle>(null);
  const [buildings, setBuildings] = useState<CampusBuilding[]>([]);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [occupants, setOccupants] = useState(400);
  const [seed, setSeed] = useState(7);
  const [plan, setPlan] = useState<EvacuationPlan | null>(null);
  const [view, setView] = useState<'baseline' | 'optimized'>('optimized');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBuildings()
      .then((b) => {
        if (cancelled) return;
        setBuildings(b);
        const ghc = b.find((x) => x.code === 'GHC');
        if (ghc) setBuildingId(ghc.id);
      })
      .catch((err) => {
        if (!cancelled) reportError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [reportError]);

  const options = useMemo(() => buildings.filter((b) => SANDBOX_CODES.includes(b.code)).map((b) => ({ value: b.id, label: b.name, subLabel: b.code })), [buildings]);
  const building = useMemo(() => buildings.find((b) => b.id === buildingId) ?? null, [buildings, buildingId]);

  const run = useCallback(async () => {
    if (!buildingId) return;
    setRunning(true);
    try {
      const p = await planEvacuation(buildingId, occupants, seed);
      setPlan(p);
      mapRef.current?.flyTo({ lng: p.building.lng, lat: p.building.lat, zoom: 18.1, pitch: 55, bearing: -20, duration: 1800 });
    } catch (err) {
      reportError(err);
    } finally {
      setRunning(false);
    }
  }, [buildingId, occupants, seed, reportError]);

  useEffect(() => {
    // A plan belongs to one building: drop it when the picker changes so stale flows never draw on another footprint.
    setPlan((current) => (current && building && current.building.id !== building.id ? null : current));
    if (building) mapRef.current?.flyTo({ lng: building.lng, lat: building.lat, zoom: 17.8, pitch: 55, bearing: -20, duration: 1500 });
  }, [building]);

  const exitColorIndex = useMemo(() => {
    const m = new Map<string, number>();
    plan?.baseline.exitLoads.forEach((l, i) => m.set(l.exit.id, i % EXIT_COLORS.length));
    return m;
  }, [plan]);
  const colorHex = (exitId: string) => EXIT_COLORS[exitColorIndex.get(exitId) ?? 0];
  const colorClass = (exitId: string) => `cp-exit-${exitColorIndex.get(exitId) ?? 0}`;

  const activeRun = plan ? (view === 'baseline' ? plan.baseline : plan.optimized) : null;

  const overlay = useMemo(() => {
    const lines: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] };
    const points: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] };
    if (!plan || !activeRun) return { lines, points };
    const exits = new Map(plan.baseline.exitLoads.map((l) => [l.exit.id, l.exit]));
    const assignment = new Map(activeRun.assignments.map((a) => [a.clusterId, a.exitId]));
    plan.clusters.forEach((c) => {
      const exitId = assignment.get(c.clusterId);
      const exit = exitId ? exits.get(exitId) : undefined;
      const color = exitId ? colorHex(exitId) : '#716052';
      points.features.push({ type: 'Feature', properties: { id: c.clusterId, color, r: 5 + Math.sqrt(c.count) * 1.1, stroke: '#fffdf7' }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } });
      if (exit) {
        lines.features.push({
          type: 'Feature',
          properties: { color, width: 1.5 + Math.min(6, c.count / 12) },
          geometry: {
            type: 'LineString',
            coordinates: [
              [c.lng, c.lat],
              [exit.lng, exit.lat],
            ],
          },
        });
      }
    });
    activeRun.exitLoads.forEach((l) => {
      points.features.push({ type: 'Feature', properties: { id: l.exit.id, color: colorHex(l.exit.id), r: 9, stroke: '#2b2118' }, geometry: { type: 'Point', coordinates: [l.exit.lng, l.exit.lat] } });
    });
    return { lines, points };
    // colorHex is derived from plan via exitColorIndex
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, activeRun, exitColorIndex]);

  const exitLabels = useMemo(
    () => (plan ? plan.baseline.exitLoads.map((l) => ({ id: l.exit.id, lng: l.exit.lng, lat: l.exit.lat, text: `${l.exit.name} → ${l.exit.assemblyPoint ?? 'assembly'}` })) : []),
    [plan]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--c3-style-basic-border-warning)] bg-[var(--c3-style-basic-bg-warning)] px-4 py-2 text-c3-bold-body-p3 text-foreground" role="note">
        <AlertTriangle className="size-4 shrink-0" />
        Planning simulation · Synthetic occupants · Not operational emergency guidance.
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[400px_1fr]">
        <aside className="flex min-h-0 flex-col gap-3 overflow-auto border-r border-border p-4">
          <h1 className="flex items-center gap-2 text-c3-bold-heading-h5 text-foreground">
            <Siren className="size-5" /> Evacuation-planning sandbox
          </h1>
          <p className="text-c3-regular-body-p3 text-muted-foreground">
            Places synthetic occupant clusters inside the real footprint, then compares a nearest-exit baseline with a capacity-aware assignment that penalises overloaded exits. Exit
            capacities are assumptions. Results are reproducible from the seed.
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="evac-building">Demo building</Label>
            <Combobox id="evac-building" options={options} value={buildingId} onValueChange={(v) => setBuildingId(v)} placeholder="Pick a building" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="evac-occ">Synthetic occupants</Label>
              <Input id="evac-occ" type="number" min={50} max={3000} step={50} value={occupants} onChange={(e) => setOccupants(Number(e.target.value))} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="evac-seed">Seed</Label>
              <Input id="evac-seed" type="number" min={1} max={9999} value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
            </div>
          </div>
          <Button variant="solid" appearance="accent" size="md" leadingIcon={<Play />} loading={running} disabled={!buildingId} onClick={run}>
            Run both strategies
          </Button>

          {plan ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <Tabs value={view} onValueChange={(v) => setView(v as 'baseline' | 'optimized')} variant="boxed" size="sm">
                  <TabsList>
                    <TabsTrigger value="baseline">Nearest exit</TabsTrigger>
                    <TabsTrigger value="optimized">Capacity-aware</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Badge variant="soft" appearance={plan.improvementPct > 0 ? 'success' : 'secondary'} size="md">
                  {plan.improvementPct > 0 ? `−${plan.improvementPct}% clearance time` : 'No improvement found'}
                </Badge>
              </div>
              <RunSummary run={plan.baseline} colorFor={colorClass} highlight={view === 'baseline'} />
              <RunSummary run={plan.optimized} colorFor={colorClass} highlight={view === 'optimized'} />
              <p className="text-c3-regular-body-p3 text-muted-foreground">
                {plan.occupants} synthetic occupants in {plan.clusters.length} clusters · seed {plan.seed} · {plan.disclaimer}
              </p>
            </>
          ) : null}
        </aside>
        <div className="relative min-h-[420px]">
          <CampusMap
            ref={mapRef}
            buildings={buildings}
            edges={[]}
            crowd={[]}
            layers={{ ...DEFAULT_LAYERS, crowd: false, route: false }}
            rain={false}
            route={null}
            selectedBuildingId={buildingId ?? undefined}
            rooms={[]}
            overlayLines={overlay.lines}
            overlayPoints={overlay.points}
            flyover={false}
            initialCamera={{ lng: -79.9445, lat: 40.4435, zoom: 17.6, pitch: 55, bearing: -20 }}
          >
            <PointLabels items={exitLabels} />
          </CampusMap>
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-sm border border-border bg-card/90 px-3 py-1.5 text-c3-regular-body-p3 text-muted-foreground">
            Dots = synthetic occupant clusters (size ∝ count) · dashed flows move toward their assigned exit · larger dots = exits
          </div>
        </div>
      </div>
    </div>
  );
}
