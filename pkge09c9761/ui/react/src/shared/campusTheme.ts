import { CrowdForecast, LayerId, LayerVisibility, PinKind, RoomKind, Scenario } from '@/Interfaces';

/** Floor-plan fill colours by `CampusBuilding.Room.Kind` (amenities saturated, back-of-house muted). */
export const ROOM_HEX: Record<RoomKind, string> = {
  Restroom: '#6cc3c5',
  Elevator: '#4f5054',
  Stairs: '#8d8e91',
  Lactation: '#e6a9d4',
  Cafe: '#f6a8ad',
  Meeting: '#fde3a3',
  Assembly: '#f7c46a',
  Athletics: '#9fd1a7',
  Lounge: '#b5dcc0',
  Study: '#b5dcc0',
  Retail: '#c8b6e8',
  Classroom: '#fde3a3',
  Lab: '#c9d7ee',
  Print: '#b7c3da',
  Office: '#e5e2da',
  Service: '#d8cfc3',
  Storage: '#d3cfc5',
  Utility: '#c2c2c2',
  Stacks: '#d9d2c2',
  Corridor: '#f6f4ef',
  Lobby: '#ffffff',
};

export const ROOM_KIND_LABEL: Record<RoomKind, string> = {
  Restroom: 'Restroom',
  Elevator: 'Elevator',
  Stairs: 'Stairs',
  Lactation: 'Lactation room',
  Cafe: 'Dining',
  Meeting: 'Meeting room',
  Assembly: 'Event space',
  Athletics: 'Athletics',
  Lounge: 'Lounge',
  Study: 'Study',
  Retail: 'Retail',
  Classroom: 'Classroom',
  Lab: 'Lab',
  Print: 'Print station',
  Office: 'Office',
  Service: 'Service area',
  Storage: 'Storage',
  Utility: 'Utility',
  Stacks: 'Stacks',
  Corridor: 'Corridor',
  Lobby: 'Lobby',
};

export type RoomCategoryId = 'places' | 'restrooms' | 'food' | 'meeting' | 'events' | 'fitness' | 'study' | 'access' | 'everything';

/** Floor-directory filter chips; `kinds` null = every kind. */
export const ROOM_CATEGORIES: { id: RoomCategoryId; label: string; kinds: RoomKind[] | null }[] = [
  { id: 'places', label: 'Places', kinds: ['Restroom', 'Lactation', 'Cafe', 'Meeting', 'Assembly', 'Athletics', 'Lounge', 'Study', 'Retail', 'Classroom', 'Print', 'Elevator', 'Stairs', 'Lobby'] },
  { id: 'restrooms', label: 'Restrooms', kinds: ['Restroom', 'Lactation'] },
  { id: 'food', label: 'Food', kinds: ['Cafe'] },
  { id: 'meeting', label: 'Meeting', kinds: ['Meeting', 'Classroom'] },
  { id: 'events', label: 'Event spaces', kinds: ['Assembly'] },
  { id: 'fitness', label: 'Fitness', kinds: ['Athletics'] },
  { id: 'study', label: 'Study & lounges', kinds: ['Lounge', 'Study'] },
  { id: 'access', label: 'Stairs & elevators', kinds: ['Elevator', 'Stairs'] },
  { id: 'everything', label: 'All rooms', kinds: null },
];

/** Kinds that get an always-visible icon on the floor view. */
export const AMENITY_KINDS: RoomKind[] = ['Restroom', 'Lactation', 'Elevator', 'Stairs', 'Cafe'];

/** "Lower level" / "Floor 2". */
export function floorName(label?: string): string {
  if (!label) return '';
  return label === 'LL' ? 'Lower level' : `Floor ${label}`;
}

export function sqft(n?: number): string {
  return n == null ? '' : `${Math.round(n).toLocaleString()} sq ft`;
}

/** Demo clock used by Tour mode and the "Demo clock" switch: 2:10 PM, right before the 2:20 class change. */
export const DEMO_MINUTE_OF_DAY = 14 * 60 + 10;

export const CAMPUS_CENTER: [number, number] = [-79.9443, 40.4428];

export const PIN_COLOR: Record<PinKind, string> = {
  Food: 'var(--cp-food)',
  Event: 'var(--cp-event)',
  Bathroom: 'var(--cp-bathroom)',
  Printer: 'var(--cp-printer)',
  'Study space': 'var(--cp-study)',
};

export const PIN_CLASS: Record<PinKind, string> = {
  Food: 'cp-pin--food',
  Event: 'cp-pin--event',
  Bathroom: 'cp-pin--bathroom',
  Printer: 'cp-pin--printer',
  'Study space': 'cp-pin--study',
};

export const PIN_SWATCH: Record<PinKind, string> = {
  Food: 'cp-swatch--food',
  Event: 'cp-swatch--event',
  Bathroom: 'cp-swatch--bathroom',
  Printer: 'cp-swatch--printer',
  'Study space': 'cp-swatch--study',
};

export const PIN_LAYER: Record<PinKind, LayerId> = {
  Food: 'food',
  Event: 'events',
  Bathroom: 'bathrooms',
  Printer: 'printers',
  'Study space': 'study',
};

export const LAYER_LABEL: Record<LayerId, string> = {
  food: 'Food',
  events: 'Events',
  bathrooms: 'Bathrooms',
  printers: 'Printers',
  study: 'Study',
  crowd: 'Crowd',
  route: 'Route',
  streets: 'Streets',
};

export const LAYER_COLOR: Partial<Record<LayerId, string>> = {
  food: 'var(--cp-food)',
  events: 'var(--cp-event)',
  bathrooms: 'var(--cp-bathroom)',
  printers: 'var(--cp-printer)',
  study: 'var(--cp-study)',
  crowd: 'var(--cp-level-3)',
  route: 'var(--cp-rust)',
  streets: 'var(--cp-border)',
};

export const DEFAULT_LAYERS: LayerVisibility = {
  food: true,
  events: true,
  bathrooms: true,
  printers: false,
  study: true,
  crowd: true,
  route: true,
  streets: true,
};

/** Crowd levels 0–4 in CMU brand colours: Green Thread → Gold Thread → orange → Scots Rose → Skibo Red. */
export const LEVEL_HEX = ['#009647', '#fdb515', '#f58a1f', '#ef3a47', '#941120'];

/** Realistic facade colours by `CampusBuilding.Facade` display value (dry weather). */
export const FACADE_HEX: Record<string, string> = {
  'Buff brick': '#d9c29a',
  Concrete: '#a9a69f',
  'Glass & metal': '#9fb0ba',
  Limestone: '#e6e0d2',
  'Light brick': '#c9a98a',
  'Red brick': '#a8604a',
};
export const FACADE_DEFAULT_HEX = '#c9a98a';
export const CARNEGIE_RED = '#c41230';

/** Mixes two hex colours; `t` = 0 returns `a`, 1 returns `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Facade colour tinted toward Carnegie Red by crowd level (−1 = no crowd data), darkened and desaturated in rain. */
export function buildingColor(facade: string | undefined, level: number, rain: boolean): string {
  const base = FACADE_HEX[facade ?? ''] ?? FACADE_DEFAULT_HEX;
  const tint = [0, 0.12, 0.28, 0.5, 0.72][Math.max(0, Math.min(4, level))] ?? 0;
  const tinted = level >= 0 ? mixHex(base, CARNEGIE_RED, tint) : base;
  return rain ? mixHex(tinted, '#5c6670', 0.3) : tinted;
}

export const LEVEL_LABEL = ['Quiet', 'Light', 'Moderate', 'Busy', 'At capacity'];

export function levelOf(fraction: number): number {
  if (fraction < 0.25) return 0;
  if (fraction < 0.5) return 1;
  if (fraction < 0.7) return 2;
  if (fraction < 0.9) return 3;
  return 4;
}

export function currentMinuteOfDay(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function defaultScenario(): Scenario {
  return { minuteOfDay: currentMinuteOfDay(), rain: false, eventNearby: false, examWeek: false, seed: 1 };
}

export function clockLabel(minuteOfDay: number): string {
  const m = ((Math.round(minuteOfDay) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${mm < 10 ? '0' : ''}${mm} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function pct(fraction: number | undefined): string {
  return `${Math.round((fraction ?? 0) * 100)}%`;
}

export function timeOfIso(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "about 25 min left", "starts in 40 min", "ended" — relative to the browser clock. */
export function relativeWindow(startsAt?: string, expiresAt?: string, nowMs: number = Date.now()): { label: string; live: boolean; expired: boolean } {
  if (!startsAt && !expiresAt) return { label: '', live: false, expired: false };
  const start = startsAt ? new Date(startsAt).getTime() : nowMs;
  const end = expiresAt ? new Date(expiresAt).getTime() : Number.POSITIVE_INFINITY;
  if (nowMs < start) {
    const mins = Math.max(1, Math.round((start - nowMs) / 60000));
    return { label: mins >= 90 ? `starts ${timeOfIso(startsAt)}` : `starts in ${mins} min`, live: false, expired: false };
  }
  if (nowMs > end) return { label: 'ended', live: false, expired: true };
  if (!Number.isFinite(end)) return { label: 'ongoing', live: true, expired: false };
  const left = Math.max(1, Math.round((end - nowMs) / 60000));
  return { label: left >= 90 ? `until ${timeOfIso(expiresAt)}` : `about ${left} min left`, live: true, expired: false };
}

export function haversineM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Index of a floor label for stacking indoor geometry (A/LL below 1). */
export function floorIndex(label?: string): number {
  if (!label) return 1;
  const n = parseInt(label, 10);
  if (!Number.isNaN(n)) return n;
  const letters: Record<string, number> = { A: 0, B: -1, C: -2, D: -3, E: -4, F: -5, LL: -1, M: 1.5, PH: 10, EV: -1 };
  return letters[label] ?? 1;
}

export function forecastHeadline(f: CrowdForecast): string {
  if (f.timeToCapacityMin != null && f.capacityAtLabel) return `Full at ${f.capacityAtLabel}`;
  return `Peaks at ${pct(f.peakFraction)}`;
}
