import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import CampusMap, { CampusMapHandle } from '@/components/map/CampusMap';
import { BuildingLabels, PinMarkers, RoomLabels } from '@/components/map/Markers';
import PlaceCard from '@/components/pulse/PlaceCard';
import ForecastCard from '@/components/pulse/ForecastCard';
import RoutePanel from '@/components/pulse/RoutePanel';
import FloorDirectory from '@/components/pulse/FloorDirectory';
import { AssistantSheet, CommandBar } from '@/components/pulse/Assistant';
import RainOverlay from '@/components/pulse/RainOverlay';
import { CAMERA_PRESETS, CameraPreset, LayerChips, ScenarioBar } from '@/components/pulse/Controls';
import {
  AssistantReply,
  CampusBuilding,
  CampusPin,
  CampusRoom,
  CrowdForecast,
  CrowdState,
  LayerId,
  LayerVisibility,
  LlmStatus,
  MapAction,
  NavEdgeGeo,
  NavNode,
  NavRoute,
  RouteMode,
  Scenario,
  Selection,
  ZoneRecommendation,
} from '@/Interfaces';
import {
  askAssistant,
  computeRoute,
  fetchBuildings,
  fetchLlmStatus,
  fetchOutdoorEdges,
  fetchPins,
  fetchRoom,
  fetchRooms,
  forecastZone,
  nearestNode,
  recommendZone,
  resetDemoClock,
  simulateCrowd,
} from '@/shared/campusApi';
import { DEFAULT_LAYERS, DEMO_MINUTE_OF_DAY, LEVEL_HEX, LEVEL_LABEL, PIN_LAYER, currentMinuteOfDay, defaultScenario } from '@/shared/campusTheme';
import '@/styles/campus-pulse.css';

const LABELLED_CODES = ['WEH', 'HL', 'GHC', 'DH', 'BH', 'PH', 'CUC', 'TEP', 'NSH', 'CFA', 'HH', 'PCA', 'POS', 'MM', 'HBH', 'CYH', 'WH', 'SC', 'MI'];
const FENCE = { lng: -79.9438, lat: 40.44285 };
const CROWD_POLL_MS = 6000;
const CLOCK_TICK_MS = 15000;

/** Tour script metadata (the step bodies live inside `tour()` so they see current state). */
const TOUR_STEP_LABELS = ['Flyover', 'Free food', 'Event pin', 'Ask: robotics', 'Ask: bathroom', 'Sorrells floor', 'Pin & predict', 'Rain on', 'Go to Hunt'];
const TOUR_STEP_COUNT = TOUR_STEP_LABELS.length;
const TOUR_SPEEDS = [0.5, 0.75, 1];
const TOUR_SPEED_KEY = 'campusPulse.tourSpeed';

interface TourStep {
  label: string;
  holdMs: number;
  run: () => void | Promise<void>;
}

interface TourHold {
  pause: () => void;
  resume: () => void;
  skip: () => void;
  cancel: () => void;
}

function readTourSpeed(): number {
  try {
    const stored = Number(window.localStorage.getItem(TOUR_SPEED_KEY));
    return TOUR_SPEEDS.includes(stored) ? stored : 0.75;
  } catch {
    return 0.75;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export default function MapHome() {
  const { reportError } = useErrorBoundary();
  const mapRef = useRef<CampusMapHandle>(null);
  const alive = useRef(true);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const topBarRef = useRef<HTMLDivElement | null>(null);

  const [buildings, setBuildings] = useState<CampusBuilding[]>([]);
  const [pins, setPins] = useState<CampusPin[]>([]);
  const [edges, setEdges] = useState<NavEdgeGeo[]>([]);
  const [crowd, setCrowd] = useState<CrowdState[]>([]);
  const [llm, setLlm] = useState<LlmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [scenario, setScenario] = useState<Scenario>(defaultScenario);
  const [demoClock, setDemoClock] = useState(false);
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [nowMs, setNowMs] = useState(Date.now());

  const [selection, setSelection] = useState<Selection>(null);
  const [rooms, setRooms] = useState<CampusRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  /** Room the assistant asked to open; applied once its floor is showing. */
  const pendingRoom = useRef<{ id: string; buildingId: string; floor: string } | null>(null);
  const [highlightPins, setHighlightPins] = useState<Set<string>>(new Set());

  const [forecastZoneId, setForecastZoneId] = useState<string | null>(null);
  const [forecast, setForecast] = useState<CrowdForecast | null>(null);
  const [recommendation, setRecommendation] = useState<ZoneRecommendation | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  const [origin, setOrigin] = useState<NavNode | null>(null);
  const [routeReq, setRouteReq] = useState<{ from: string; to: string } | null>(null);
  const [routeMode, setRouteMode] = useState<RouteMode>('Fast');
  const [stepFree, setStepFree] = useState(false);
  const [route, setRoute] = useState<NavRoute | null>(null);
  const [altRoute, setAltRoute] = useState<NavRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [following, setFollowing] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  const [question, setQuestion] = useState('');
  const [askedQuestion, setAskedQuestion] = useState('');
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const [touring, setTouring] = useState(false);
  const [tourPaused, setTourPaused] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [tourSpeed, setTourSpeed] = useState<number>(() => readTourSpeed());
  const tourRun = useRef(0);
  const tourIndexRef = useRef(0);
  const tourPausedRef = useRef(false);
  const tourSpeedRef = useRef(tourSpeed);
  const tourJump = useRef<number | null>(null);
  const tourHold = useRef<TourHold | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [crowdError, setCrowdError] = useState<string | null>(null);
  const crowdErrorReported = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* ------------------------------------------------------------- initial load ------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, e, status] = await Promise.all([fetchBuildings(), fetchOutdoorEdges(), fetchLlmStatus()]);
        try {
          await resetDemoClock();
        } catch (clockErr) {
          // Re-anchoring is a convenience for the demo; a read-only user still gets the map.
          reportError(clockErr);
        }
        const p = await fetchPins();
        if (cancelled) return;
        setBuildings(b);
        setEdges(e);
        setLlm(status);
        setPins(p);
        const start = await nearestNode(FENCE.lng, FENCE.lat);
        if (!cancelled) setOrigin(start);
      } catch (err) {
        if (!cancelled) {
          setLoadError((err as Error).message);
          reportError(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportError]);

  /* The toolbar wraps on narrow screens; keep the side panels below it by measuring its height into a CSS variable. */
  useEffect(() => {
    const bar = topBarRef.current;
    const scene = sceneRef.current;
    if (!bar || !scene) return undefined;
    const apply = () => scene.style.setProperty('--cp-top-offset', `${Math.ceil(bar.getBoundingClientRect().height) + 20}px`);
    apply();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  /* ------------------------------------------------------------- clocks ------------------------------------------------------------- */
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setScenario((s) => ({ ...s, minuteOfDay: demoClock ? DEMO_MINUTE_OF_DAY : currentMinuteOfDay() }));
  }, [demoClock]);

  /* ------------------------------------------------------------- crowd polling ------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const sc = demoClock ? scenario : { ...scenario, minuteOfDay: currentMinuteOfDay() };
        const states = await simulateCrowd(sc);
        if (cancelled) return;
        setCrowd(states);
        setCrowdError(null);
        crowdErrorReported.current = false;
      } catch (err) {
        if (cancelled) return;
        setCrowdError((err as Error).message);
        // Report the first failure; keep polling quietly so a transient outage recovers on its own.
        if (!crowdErrorReported.current) {
          crowdErrorReported.current = true;
          reportError(err);
        }
      }
    };
    tick();
    const id = window.setInterval(tick, CROWD_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [scenario, demoClock, reportError]);

  /* ------------------------------------------------------------- open floor ------------------------------------------------------------- */
  // A floor is open when a building floor is selected, or when an indoor pin sits on a floor we have rooms for.
  const floorBuilding = useMemo((): CampusBuilding | undefined => {
    if (selection?.type === 'building') return selection.floor ? selection.building : undefined;
    if (selection?.type === 'pin' && selection.pin.building && selection.pin.floor) {
      const b = buildings.find((x) => x.id === selection.pin.building?.id);
      return b && b.schematicFloors?.includes(selection.pin.floor) ? b : undefined;
    }
    return undefined;
  }, [selection, buildings]);
  const openFloor = floorBuilding ? (selection?.type === 'building' ? selection.floor : selection?.type === 'pin' ? selection.pin.floor : undefined) : undefined;
  const floorBuildingId = floorBuilding?.id;

  /* ------------------------------------------------------------- rooms for the open floor ------------------------------------------------------------- */
  useEffect(() => {
    if (!floorBuildingId || !openFloor) {
      setRooms([]);
      return undefined;
    }
    let cancelled = false;
    setRoomsLoading(true);
    fetchRooms(floorBuildingId, openFloor)
      .then((r) => {
        if (!cancelled) setRooms(r);
      })
      .catch((err) => {
        if (!cancelled) reportError(err);
      })
      .finally(() => {
        if (!cancelled) setRoomsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [floorBuildingId, openFloor, reportError]);

  // A room selection belongs to one floor: drop it when the floor changes, unless the assistant queued a room there.
  useEffect(() => {
    const p = pendingRoom.current;
    if (p && p.buildingId === floorBuildingId && p.floor === openFloor) {
      pendingRoom.current = null;
      setSelectedRoomId(p.id);
      return;
    }
    setSelectedRoomId(null);
  }, [floorBuildingId, openFloor]);

  /* ------------------------------------------------------------- forecast follows scenario ------------------------------------------------------------- */
  useEffect(() => {
    if (!forecastZoneId) return undefined;
    let cancelled = false;
    setForecastLoading(true);
    Promise.all([forecastZone(forecastZoneId, scenario), recommendZone(forecastZoneId, scenario)])
      .then(([f, r]) => {
        if (cancelled) return;
        setForecast(f);
        setRecommendation(r);
      })
      .catch((err) => {
        if (!cancelled) reportError(err);
      })
      .finally(() => {
        if (!cancelled) setForecastLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [forecastZoneId, scenario, reportError]);

  /* ------------------------------------------------------------- route follows request / mode / scenario ------------------------------------------------------------- */
  useEffect(() => {
    if (!routeReq) {
      setRoute(null);
      setAltRoute(null);
      return undefined;
    }
    let cancelled = false;
    setRouteLoading(true);
    const other: RouteMode = routeMode === 'Fast' ? 'Calm' : 'Fast';
    Promise.all([computeRoute(routeReq.from, routeReq.to, routeMode, stepFree, scenario), computeRoute(routeReq.from, routeReq.to, other, stepFree, scenario)])
      .then(([main, alt]) => {
        if (cancelled) return;
        setRoute(main);
        setAltRoute(alt);
      })
      .catch((err) => {
        if (!cancelled) reportError(err);
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [routeReq, routeMode, stepFree, scenario, reportError]);

  /* ------------------------------------------------------------- route follow ------------------------------------------------------------- */
  useEffect(() => {
    if (!following || !route || !route.steps || route.steps.length === 0) return undefined;
    let cancelled = false;
    const steps = route.steps;
    (async () => {
      for (let i = 0; i < steps.length; i++) {
        if (cancelled) return;
        setActiveStep(i);
        const s = steps[i];
        mapRef.current?.flyTo({ lng: s.lng, lat: s.lat, zoom: 18.6, pitch: 66, duration: 1800 });
        if (s.floor && route.toNode.building) {
          const b = buildings.find((x) => x.id === route.toNode.building?.id || x.code === s.buildingCode);
          if (b && b.schematicFloors?.includes(s.floor)) setSelection({ type: 'building', building: b, floor: s.floor });
        }
        await sleep(2600);
      }
      if (!cancelled) {
        await sleep(2500);
        if (!cancelled) setFollowing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [following, route, buildings]);

  /* ------------------------------------------------------------- helpers ------------------------------------------------------------- */
  const crowdByZone = useMemo(() => new Map(crowd.map((s) => [s.zone.id, s])), [crowd]);
  const crowdForBuilding = useCallback(
    (buildingId: string, floor?: string): CrowdState | undefined => {
      const candidates = crowd.filter((s) => s.zone.building?.id === buildingId);
      if (floor) {
        const f = candidates.find((s) => s.zone.floor === floor);
        if (f) return f;
      }
      return candidates.find((s) => !s.zone.floor) ?? candidates[0];
    },
    [crowd]
  );

  const floorHasRestrooms = useMemo(() => rooms.some((r) => r.kind === 'Restroom'), [rooms]);
  const visiblePins = useMemo(() => {
    const selectedPinId = selection?.type === 'pin' ? selection.pin.id : undefined;
    return pins.filter((p) => {
      if (!layers[PIN_LAYER[p.kind]]) return false;
      if (floorBuildingId && p.building?.id === floorBuildingId && p.id !== selectedPinId) {
        // While a floor is open, only that floor's pins show inside the building so the floor view stays readable.
        if (p.floor && p.floor !== openFloor) return false;
        // The floor plan already marks its restrooms with icons.
        if (p.kind === 'Bathroom' && p.floor === openFloor && floorHasRestrooms) return false;
      }
      return true;
    });
  }, [pins, layers, selection, floorBuildingId, openFloor, floorHasRestrooms]);

  const flashHint = useCallback((text: string) => {
    setHint(text);
    window.setTimeout(() => setHint((h) => (h === text ? null : h)), 3500);
  }, []);

  const patchScenario = useCallback((patch: Partial<Scenario>) => setScenario((s) => ({ ...s, ...patch })), []);

  const toggleLayer = useCallback((id: LayerId) => setLayers((l) => ({ ...l, [id]: !l[id] })), []);

  const selectPin = useCallback(
    (pin: CampusPin, fly = true) => {
      setSelection({ type: 'pin', pin });
      setLayers((l) => (l[PIN_LAYER[pin.kind]] ? l : { ...l, [PIN_LAYER[pin.kind]]: true }));
      if (fly) mapRef.current?.flyTo({ lng: pin.lng, lat: pin.lat, zoom: 18.2, pitch: 60, duration: 1400 });
    },
    []
  );

  const selectBuilding = useCallback(
    (buildingId: string, floor?: string, fly = true) => {
      const b = buildings.find((x) => x.id === buildingId);
      if (!b) return;
      setSelection({ type: 'building', building: b, floor: floor && b.schematicFloors?.includes(floor) ? floor : undefined });
      if (fly) mapRef.current?.flyTo({ lng: b.lng, lat: b.lat, zoom: floor ? 18.3 : 17.4, pitch: floor ? 55 : 60, duration: 1400 });
    },
    [buildings]
  );

  const openForecast = useCallback(
    (zoneId: string, fly = true) => {
      setForecastZoneId(zoneId);
      setLayers((l) => (l.crowd ? l : { ...l, crowd: true }));
      const st = crowdByZone.get(zoneId);
      if (fly && st) mapRef.current?.flyTo({ lng: st.zone.lng, lat: st.zone.lat, zoom: 17.6, pitch: 60, duration: 1400 });
    },
    [crowdByZone]
  );

  const zoneIdForSelection = useCallback((): string | null => {
    if (!selection) return null;
    if (selection.type === 'building') return crowdForBuilding(selection.building.id, selection.floor)?.zone.id ?? null;
    if (selection.pin.building) return crowdForBuilding(selection.pin.building.id, selection.pin.floor)?.zone.id ?? null;
    return null;
  }, [selection, crowdForBuilding]);

  const ensureOrigin = useCallback(async (): Promise<NavNode | null> => {
    if (origin) return origin;
    const n = await nearestNode(FENCE.lng, FENCE.lat);
    setOrigin(n);
    return n;
  }, [origin]);

  const routeTo = useCallback(
    async (lng: number, lat: number, buildingCode?: string, floor?: string) => {
      try {
        const [from, to] = await Promise.all([ensureOrigin(), nearestNode(lng, lat, buildingCode, floor)]);
        if (!from || !to) throw new Error('Could not snap the destination to the campus nav graph.');
        if (from.id === to.id) {
          flashHint('You are already at that spot. Click the map to move your start point.');
          return;
        }
        setLayers((l) => (l.route ? l : { ...l, route: true }));
        setRouteReq({ from: from.id, to: to.id });
      } catch (err) {
        reportError(err);
      }
    },
    [ensureOrigin, flashHint, reportError]
  );

  const routeToNode = useCallback(
    async (nodeId: string) => {
      try {
        const from = await ensureOrigin();
        if (!from) throw new Error('Could not find a start point on the campus nav graph.');
        if (from.id === nodeId) {
          flashHint('You are already there. Click the map to move your start point.');
          return;
        }
        setLayers((l) => (l.route ? l : { ...l, route: true }));
        setRouteReq({ from: from.id, to: nodeId });
      } catch (err) {
        reportError(err);
      }
    },
    [ensureOrigin, flashHint, reportError]
  );

  const navigateToRoom = useCallback(
    (room: CampusRoom) => {
      if (room.navNode?.id) routeToNode(room.navNode.id);
      else {
        const b = buildings.find((x) => x.id === room.building.id);
        const pts = room.outline;
        routeTo(room.labelLng ?? pts[0].lng, room.labelLat ?? pts[0].lat, b?.code, room.floor);
      }
    },
    [buildings, routeTo, routeToNode]
  );

  const selectRoom = useCallback(
    (room: CampusRoom, fly = true) => {
      setSelectedRoomId(room.id);
      // Keep the floor open on the building card (an indoor pin card would close it when the pin is dismissed).
      const b = buildings.find((x) => x.id === room.building.id);
      if (b && selection?.type === 'pin') setSelection({ type: 'building', building: b, floor: room.floor });
      if (fly && room.labelLng != null && room.labelLat != null) mapRef.current?.flyTo({ lng: room.labelLng, lat: room.labelLat, zoom: 19, duration: 900 });
    },
    [buildings, selection]
  );

  const onRoomClick = useCallback(
    (roomId: string) => {
      const r = rooms.find((x) => x.id === roomId);
      if (r) selectRoom(r, false);
    },
    [rooms, selectRoom]
  );

  const openRoomById = useCallback(
    async (roomId: string) => {
      try {
        const room = await fetchRoom(roomId);
        if (!room) return;
        const b = buildings.find((x) => x.id === room.building.id);
        if (!b) return;
        pendingRoom.current = { id: room.id, buildingId: b.id, floor: room.floor };
        if (floorBuildingId === b.id && openFloor === room.floor) {
          pendingRoom.current = null;
          setSelectedRoomId(room.id);
        }
        setSelection({ type: 'building', building: b, floor: room.floor });
      } catch (err) {
        reportError(err);
      }
    },
    [buildings, floorBuildingId, openFloor, reportError]
  );

  const navigateToSelection = useCallback(() => {
    if (!selection) return;
    if (selection.type === 'pin') routeTo(selection.pin.lng, selection.pin.lat, selection.pin.building?.code, selection.pin.floor);
    else routeTo(selection.building.lng, selection.building.lat, selection.building.code, selection.floor);
  }, [selection, routeTo]);

  const goAlternative = useCallback(
    (zoneId: string) => {
      const st = crowdByZone.get(zoneId);
      if (!st) return;
      setRouteMode('Calm');
      routeTo(st.zone.lng, st.zone.lat, st.zone.building?.code, st.zone.floor);
      if (st.zone.building) selectBuilding(st.zone.building.id, st.zone.floor, false);
      mapRef.current?.flyTo({ lng: st.zone.lng, lat: st.zone.lat, zoom: 17.4, pitch: 60, duration: 1600 });
    },
    [crowdByZone, routeTo, selectBuilding]
  );

  /* ------------------------------------------------------------- map actions from the assistant ------------------------------------------------------------- */
  const runActions = useCallback(
    async (actions: MapAction[] | undefined, replyPins: CampusPin[] | undefined) => {
      if (!actions) return;
      const hl = new Set<string>();
      for (const a of actions) {
        if (!alive.current) return;
        switch (a.kind) {
          case 'Set layer':
            if (a.layer) setLayers((l) => ({ ...l, [a.layer as LayerId]: true }));
            break;
          case 'Set scenario':
            setScenario((s) => ({ ...s, rain: a.rain ?? s.rain, eventNearby: a.eventNearby ?? s.eventNearby, examWeek: a.examWeek ?? s.examWeek }));
            break;
          case 'Fly to':
            if (a.lng != null && a.lat != null) mapRef.current?.flyTo({ lng: a.lng, lat: a.lat, zoom: a.zoom ?? 17.5, pitch: 60, duration: 1600 });
            break;
          case 'Open pin': {
            const pin = pins.find((p) => p.id === a.targetId) ?? replyPins?.find((p) => p.id === a.targetId);
            if (pin) selectPin(pin, false);
            break;
          }
          case 'Highlight':
            if (a.targetId) hl.add(a.targetId);
            break;
          case 'Draw route':
            if (a.fromNodeId && a.toNodeId) {
              setRouteMode(a.mode ?? 'Fast');
              setStepFree(!!a.stepFree);
              setLayers((l) => (l.route ? l : { ...l, route: true }));
              setRouteReq({ from: a.fromNodeId, to: a.toNodeId });
            }
            break;
          case 'Show forecast':
            if (a.targetId) openForecast(a.targetId, false);
            break;
          case 'Select building':
            if (a.targetId) selectBuilding(a.targetId, a.floor, false);
            break;
          case 'Select room':
            if (a.targetId) await openRoomById(a.targetId);
            break;
          default:
            break;
        }
        await sleep(120);
      }
      setHighlightPins(hl);
      window.setTimeout(() => setHighlightPins(new Set()), 9000);
    },
    [pins, selectPin, openForecast, selectBuilding, openRoomById]
  );

  const ask = useCallback(
    async (text: string) => {
      setAssistantOpen(true);
      setAsking(true);
      setAskError(null);
      setAskedQuestion(text);
      setQuestion('');
      try {
        const r = await askAssistant(text, scenario, origin ? { lng: origin.lng, lat: origin.lat } : FENCE);
        if (!alive.current) return;
        setReply(r);
        await runActions(r.actions, r.pins);
      } catch (err) {
        if (alive.current) {
          setAskError((err as Error).message);
          reportError(err);
        }
      } finally {
        if (alive.current) setAsking(false);
      }
    },
    [scenario, origin, runActions, reportError]
  );

  /* ------------------------------------------------------------- tour ------------------------------------------------------------- */
  /** Ends the running tour immediately: the current hold resolves, later steps see a stale run id and bail out. */
  const stopTour = useCallback(() => {
    tourRun.current += 1;
    tourHold.current?.cancel();
    tourPausedRef.current = false;
    setTourPaused(false);
    setTouring(false);
    flashHint('Tour stopped — the map is yours.');
  }, [flashHint]);

  const pauseTour = useCallback(() => {
    tourPausedRef.current = true;
    setTourPaused(true);
    tourHold.current?.pause();
  }, []);

  const resumeTour = useCallback(() => {
    tourPausedRef.current = false;
    setTourPaused(false);
    tourHold.current?.resume();
  }, []);

  const jumpTour = useCallback((delta: number) => {
    const target = Math.max(0, Math.min(TOUR_STEP_COUNT - 1, tourIndexRef.current + delta));
    tourJump.current = target;
    tourHold.current?.skip();
  }, []);

  const cycleTourSpeed = useCallback(() => {
    const next = TOUR_SPEEDS[(TOUR_SPEEDS.indexOf(tourSpeedRef.current) + 1) % TOUR_SPEEDS.length];
    tourSpeedRef.current = next;
    setTourSpeed(next);
    window.localStorage.setItem(TOUR_SPEED_KEY, String(next));
  }, []);

  const tour = useCallback(async () => {
    if (touring) return;
    const run = ++tourRun.current;
    const live = () => alive.current && tourRun.current === run;
    tourPausedRef.current = false;
    tourJump.current = null;
    setTourPaused(false);
    setTouring(true);

    /* Script: each step does one thing, then holds (scaled by speed) so the presenter can talk. */
    const steps: TourStep[] = [
      {
        label: 'Flyover',
        holdMs: 4500,
        run: async () => {
          try {
            await resetDemoClock();
            const fresh = await fetchPins();
            if (live()) setPins(fresh);
          } catch (clockErr) {
            reportError(clockErr);
          }
          if (!live()) return;
          setDemoClock(true);
          setScenario((sc) => ({ ...sc, rain: false, minuteOfDay: DEMO_MINUTE_OF_DAY }));
          setSelection(null);
          setRouteReq(null);
          setForecastZoneId(null);
          setAssistantOpen(false);
          mapRef.current?.flyTo({ ...CAMERA_PRESETS[0], duration: 4000 });
        },
      },
      {
        label: 'Free food',
        holdMs: 4500,
        run: () => {
          const pizza = pins.find((p) => p.id === 'pin_food_pizza_cuc') ?? pins.find((p) => p.kind === 'Food');
          if (pizza) selectPin(pizza);
        },
      },
      {
        label: 'Event pin',
        holdMs: 4500,
        run: () => {
          const robotics = pins.find((p) => p.id === 'pin_evt_robotics_nsh') ?? pins.find((p) => p.kind === 'Event');
          if (robotics) selectPin(robotics);
        },
      },
      { label: 'Ask: robotics', holdMs: 6000, run: () => ask('anything interesting related to robotics today?') },
      { label: 'Ask: bathroom', holdMs: 7500, run: () => ask('closest bathroom to Hunt Library 2nd floor') },
      {
        label: 'Sorrells floor',
        holdMs: 2500,
        run: () => {
          setAssistantOpen(false);
          setRouteReq(null);
          const wean = buildings.find((b) => b.code === 'WEH');
          if (wean) selectBuilding(wean.id, '4');
        },
      },
      { label: 'Pin & predict', holdMs: 4500, run: () => openForecast('zone_sorrells') },
      { label: 'Rain on', holdMs: 7000, run: () => patchScenario({ rain: true }) },
      { label: 'Go to Hunt', holdMs: 7000, run: () => goAlternative('zone_hunt') },
    ];

    /* Waits `ms / speed`, honouring pause/resume, skip (Prev/Next) and cancel (Stop). Resolves false when the run is over. */
    const hold = (ms: number) =>
      new Promise<boolean>((resolve) => {
        let remaining = ms / tourSpeedRef.current;
        let startedAt = 0;
        let timer: number | null = null;
        const finish = (ok: boolean) => {
          if (timer !== null) window.clearTimeout(timer);
          timer = null;
          tourHold.current = null;
          resolve(ok && live());
        };
        const startTimer = () => {
          startedAt = Date.now();
          timer = window.setTimeout(() => finish(true), remaining);
        };
        tourHold.current = {
          pause: () => {
            if (timer !== null) {
              window.clearTimeout(timer);
              timer = null;
              remaining = Math.max(0, remaining - (Date.now() - startedAt));
            }
          },
          resume: () => {
            if (timer === null) startTimer();
          },
          skip: () => finish(true),
          cancel: () => finish(false),
        };
        if (!tourPausedRef.current) startTimer();
      });

    try {
      for (let i = 0; i < steps.length; i++) {
        if (!live()) return;
        tourIndexRef.current = i;
        setTourIndex(i);
        await steps[i].run();
        if (!live()) return;
        const ok = await hold(steps[i].holdMs);
        if (!ok) return;
        if (tourJump.current !== null) {
          i = tourJump.current - 1;
          tourJump.current = null;
        }
      }
    } finally {
      if (live()) {
        setTouring(false);
        setTourPaused(false);
        tourPausedRef.current = false;
      }
    }
  }, [touring, pins, buildings, selectPin, ask, selectBuilding, openForecast, patchScenario, goAlternative, reportError]);

  // Keyboard: Esc stops, Space pauses/resumes, ←/→ step — only when focus is not in a control.
  useEffect(() => {
    if (!touring) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopTour();
        return;
      }
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      // Space/arrows only when focus is not in a control (a focused button handles Space itself).
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(tag) || target?.isContentEditable) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (tourPausedRef.current) resumeTour();
        else pauseTour();
      } else if (e.key === 'ArrowRight') jumpTour(1);
      else if (e.key === 'ArrowLeft') jumpTour(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [touring, stopTour, pauseTour, resumeTour, jumpTour]);

  /* ------------------------------------------------------------- map callbacks ------------------------------------------------------------- */
  const onBuildingClick = useCallback((id: string) => selectBuilding(id, undefined, false), [selectBuilding]);

  const onMapClick = useCallback(
    async (ll: { lng: number; lat: number }) => {
      if (touring && !tourPaused) {
        flashHint('Tour running — pause (Space) or stop (Esc) to take over.');
        return;
      }
      try {
        const n = await nearestNode(ll.lng, ll.lat);
        if (n) {
          setOrigin(n);
          flashHint(`Start point set: ${n.label ?? 'outdoor path'}`);
          if (routeReq) setRouteReq({ from: n.id, to: routeReq.to });
        }
      } catch (err) {
        reportError(err);
      }
    },
    [touring, tourPaused, routeReq, flashHint, reportError]
  );

  const onPreset = useCallback((p: CameraPreset) => mapRef.current?.flyTo({ ...p, duration: 2200 }), []);

  const swapRoute = useCallback(() => {
    if (routeReq) setRouteReq({ from: routeReq.to, to: routeReq.from });
  }, [routeReq]);

  const selectedBuildingId = selection?.type === 'building' ? selection.building.id : selection?.type === 'pin' ? selection.pin.building?.id : undefined;
  const selectedFloor = openFloor;
  const forecastZoneState = forecastZoneId ? crowdByZone.get(forecastZoneId) : undefined;
  const selectionCrowd = selection?.type === 'building' ? crowdForBuilding(selection.building.id, selection.floor) : undefined;

  return (
    <div ref={sceneRef} className="cp-scene relative h-full w-full overflow-hidden [--cp-top-offset:92px]">
      <CampusMap
        ref={mapRef}
        buildings={buildings}
        edges={edges}
        crowd={crowd}
        layers={layers}
        rain={scenario.rain}
        route={layers.route ? route : null}
        selectedBuildingId={selectedBuildingId}
        selectedFloor={selectedFloor}
        rooms={rooms}
        selectedRoomId={selectedRoomId ?? undefined}
        highlightZoneId={forecastZoneState?.zone.id}
        onBuildingClick={onBuildingClick}
        onRoomClick={onRoomClick}
        onMapClick={onMapClick}
      >
        <BuildingLabels buildings={buildings} codes={LABELLED_CODES} />
        <PinMarkers pins={visiblePins} selectedId={selection?.type === 'pin' ? selection.pin.id : undefined} highlightIds={highlightPins} nowMs={nowMs} onSelect={(p) => selectPin(p, false)} />
        {selectedFloor ? <RoomLabels rooms={rooms} selectedId={selectedRoomId ?? undefined} onSelect={(r) => selectRoom(r, false)} /> : null}
      </CampusMap>

      <RainOverlay active={scenario.rain} />

      {/* top bar */}
      <div ref={topBarRef} className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-wrap items-start gap-2">
        <div className="pointer-events-auto w-full max-w-[560px] flex-1">
          <CommandBar value={question} loading={asking} llm={llm} onChange={setQuestion} onSubmit={ask} />
        </div>
        <div className="pointer-events-auto flex-1 min-w-[320px]">
          <ScenarioBar
            scenario={scenario}
            demoClock={demoClock}
            touring={touring}
            tour={{ paused: tourPaused, index: tourIndex, total: TOUR_STEP_COUNT, label: TOUR_STEP_LABELS[tourIndex] ?? '', speed: tourSpeed }}
            llmConfigured={!!llm?.configured}
            onScenario={patchScenario}
            onDemoClock={setDemoClock}
            onPreset={onPreset}
            onTour={tour}
            onStopTour={stopTour}
            onPauseTour={pauseTour}
            onResumeTour={resumeTour}
            onPrevStep={() => jumpTour(-1)}
            onNextStep={() => jumpTour(1)}
            onCycleSpeed={cycleTourSpeed}
          />
        </div>
      </div>

      {/* left rail */}
      <div className="absolute left-3 top-[var(--cp-top-offset)] z-10">
        <LayerChips layers={layers} onToggle={toggleLayer} />
      </div>

      {/* right stack */}
      <div className="cp-scroll pointer-events-none absolute bottom-3 right-3 top-[var(--cp-top-offset)] z-10 flex w-[390px] max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 overflow-y-auto">
        {assistantOpen ? (
          <div className="pointer-events-auto">
            <AssistantSheet reply={reply} question={askedQuestion} error={askError} loading={asking} onPin={(p) => selectPin(p)} onClose={() => setAssistantOpen(false)} onPick={ask} />
          </div>
        ) : null}
        {selection ? (
          <div className="pointer-events-auto">
            <PlaceCard
              selection={selection}
              crowdForBuilding={selectionCrowd}
              nowMs={nowMs}
              onClose={() => setSelection(null)}
              onNavigate={navigateToSelection}
              onPredict={zoneIdForSelection() ? () => openForecast(zoneIdForSelection() as string) : undefined}
              onAsk={() => {
                setAssistantOpen(true);
                setQuestion(selection.type === 'pin' ? `tell me about ${selection.pin.name}` : `will ${selection.building.name} be busy?`);
              }}
              onFloor={(f) => selection.type === 'building' && selectBuilding(selection.building.id, f, !!f)}
            />
          </div>
        ) : null}
        {floorBuilding && openFloor ? (
          <div className="pointer-events-auto">
            <FloorDirectory
              key={`${floorBuilding.id}-${openFloor}`}
              building={floorBuilding}
              floor={openFloor}
              rooms={rooms}
              loading={roomsLoading}
              selectedRoomId={selectedRoomId ?? undefined}
              onSelect={(r) => selectRoom(r)}
              onClear={() => setSelectedRoomId(null)}
              onNavigate={navigateToRoom}
            />
          </div>
        ) : null}
        {forecast && forecastZoneId ? (
          <div className="pointer-events-auto">
            <ForecastCard
              forecast={forecast}
              recommendation={recommendation}
              scenario={scenario}
              loading={forecastLoading}
              onScenario={patchScenario}
              onGoAlternative={goAlternative}
              onClose={() => {
                setForecastZoneId(null);
                setForecast(null);
                setRecommendation(null);
              }}
            />
          </div>
        ) : null}
        {routeReq ? (
          <div className="pointer-events-auto">
            <RoutePanel
              route={route}
              altRoute={altRoute}
              mode={routeMode}
              stepFree={stepFree}
              loading={routeLoading}
              following={following}
              activeStep={activeStep}
              onMode={setRouteMode}
              onStepFree={setStepFree}
              onStart={() => {
                setActiveStep(0);
                setFollowing(true);
              }}
              onEnd={() => setFollowing(false)}
              onClose={() => {
                setFollowing(false);
                setRouteReq(null);
              }}
              onSwap={swapRoute}
            />
          </div>
        ) : null}
      </div>

      {/* bottom-left legend + origin (single line; never under the attribution control) */}
      <div className="pointer-events-none absolute bottom-10 left-3 flex max-w-[calc(100%-80px)] flex-col items-start gap-2">
        {hint ? <div className="cp-glass pointer-events-auto px-3 py-1.5 text-[12px] font-semibold text-[var(--cp-ink)]">{hint}</div> : null}
        <div className="cp-glass pointer-events-auto flex max-w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 py-1.5 text-[11px] text-[var(--cp-muted)]">
          <span className="flex shrink-0 items-center gap-1 font-semibold text-[var(--cp-ink)]">
            <MapPin className="size-3.5 text-[var(--cp-terracotta)]" /> Start: {origin?.label ?? 'The Fence'}
          </span>
          <span className="hidden shrink-0 lg:inline">· click the map to move it</span>
          <span className="h-4 w-px shrink-0 bg-[var(--cp-border)]/50" aria-hidden />
          <span className="flex shrink-0 items-center gap-1" aria-label="Crowd level legend">
            {LEVEL_HEX.map((hex, i) => (
              <span key={hex} className={`rounded px-1 text-[10px] font-semibold cp-level-${i}`}>
                {LEVEL_LABEL[i]}
              </span>
            ))}
          </span>
          <span className="hidden truncate 2xl:inline">· footprints real (CMU Maps) · floors, pins &amp; crowds labelled demo</span>
          {crowdError ? (
            <span className="shrink-0 rounded bg-[var(--cp-level-4)] px-1.5 text-[10px] font-bold text-white" title={crowdError}>
              crowd feed offline
            </span>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="absolute inset-0 grid place-items-center bg-[var(--cp-cream)]/70">
          <div className="cp-glass flex items-center gap-2 px-4 py-3 text-[13px] font-semibold text-[var(--cp-ink)]">
            <Loader2 className="size-4 animate-spin" /> Loading campus…
          </div>
        </div>
      ) : null}
      {loadError ? (
        <div className="absolute bottom-16 left-1/2 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2" role="alert">
          <div className="cp-glass flex items-start gap-2 border-[var(--cp-rust)] p-3 text-[13px] text-[var(--cp-rust)]">
            <span className="flex-1">Could not load campus data: {loadError}</span>
            <button type="button" className="cp-btn-secondary !min-h-7 !px-1.5" aria-label="Dismiss" onClick={() => setLoadError(null)}>
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
