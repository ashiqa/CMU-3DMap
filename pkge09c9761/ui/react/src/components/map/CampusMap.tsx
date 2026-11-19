import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource, Map as MlMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';
import { CampusBuilding, CampusRoom, CrowdState, LayerVisibility, NavEdgeGeo, NavRoute, RoomKind } from '@/Interfaces';
import { CAMPUS_CENTER, LEVEL_HEX, ROOM_HEX, buildingColor, floorIndex, mixHex } from '@/shared/campusTheme';
import { MapContext, isLiveMap, trackMapLifecycle } from './mapContext';

export interface CameraTarget {
  lng: number;
  lat: number;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  duration?: number;
}

export interface CampusMapHandle {
  flyTo(target: CameraTarget): void;
  getMap(): MlMap | null;
}

interface CampusMapProps {
  buildings: CampusBuilding[];
  edges: NavEdgeGeo[];
  crowd: CrowdState[];
  layers: LayerVisibility;
  rain: boolean;
  route: NavRoute | null;
  selectedBuildingId?: string;
  selectedFloor?: string;
  rooms: CampusRoom[];
  /** Room drawn raised in Carnegie Red on the open floor. */
  selectedRoomId?: string;
  highlightZoneId?: string;
  /** Generic overlay lines (e.g. evacuation flows); features carry `color` and `width`. */
  overlayLines?: FeatureCollection<LineString>;
  /** Generic overlay points (e.g. occupant clusters, exits); features carry `color`, `r`, `stroke`. */
  overlayPoints?: FeatureCollection<Point>;
  interactive?: boolean;
  initialCamera?: CameraTarget;
  flyover?: boolean;
  onBuildingClick?: (buildingId: string) => void;
  /** Click on a room of the open floor; when set, clicks inside the open building no longer re-select the shell. */
  onRoomClick?: (roomId: string) => void;
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  className?: string;
  children?: React.ReactNode;
}

/* OpenFreeMap vector tiles (OpenMapTiles schema): free, no API key. Styled below in the warm palette. */
const STREETS_TILEJSON = 'https://tiles.openfreemap.org/planet';
const STREET_LAYER_IDS = ['streets-park', 'streets-landuse', 'streets-water', 'streets-osm-buildings', 'streets-road-minor', 'streets-road-major', 'streets-road-centre', 'streets-path'];
const FOOTPRINT_ATTRIBUTION = 'Footprints: ScottyLabs CMU Maps';

/** Extrusion height (m) of a room block above its floor: halls stay flat so rooms read as walled spaces. */
const ROOM_TOP: Partial<Record<RoomKind, number>> = { Corridor: 0.4, Lobby: 0.4, Utility: 1.8, Storage: 1.8, Service: 2.0, Stairs: 3.0, Elevator: 3.2 };

/* Realistic ground palette (dry / overcast-rain). */
const GROUND = {
  dry: { bg: '#e9e4da', park: '#8fae6b', grass: '#a3bc84', water: '#9dbccb', osm: '#ded6c6', osmLine: '#cfc5b2', roadMinor: '#cbc8c1', roadMajor: '#b8b5ae', osmPath: '#f4f1ea', path: '#f6f3ec', pathCasing: '#c8c2b4' },
  rain: { bg: '#d3d1cb', park: '#6e8a55', grass: '#7f9468', water: '#86a0ad', osm: '#c6c0b4', osmLine: '#b3ab9d', roadMinor: '#a9a7a2', roadMajor: '#96948f', osmPath: '#d8d5ce', path: '#dedbd3', pathCasing: '#a9a49a' },
};

const FLOOR_M = 3.8;

const baseStyle = (streets: boolean): StyleSpecification => ({
  version: 8,
  sources: {
    streets: { type: 'vector', url: STREETS_TILEJSON },
    buildings: { type: 'geojson', data: emptyFc(), attribution: FOOTPRINT_ATTRIBUTION },
    paths: { type: 'geojson', data: emptyFc() },
    crowd: { type: 'geojson', data: emptyFc() },
    rooms: { type: 'geojson', data: emptyFc() },
    route: { type: 'geojson', data: emptyFc() },
    routeEnds: { type: 'geojson', data: emptyFc() },
    overlayLines: { type: 'geojson', data: emptyFc() },
    overlayPoints: { type: 'geojson', data: emptyFc() },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': GROUND.dry.bg } },
    {
      id: 'streets-park',
      type: 'fill',
      source: 'streets',
      'source-layer': 'park',
      layout: { visibility: streets ? 'visible' : 'none' },
      paint: { 'fill-color': GROUND.dry.park, 'fill-opacity': 0.85 },
    },
    {
      id: 'streets-landuse',
      type: 'fill',
      source: 'streets',
      'source-layer': 'landuse',
      filter: ['in', ['get', 'class'], ['literal', ['grass', 'cemetery', 'pitch', 'playground', 'stadium', 'garden', 'recreation_ground']]],
      layout: { visibility: streets ? 'visible' : 'none' },
      paint: { 'fill-color': GROUND.dry.grass, 'fill-opacity': 0.8 },
    },
    {
      id: 'streets-water',
      type: 'fill',
      source: 'streets',
      'source-layer': 'water',
      layout: { visibility: streets ? 'visible' : 'none' },
      paint: { 'fill-color': GROUND.dry.water, 'fill-opacity': 0.9 },
    },
    {
      id: 'streets-osm-buildings',
      type: 'fill',
      source: 'streets',
      'source-layer': 'building',
      minzoom: 14,
      layout: { visibility: streets ? 'visible' : 'none' },
      paint: { 'fill-color': GROUND.dry.osm, 'fill-opacity': 0.7, 'fill-outline-color': GROUND.dry.osmLine },
    },
    {
      id: 'streets-road-minor',
      type: 'line',
      source: 'streets',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary', 'residential', 'living_street']]],
      layout: { visibility: streets ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': GROUND.dry.roadMinor, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 16, 4, 18, 9], 'line-opacity': 0.95 },
    },
    {
      id: 'streets-road-major',
      type: 'line',
      source: 'streets',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
      layout: { visibility: streets ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': GROUND.dry.roadMajor, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 16, 7, 18, 14], 'line-opacity': 0.95 },
    },
    {
      id: 'streets-road-centre',
      type: 'line',
      source: 'streets',
      'source-layer': 'transportation',
      minzoom: 16,
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
      layout: { visibility: streets ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#f5f3ee', 'line-width': 1, 'line-opacity': 0.6, 'line-dasharray': [4, 4] },
    },
    {
      id: 'streets-path',
      type: 'line',
      source: 'streets',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['path', 'track', 'pedestrian']]],
      layout: { visibility: streets ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': GROUND.dry.osmPath, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.6, 17, 2.2], 'line-opacity': 0.9, 'line-dasharray': [2, 1.5] },
    },
    {
      id: 'paths-casing',
      type: 'line',
      source: 'paths',
      paint: { 'line-color': GROUND.dry.pathCasing, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 17, 6], 'line-opacity': 0.9 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    },
    {
      id: 'paths',
      type: 'line',
      source: 'paths',
      paint: { 'line-color': GROUND.dry.path, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 17, 4], 'line-opacity': 1 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    },
    {
      id: 'crowd-halo',
      type: 'circle',
      source: 'crowd',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, ['*', ['get', 'r'], 0.6], 17, ['*', ['get', 'r'], 2.6], 19, ['*', ['get', 'r'], 6]],
        'circle-color': ['match', ['get', 'level'], 0, LEVEL_HEX[0], 1, LEVEL_HEX[1], 2, LEVEL_HEX[2], 3, LEVEL_HEX[3], LEVEL_HEX[4]],
        'circle-opacity': 0.38,
        'circle-blur': 0.75,
        'circle-pitch-alignment': 'map',
      },
    },
    {
      id: 'buildings',
      type: 'fill-extrusion',
      source: 'buildings',
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': ['get', 'heightM'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.96,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    {
      id: 'building-selected',
      type: 'fill-extrusion',
      source: 'buildings',
      filter: ['==', ['get', 'id'], '__none__'],
      paint: {
        'fill-extrusion-color': ['get', 'selectedColor'],
        'fill-extrusion-height': ['get', 'heightM'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    {
      id: 'building-hero-rim',
      type: 'line',
      source: 'buildings',
      filter: ['==', ['get', 'hero'], true],
      paint: { 'line-color': '#c41230', 'line-width': 2.5, 'line-opacity': 0.9 },
    },
    {
      id: 'rooms',
      type: 'fill-extrusion',
      source: 'rooms',
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': ['get', 'top'],
        'fill-extrusion-base': ['get', 'base'],
        'fill-extrusion-opacity': 0.96,
      },
    },
    {
      id: 'room-selected',
      type: 'fill-extrusion',
      source: 'rooms',
      filter: ['==', ['get', 'id'], '__none__'],
      paint: {
        'fill-extrusion-color': '#c41230',
        'fill-extrusion-height': ['+', ['get', 'top'], 0.8],
        'fill-extrusion-base': ['get', 'base'],
        'fill-extrusion-opacity': 0.92,
      },
    },
    {
      id: 'route-glow',
      type: 'line',
      source: 'route',
      paint: { 'line-color': '#ef3a47', 'line-width': 12, 'line-opacity': 0.25, 'line-blur': 3 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    },
    {
      id: 'route-line',
      type: 'line',
      source: 'route',
      paint: { 'line-color': '#c41230', 'line-width': 4.5 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    },
    {
      id: 'route-pulse',
      type: 'line',
      source: 'route',
      paint: { 'line-color': '#ffffff', 'line-width': 2.5, 'line-dasharray': [0, 4, 3] },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    },
    {
      id: 'route-ends',
      type: 'circle',
      source: 'routeEnds',
      paint: {
        'circle-radius': 7,
        'circle-color': ['match', ['get', 'end'], 'start', '#ffffff', '#c41230'],
        'circle-stroke-color': '#1f1f1f',
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'overlay-lines',
      type: 'line',
      source: 'overlayLines',
      paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': 0.85, 'line-dasharray': [0, 2, 2] },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    },
    {
      id: 'overlay-points',
      type: 'circle',
      source: 'overlayPoints',
      paint: {
        'circle-radius': ['get', 'r'],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.9,
        'circle-stroke-color': ['get', 'stroke'],
        'circle-stroke-width': 2,
        'circle-pitch-alignment': 'map',
      },
    },
  ],
});

function emptyFc(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function buildingFeatures(buildings: CampusBuilding[], crowd: CrowdState[], showCrowd: boolean, rain: boolean): FeatureCollection<Polygon> {
  const levelByBuilding = new Map<string, number>();
  if (showCrowd) {
    crowd.forEach((s) => {
      const bid = s.zone.building?.id;
      if (!bid) return;
      levelByBuilding.set(bid, Math.max(levelByBuilding.get(bid) ?? -1, s.level));
    });
  }
  return {
    type: 'FeatureCollection',
    features: buildings
      .filter((b) => b.footprint && b.footprint.length >= 4)
      .map((b) => ({
        type: 'Feature',
        properties: {
          id: b.id,
          code: b.code,
          name: b.name,
          heightM: b.heightM ?? 12,
          hero: !!b.hero,
          level: levelByBuilding.get(b.id) ?? -1,
          color: buildingColor(b.facade, levelByBuilding.get(b.id) ?? -1, rain),
          selectedColor: mixHex(buildingColor(b.facade, -1, rain), '#ffffff', 0.35),
        },
        geometry: { type: 'Polygon', coordinates: [b.footprint!.map((p) => [p.lng, p.lat])] },
      })),
  };
}

function pathFeatures(edges: NavEdgeGeo[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: edges.map((e) => ({
      type: 'Feature',
      properties: { id: e.id },
      geometry: {
        type: 'LineString',
        coordinates: [
          [e.fromNode.lng, e.fromNode.lat],
          [e.toNode.lng, e.toNode.lat],
        ],
      },
    })),
  };
}

function crowdFeatures(crowd: CrowdState[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: crowd.map((s) => ({
      type: 'Feature',
      properties: { id: s.zone.id, level: s.level, r: 8 + Math.min(s.fraction, 1.2) * 16, fraction: s.fraction },
      geometry: { type: 'Point', coordinates: [s.zone.lng, s.zone.lat] },
    })),
  };
}

function roomFeatures(rooms: CampusRoom[]): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: rooms
      .filter((r) => r.outline && r.outline.length >= 4)
      .map((r) => {
        const idx = floorIndex(r.floor);
        const base = Math.max(0, idx * FLOOR_M - FLOOR_M + 0.2);
        const top = base + (ROOM_TOP[r.kind] ?? 2.6);
        return {
          type: 'Feature',
          properties: { id: r.id, name: r.name, kind: r.kind, color: ROOM_HEX[r.kind] ?? '#d9c2a5', base, top },
          geometry: { type: 'Polygon', coordinates: [r.outline.map((p) => [p.lng, p.lat])] },
        };
      }),
  };
}

function routeFeatures(route: NavRoute | null): { line: FeatureCollection<LineString>; ends: FeatureCollection<Point> } {
  if (!route || !route.points || route.points.length < 2 || route.unreachable) return { line: emptyFc() as FeatureCollection<LineString>, ends: emptyFc() as FeatureCollection<Point> };
  const coords = route.points.map((p) => [p.lng, p.lat]);
  const line: Feature<LineString> = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
  const first = route.points[0];
  const last = route.points[route.points.length - 1];
  return {
    line: { type: 'FeatureCollection', features: [line] },
    ends: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { end: 'start' }, geometry: { type: 'Point', coordinates: [first.lng, first.lat] } },
        { type: 'Feature', properties: { end: 'finish' }, geometry: { type: 'Point', coordinates: [last.lng, last.lat] } },
      ],
    },
  };
}

function setData(map: MlMap, sourceId: string, data: FeatureCollection): void {
  if (!isLiveMap(map)) return;
  const src = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (src) src.setData(data);
}

const DASH_SEQUENCE: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

const CampusMap = forwardRef<CampusMapHandle, CampusMapProps>(function CampusMap(
  {
    buildings,
    edges,
    crowd,
    layers,
    rain,
    route,
    selectedBuildingId,
    selectedFloor,
    rooms,
    selectedRoomId,
    highlightZoneId,
    overlayLines,
    overlayPoints,
    interactive = true,
    initialCamera,
    flyover = true,
    onBuildingClick,
    onRoomClick,
    onMapClick,
    className,
    children,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const clickHandlers = useRef({ onBuildingClick, onRoomClick, onMapClick, indoorBuildingId: undefined as string | undefined });
  clickHandlers.current = { onBuildingClick, onRoomClick, onMapClick, indoorBuildingId: selectedFloor ? selectedBuildingId : undefined };
  const initialStreets = useRef(layers.streets);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (t) => {
        const m = mapRef.current;
        if (!isLiveMap(m)) return;
        m.flyTo({ center: [t.lng, t.lat], zoom: t.zoom ?? m.getZoom(), pitch: t.pitch ?? m.getPitch(), bearing: t.bearing ?? m.getBearing(), duration: t.duration ?? 1600 });
      },
      getMap: () => mapRef.current,
    }),
    []
  );

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const start = initialCamera ?? { lng: CAMPUS_CENTER[0], lat: CAMPUS_CENTER[1], zoom: 14.9, pitch: 0, bearing: 0 };
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: baseStyle(initialStreets.current),
      center: [start.lng, start.lat],
      zoom: start.zoom ?? 15,
      pitch: start.pitch ?? 0,
      bearing: start.bearing ?? 0,
      maxPitch: 72,
      minZoom: 13.5,
      maxZoom: 20,
      interactive,
      attributionControl: { compact: true },
    });
    trackMapLifecycle(m);
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), 'bottom-right');
    let cancelled = false;
    m.on('load', () => {
      if (cancelled) return;
      mapRef.current = m;
      setMap(m);
      if (flyover) {
        m.flyTo({ center: [CAMPUS_CENTER[0], CAMPUS_CENTER[1]], zoom: 16.35, pitch: 58, bearing: -22, duration: 7000, curve: 1.2 });
      }
    });
    // One click handler so a room on the open floor wins over the building shell under it.
    m.on('click', (e) => {
      const h = clickHandlers.current;
      const roomHit = m.getLayer('rooms') ? m.queryRenderedFeatures(e.point, { layers: ['rooms', 'room-selected'] })[0] : undefined;
      if (roomHit?.properties && h.onRoomClick) {
        h.onRoomClick(String(roomHit.properties.id));
        return;
      }
      const hit = m.queryRenderedFeatures(e.point, { layers: ['buildings', 'building-selected'] })[0];
      if (hit?.properties) {
        const id = String(hit.properties.id);
        // Inside the building whose floor is open, a click on a wall gap should not collapse the floor view.
        if (id === h.indoorBuildingId && h.onRoomClick) return;
        h.onBuildingClick?.(id);
        return;
      }
      h.onMapClick?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });
    const updateZoomBand = () => {
      const z = m.getZoom();
      const band = z < 15.6 ? 'far' : z < 17 ? 'mid' : 'near';
      wrapperRef.current?.setAttribute('data-zoom-band', band);
    };
    m.on('zoom', updateZoomBand);
    m.on('load', updateZoomBand);
    m.on('mouseenter', 'buildings', () => {
      m.getCanvas().style.cursor = 'pointer';
    });
    m.on('mouseleave', 'buildings', () => {
      m.getCanvas().style.cursor = '';
    });
    m.on('mouseenter', 'rooms', () => {
      m.getCanvas().style.cursor = 'pointer';
    });
    m.on('mouseleave', 'rooms', () => {
      m.getCanvas().style.cursor = '';
    });
    return () => {
      cancelled = true;
      mapRef.current = null;
      setMap(null);
      m.remove();
    };
    // The map is created once; props that change afterwards are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildingsFc = useMemo(() => buildingFeatures(buildings, crowd, layers.crowd, rain), [buildings, crowd, layers.crowd, rain]);
  const pathsFc = useMemo(() => pathFeatures(edges), [edges]);
  const crowdFc = useMemo(() => crowdFeatures(crowd), [crowd]);
  const roomsFc = useMemo(() => roomFeatures(rooms), [rooms]);
  const routeFc = useMemo(() => routeFeatures(route), [route]);

  useEffect(() => {
    if (isLiveMap(map)) setData(map, 'buildings', buildingsFc);
  }, [map, buildingsFc]);
  useEffect(() => {
    if (isLiveMap(map)) setData(map, 'paths', pathsFc);
  }, [map, pathsFc]);
  useEffect(() => {
    if (isLiveMap(map)) setData(map, 'crowd', crowdFc);
  }, [map, crowdFc]);
  useEffect(() => {
    if (isLiveMap(map)) setData(map, 'rooms', roomsFc);
  }, [map, roomsFc]);
  useEffect(() => {
    if (!isLiveMap(map)) return;
    setData(map, 'route', routeFc.line);
    setData(map, 'routeEnds', routeFc.ends);
  }, [map, routeFc]);

  useEffect(() => {
    if (!isLiveMap(map)) return;
    const g = rain ? GROUND.rain : GROUND.dry;
    map.setPaintProperty('bg', 'background-color', g.bg);
    map.setPaintProperty('streets-park', 'fill-color', g.park);
    map.setPaintProperty('streets-landuse', 'fill-color', g.grass);
    map.setPaintProperty('streets-water', 'fill-color', g.water);
    map.setPaintProperty('streets-osm-buildings', 'fill-color', g.osm);
    map.setPaintProperty('streets-osm-buildings', 'fill-outline-color', g.osmLine);
    map.setPaintProperty('streets-road-minor', 'line-color', g.roadMinor);
    map.setPaintProperty('streets-road-major', 'line-color', g.roadMajor);
    map.setPaintProperty('streets-path', 'line-color', g.osmPath);
    map.setPaintProperty('paths', 'line-color', g.path);
    map.setPaintProperty('paths-casing', 'line-color', g.pathCasing);
    map.setSky({
      'sky-color': rain ? '#9aa3aa' : '#cfe3f2',
      'horizon-color': rain ? '#aeb3b6' : '#eadfcb',
      'fog-color': rain ? '#b9bdc0' : '#e9e4da',
      'fog-ground-blend': rain ? 0.8 : 0.55,
      'horizon-fog-blend': rain ? 0.9 : 0.75,
      'sky-horizon-blend': 0.6,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 12, 1, 14, 0.4],
    });
  }, [map, rain]);

  useEffect(() => {
    if (!isLiveMap(map)) return;
    STREET_LAYER_IDS.forEach((id) => map.setLayoutProperty(id, 'visibility', layers.streets ? 'visible' : 'none'));
    map.setLayoutProperty('crowd-halo', 'visibility', layers.crowd ? 'visible' : 'none');
    ['route-glow', 'route-line', 'route-pulse', 'route-ends'].forEach((id) => map.setLayoutProperty(id, 'visibility', layers.route ? 'visible' : 'none'));
  }, [map, layers.streets, layers.crowd, layers.route]);

  useEffect(() => {
    if (!isLiveMap(map)) return;
    const sel = selectedBuildingId ?? '__none__';
    map.setFilter('buildings', ['!=', ['get', 'id'], sel]);
    map.setFilter('building-selected', ['==', ['get', 'id'], sel]);
    const indoor = !!selectedBuildingId && !!selectedFloor;
    map.setPaintProperty('building-selected', 'fill-extrusion-opacity', indoor ? 0.14 : 0.92);
    map.setLayoutProperty('rooms', 'visibility', indoor ? 'visible' : 'none');
    map.setLayoutProperty('room-selected', 'visibility', indoor ? 'visible' : 'none');
  }, [map, selectedBuildingId, selectedFloor]);

  useEffect(() => {
    if (!isLiveMap(map)) return;
    map.setFilter('room-selected', ['==', ['get', 'id'], selectedRoomId ?? '__none__']);
  }, [map, selectedRoomId]);

  useEffect(() => {
    if (!isLiveMap(map)) return;
    map.setPaintProperty('crowd-halo', 'circle-opacity', highlightZoneId ? ['case', ['==', ['get', 'id'], highlightZoneId], 0.75, 0.3] : 0.38);
    map.setPaintProperty('crowd-halo', 'circle-stroke-width', highlightZoneId ? ['case', ['==', ['get', 'id'], highlightZoneId], 3, 0] : 0);
    map.setPaintProperty('crowd-halo', 'circle-stroke-color', '#1f1f1f');
  }, [map, highlightZoneId]);

  useEffect(() => {
    if (!isLiveMap(map)) return;
    setData(map, 'overlayLines', overlayLines ?? emptyFc());
    setData(map, 'overlayPoints', overlayPoints ?? emptyFc());
  }, [map, overlayLines, overlayPoints]);

  useEffect(() => {
    if (!isLiveMap(map) || !overlayLines || overlayLines.features.length === 0) return undefined;
    const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;
    let step = 0;
    const id = window.setInterval(() => {
      step = (step + 1) % DASH_SEQUENCE.length;
      if (isLiveMap(map) && map.getLayer('overlay-lines')) map.setPaintProperty('overlay-lines', 'line-dasharray', DASH_SEQUENCE[step]);
    }, 110);
    return () => window.clearInterval(id);
  }, [map, overlayLines]);

  // Travelling pulse along the route (dasharray animation, throttled to ~12 fps; stops when there is no route).
  useEffect(() => {
    if (!isLiveMap(map) || !route || route.unreachable || !layers.route) return undefined;
    const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;
    let step = 0;
    const id = window.setInterval(() => {
      step = (step + 1) % DASH_SEQUENCE.length;
      if (isLiveMap(map) && map.getLayer('route-pulse')) map.setPaintProperty('route-pulse', 'line-dasharray', DASH_SEQUENCE[step]);
    }, 85);
    return () => window.clearInterval(id);
  }, [map, route, layers.route]);

  return (
    <div ref={wrapperRef} className={`cp-map ${className ?? 'relative h-full w-full'}`} data-zoom-band="far">
      <div ref={containerRef} className="h-full w-full" aria-label="3D campus map" role="application" />
      <MapContext.Provider value={isLiveMap(map) ? map : null}>{isLiveMap(map) ? children : null}</MapContext.Provider>
    </div>
  );
});

export default CampusMap;
