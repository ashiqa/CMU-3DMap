/*
 * Copyright 2009-2025 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { ReactElement } from 'react';

export interface SnackbarMessage {
  message: ReactElement;
  key: number;
  severity?: 'success' | 'info' | 'warning' | 'error';
  error?: boolean;
}

/** Platform metadata present on every persisted C3 record. */
export interface Meta {
  created?: string;
  updated?: string;
  createdBy?: string;
}

/** Provenance label carried by every campus record (`CampusPulse.DataStatus`). */
export type DataStatus = 'Verified' | 'Synthetic';

/** GeoJSON-ordered coordinate (`CampusPulse.LngLat`). */
export interface LngLat {
  lng: number;
  lat: number;
}

/** Minimal reference to a building as returned through `include: 'building.id, building.code, building.name'`. */
export interface BuildingRef {
  id: string;
  code?: string;
  name?: string;
}

/** `CampusBuilding` entity. */
export interface CampusBuilding {
  id: string;
  code: string;
  name: string;
  footprint?: LngLat[];
  lng: number;
  lat: number;
  heightM?: number;
  floorLabels?: string[];
  schematicFloors?: string[];
  /** Citation for real floor plans behind the rooms; absent when floors are demo schematics. */
  floorPlanSource?: string;
  hero?: boolean;
  facade?: Facade;
  dataStatus: DataStatus;
  meta?: Meta;
}

export type Facade = 'Buff brick' | 'Concrete' | 'Glass & metal' | 'Limestone' | 'Light brick' | 'Red brick';

export type RoomKind =
  | 'Study'
  | 'Classroom'
  | 'Office'
  | 'Corridor'
  | 'Lobby'
  | 'Restroom'
  | 'Print'
  | 'Stairs'
  | 'Elevator'
  | 'Cafe'
  | 'Stacks'
  | 'Meeting'
  | 'Lounge'
  | 'Assembly'
  | 'Athletics'
  | 'Retail'
  | 'Service'
  | 'Storage'
  | 'Utility'
  | 'Lactation'
  | 'Lab';

/** `CampusBuilding.Room.NameSource` — where a room's display name came from. */
export type RoomNameSource = 'Floor plan' | 'Inferred' | 'Generated';

/** `CampusBuilding.Room` entity — a room, corridor or shaft on one floor (real ESIM outlines for the Cohon Center). */
export interface CampusRoom {
  id: string;
  building: BuildingRef;
  floor: string;
  name: string;
  kind: RoomKind;
  number?: string;
  spaceType?: string;
  areaSqFt?: number;
  department?: string;
  nameSource?: RoomNameSource;
  outline: LngLat[];
  labelLng?: number;
  labelLat?: number;
  navNode?: { id: string };
  dataStatus: DataStatus;
}

/** `CampusBuilding.Exit` entity. */
export interface CampusExit {
  id: string;
  building?: BuildingRef;
  name: string;
  lng: number;
  lat: number;
  capacityPerMin: number;
  assemblyPoint?: string;
  dataStatus: DataStatus;
}

export type PinKind = 'Food' | 'Event' | 'Bathroom' | 'Printer' | 'Study space';

/** `CampusPin` entity — everything placed on the map. */
export interface CampusPin {
  id: string;
  kind: PinKind;
  name: string;
  lng: number;
  lat: number;
  building?: BuildingRef;
  floor?: string;
  details?: string;
  photos?: string[];
  startsAt?: string;
  expiresAt?: string;
  demoStartOffsetMin?: number;
  demoDurationMin?: number;
  tags?: string[];
  dataStatus: DataStatus;
  meta?: Meta;
}

/** `CampusPulse.Scenario` — the simulated world state. */
export interface Scenario {
  minuteOfDay: number;
  rain: boolean;
  eventNearby: boolean;
  examWeek: boolean;
  seed: number;
}

export type ZoneKind = 'Library' | 'Study space' | 'Dining' | 'Academic' | 'Student center' | 'Quad';

/** `CrowdZone` entity. */
export interface CrowdZone {
  id: string;
  name: string;
  kind: ZoneKind;
  lng: number;
  lat: number;
  building?: BuildingRef;
  floor?: string;
  capacity: number;
  indoor?: boolean;
  studySpace?: boolean;
  amenities?: string[];
  dataStatus?: DataStatus;
}

/** `CrowdZone.State` — simulated occupancy now. */
export interface CrowdState {
  zone: CrowdZone;
  occupancy: number;
  fraction: number;
  level: number;
  trend: 'rising' | 'falling' | 'steady';
}

export interface ForecastDriver {
  label: string;
  contribution: number;
}

/** `CrowdZone.Forecast`. */
export interface CrowdForecast {
  zone: CrowdZone;
  scenario: Scenario;
  minutesAhead: number[];
  p10: number[];
  p50: number[];
  p90: number[];
  nowFraction: number;
  peakFraction: number;
  timeToCapacityMin?: number;
  capacityAtLabel?: string;
  drivers: ForecastDriver[];
  method: string;
}

/** `CrowdZone.Alternative`. */
export interface ZoneAlternative {
  zone: CrowdZone;
  predictedFraction: number;
  walkMinutes: number;
  similarity: number;
  score: number;
  reason: string;
}

/** `CrowdZone.Recommendation`. */
export interface ZoneRecommendation {
  origin: CrowdZone;
  originForecast: CrowdForecast;
  alternatives: ZoneAlternative[];
  summary: string;
}

export type NodeKind = 'Outdoor' | 'Door' | 'Corridor' | 'Stairs' | 'Elevator' | 'Room' | 'Landmark';

/** `NavNode` entity. */
export interface NavNode {
  id: string;
  lng: number;
  lat: number;
  kind: NodeKind;
  label?: string;
  building?: BuildingRef;
  floor?: string;
}

/** `NavEdge` with both endpoints included, used to draw campus paths. */
export interface NavEdgeGeo {
  id: string;
  fromNode: { id: string; lng: number; lat: number };
  toNode: { id: string; lng: number; lat: number };
  indoor?: boolean;
  hasSteps?: boolean;
}

export type RouteMode = 'Fast' | 'Calm';

export interface RoutePoint {
  lng: number;
  lat: number;
  floor?: string;
  buildingCode?: string;
  indoor?: boolean;
  nodeId: string;
}

export interface RouteStep {
  text: string;
  distanceM: number;
  floor?: string;
  buildingCode?: string;
  lng: number;
  lat: number;
}

/** `NavRoute`. */
export interface NavRoute {
  fromNode: NavNode;
  toNode: NavNode;
  mode: RouteMode;
  stepFree?: boolean;
  distanceM?: number;
  etaMinutes?: number;
  crowdPenaltyMin?: number;
  points?: RoutePoint[];
  steps?: RouteStep[];
  floorsVisited?: string[];
  unreachable?: boolean;
}

export type MapActionKind =
  | 'Fly to'
  | 'Highlight'
  | 'Open pin'
  | 'Draw route'
  | 'Set layer'
  | 'Set scenario'
  | 'Show forecast'
  | 'Select building'
  | 'Select room';

/** `CampusPulse.MapAction`. */
export interface MapAction {
  kind: MapActionKind;
  targetId?: string;
  label?: string;
  lng?: number;
  lat?: number;
  zoom?: number;
  floor?: string;
  layer?: string;
  rain?: boolean;
  eventNearby?: boolean;
  examWeek?: boolean;
  fromNodeId?: string;
  toNodeId?: string;
  mode?: RouteMode;
  stepFree?: boolean;
}

/** `CampusPulse.AssistantReply`. */
export interface AssistantReply {
  text: string;
  intent: string;
  technique: string;
  usedLlm?: boolean;
  actions?: MapAction[];
  pins?: CampusPin[];
  route?: NavRoute;
  forecast?: CrowdForecast;
  recommendation?: ZoneRecommendation;
}

/** `CampusPulse.LlmStatus`. */
export interface LlmStatus {
  configured: boolean;
  model: string;
  baseUrl: string;
}

export interface EvacuationExitLoad {
  exit: CampusExit;
  assigned: number;
  fraction: number;
  clearanceSec: number;
}

export interface EvacuationAssignment {
  clusterId: string;
  exitId: string;
  walkSec: number;
}

export interface EvacuationRun {
  method: string;
  clearanceSec: number;
  maxExitFraction: number;
  exitLoads: EvacuationExitLoad[];
  assignments: EvacuationAssignment[];
}

export interface EvacuationCluster {
  clusterId: string;
  lng: number;
  lat: number;
  floor: string;
  count: number;
}

/** `CampusBuilding.EvacuationPlan`. */
export interface EvacuationPlan {
  building: CampusBuilding;
  occupants: number;
  seed: number;
  baseline: EvacuationRun;
  optimized: EvacuationRun;
  improvementPct: number;
  disclaimer: string;
  clusters: EvacuationCluster[];
}

/** Layer ids toggled by the layer chips and `Set layer` actions. */
export type LayerId = 'food' | 'events' | 'bathrooms' | 'printers' | 'study' | 'crowd' | 'route' | 'streets';

export type LayerVisibility = Record<LayerId, boolean>;

/** What the place card is showing. */
export type Selection = { type: 'pin'; pin: CampusPin } | { type: 'building'; building: CampusBuilding; floor?: string } | null;
