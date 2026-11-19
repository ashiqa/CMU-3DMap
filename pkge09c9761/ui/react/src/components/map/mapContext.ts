import { createContext, useContext } from 'react';
import type { Map as MlMap } from 'maplibre-gl';

/** The live MapLibre instance for marker portals and overlays; null until the style has loaded. */
export const MapContext = createContext<MlMap | null>(null);

export const useCampusMap = (): MlMap | null => useContext(MapContext);

/* Maps that have been `remove()`d. MapLibre deletes `map.style` on remove, so any later getSource/getLayer/
 * setPaintProperty throws "Cannot read properties of undefined". React state can still hold the stale instance for a
 * tick (and Fast Refresh re-runs effects with it), so every effect checks `isLiveMap` first. */
const removedMaps = new WeakSet<MlMap>();

export function trackMapLifecycle(map: MlMap): void {
  map.once('remove', () => removedMaps.add(map));
}

export function isLiveMap(map: MlMap | null | undefined): map is MlMap {
  return !!map && !removedMaps.has(map);
}
