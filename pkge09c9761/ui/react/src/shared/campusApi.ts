import { c3Call } from '@/c3Action';
import {
  AssistantReply,
  CampusBuilding,
  CampusPin,
  CampusRoom,
  CrowdForecast,
  CrowdState,
  CrowdZone,
  EvacuationPlan,
  LlmStatus,
  NavEdgeGeo,
  NavNode,
  NavRoute,
  RouteMode,
  Scenario,
  ZoneRecommendation,
} from '@/Interfaces';

const BUILDING_INCLUDE = 'id, code, name, footprint, lng, lat, heightM, floorLabels, schematicFloors, floorPlanSource, hero, facade, dataStatus';
const ROOM_INCLUDE =
  'id, building.id, floor, name, kind, number, spaceType, areaSqFt, department, nameSource, outline, labelLng, labelLat, navNode.id, dataStatus';
const PIN_INCLUDE =
  'id, kind, name, lng, lat, building.id, building.code, building.name, floor, details, photos, startsAt, expiresAt, tags, dataStatus, meta.created';
const ZONE_INCLUDE = 'id, name, kind, lng, lat, building.id, building.code, building.name, floor, capacity, indoor, studySpace, amenities';

interface FetchResult<T> {
  objs?: T[];
  count?: number;
}

/** Quotes a value for use inside a C3 filter expression. Ids are our own, but never interpolate raw. */
const quote = (value: string): string => `'${value.replace(/'/g, "\\'")}'`;

export async function fetchBuildings(): Promise<CampusBuilding[]> {
  const res: FetchResult<CampusBuilding> = await c3Call('CampusBuilding', 'fetch', null, [
    { include: BUILDING_INCLUDE, limit: 200, offset: 0, order: 'code' },
  ]);
  return res.objs ?? [];
}

export async function fetchRooms(buildingId: string, floor: string): Promise<CampusRoom[]> {
  const res: FetchResult<CampusRoom> = await c3Call('CampusBuilding.Room', 'fetch', null, [
    {
      filter: `building == ${quote(buildingId)} && floor == ${quote(floor)}`,
      include: ROOM_INCLUDE,
      // The busiest CUC floor has ~240 rooms; one bounded page covers every floor we ship.
      limit: 400,
      offset: 0,
      order: 'number',
    },
  ]);
  return res.objs ?? [];
}

/** One room by id (used when the assistant asks the map to open a room). */
export async function fetchRoom(roomId: string): Promise<CampusRoom | null> {
  const res: FetchResult<CampusRoom> = await c3Call('CampusBuilding.Room', 'fetch', null, [
    { filter: `id == ${quote(roomId)}`, include: ROOM_INCLUDE, limit: 1, offset: 0 },
  ]);
  return res.objs?.[0] ?? null;
}

export async function fetchPins(): Promise<CampusPin[]> {
  const res: FetchResult<CampusPin> = await c3Call('CampusPin', 'fetch', null, [
    { include: PIN_INCLUDE, limit: 200, offset: 0, order: 'kind, name' },
  ]);
  return res.objs ?? [];
}

export async function fetchPinPage(
  page: number,
  pageSize: number,
  kind?: string
): Promise<{ rows: CampusPin[]; count: number }> {
  const spec: Record<string, unknown> = {
    include: PIN_INCLUDE,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    order: 'kind, name',
  };
  if (kind) spec.filter = `kind == ${quote(kind)}`;
  const res: FetchResult<CampusPin> = await c3Call('CampusPin', 'fetch', null, [spec]);
  return { rows: res.objs ?? [], count: res.count ?? 0 };
}

export async function fetchPinCount(kind?: string): Promise<number> {
  const spec = kind ? { filter: `kind == ${quote(kind)}` } : {};
  const count: number = await c3Call('CampusPin', 'fetchCount', null, [spec]);
  return count;
}

export async function createPin(pin: Partial<CampusPin>): Promise<CampusPin> {
  return c3Call('CampusPin', 'create', pin);
}

export async function fetchZones(): Promise<CrowdZone[]> {
  const res: FetchResult<CrowdZone> = await c3Call('CrowdZone', 'fetch', null, [
    { include: ZONE_INCLUDE, limit: 100, offset: 0, order: 'name' },
  ]);
  return res.objs ?? [];
}

export async function fetchOutdoorEdges(): Promise<NavEdgeGeo[]> {
  const res: FetchResult<NavEdgeGeo> = await c3Call('NavEdge', 'fetch', null, [
    {
      filter: '!indoor',
      include: 'id, fromNode.id, fromNode.lng, fromNode.lat, toNode.id, toNode.lng, toNode.lat, indoor, hasSteps',
      limit: 500,
      offset: 0,
    },
  ]);
  return res.objs ?? [];
}

export async function simulateCrowd(scenario: Scenario): Promise<CrowdState[]> {
  return c3Call('CrowdZone', 'simulate', null, [scenario]);
}

export async function forecastZone(zoneId: string, scenario: Scenario): Promise<CrowdForecast> {
  return c3Call('CrowdZone', 'forecast', { id: zoneId }, [scenario, 180]);
}

export async function recommendZone(zoneId: string, scenario: Scenario): Promise<ZoneRecommendation> {
  return c3Call('CrowdZone', 'recommend', { id: zoneId }, [scenario]);
}

export async function computeRoute(
  fromNodeId: string,
  toNodeId: string,
  mode: RouteMode,
  stepFree: boolean,
  scenario: Scenario
): Promise<NavRoute> {
  return c3Call('NavRoute', 'compute', null, [fromNodeId, toNodeId, mode, stepFree, scenario]);
}

export async function nearestNode(lng: number, lat: number, buildingCode?: string, floor?: string): Promise<NavNode | null> {
  const node: NavNode | null = await c3Call('NavNode', 'nearest', null, [lng, lat, buildingCode ?? null, floor ?? null]);
  return node ?? null;
}

export async function askAssistant(text: string, scenario: Scenario, near?: { lng: number; lat: number }): Promise<AssistantReply> {
  return c3Call('CampusPulse', 'ask', null, [text, scenario, near?.lng ?? null, near?.lat ?? null]);
}

export async function fetchLlmStatus(): Promise<LlmStatus> {
  return c3Call('CampusPulse', 'llmStatus', null, []);
}

export async function resetDemoClock(): Promise<number> {
  return c3Call('CampusPin', 'resetDemoClock', null, []);
}

export async function planEvacuation(buildingId: string, occupants: number, seed: number): Promise<EvacuationPlan> {
  return c3Call('CampusBuilding', 'planEvacuation', { id: buildingId }, [occupants, seed]);
}
