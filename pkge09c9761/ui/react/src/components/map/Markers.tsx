import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import { CalendarDays, Pizza, Printer, BookOpen, Toilet } from 'lucide-react';
import { CampusBuilding, CampusPin, CampusRoom, PinKind } from '@/Interfaces';
import { AMENITY_KINDS, PIN_CLASS, relativeWindow } from '@/shared/campusTheme';
import { isLiveMap, useCampusMap } from './mapContext';
import { ROOM_ICON } from './roomIcons';

const PIN_ICON: Record<PinKind, React.ComponentType<{ className?: string }>> = {
  Food: Pizza,
  Event: CalendarDays,
  Bathroom: Toilet,
  Printer: Printer,
  'Study space': BookOpen,
};

/** Renders a DOM marker at a coordinate and portals React children into it. */
function MarkerPortal({
  lng,
  lat,
  anchor = 'bottom',
  interactive = true,
  children,
}: {
  lng: number;
  lat: number;
  anchor?: maplibregl.PositionAnchor;
  interactive?: boolean;
  children: React.ReactNode;
}) {
  const map = useCampusMap();
  const el = useMemo(() => {
    const d = document.createElement('div');
    d.className = interactive ? 'cp-marker' : 'cp-marker pointer-events-none';
    return d;
  }, [interactive]);

  useEffect(() => {
    if (!isLiveMap(map)) return undefined;
    const marker = new maplibregl.Marker({ element: el, anchor }).setLngLat([lng, lat]).addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, el, lng, lat, anchor]);

  return createPortal(children, el);
}

interface PinMarkersProps {
  pins: CampusPin[];
  selectedId?: string;
  highlightIds: Set<string>;
  nowMs: number;
  onSelect: (pin: CampusPin) => void;
}

export function PinMarkers({ pins, selectedId, highlightIds, nowMs, onSelect }: PinMarkersProps) {
  return (
    <>
      {pins.map((pin) => {
        const Icon = PIN_ICON[pin.kind] ?? BookOpen;
        const window = pin.kind === 'Food' ? relativeWindow(pin.startsAt, pin.expiresAt, nowMs) : null;
        if (window?.expired) return null;
        const live = !!window?.live;
        return (
          <MarkerPortal key={pin.id} lng={pin.lng} lat={pin.lat} anchor="bottom">
            <div className="cp-pin-wrap">
              <button
                type="button"
                className={`cp-pin ${PIN_CLASS[pin.kind]} ${live ? 'cp-pin--live' : ''}`}
                data-selected={selectedId === pin.id}
                data-highlight={highlightIds.has(pin.id)}
                aria-label={`${pin.kind}: ${pin.name}`}
                title={pin.name}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(pin);
                }}
              >
                <Icon />
              </button>
              {window && window.label ? <span className="cp-pin-count">{window.label}</span> : null}
            </div>
          </MarkerPortal>
        );
      })}
    </>
  );
}

interface BuildingLabelsProps {
  buildings: CampusBuilding[];
  codes: string[];
}

export function BuildingLabels({ buildings, codes }: BuildingLabelsProps) {
  const set = useMemo(() => new Set(codes), [codes]);
  return (
    <>
      {buildings
        .filter((b) => set.has(b.code))
        .map((b) => (
          <MarkerPortal key={b.id} lng={b.lng} lat={b.lat} anchor="center" interactive={false}>
            <span className={`cp-label ${b.hero ? 'cp-label--hero' : ''}`}>{b.name}</span>
          </MarkerPortal>
        ))}
    </>
  );
}

/** How a room is marked on the floor view, or null when it stays unlabeled. */
function roomMarkerLevel(r: CampusRoom): 'amenity' | 'named' | 'minor' | null {
  if (AMENITY_KINDS.includes(r.kind)) return 'amenity';
  if (r.kind === 'Corridor' || r.kind === 'Utility' || r.kind === 'Storage' || r.kind === 'Service') return null;
  if (!r.nameSource || r.nameSource !== 'Generated') return 'named';
  if (r.kind !== 'Office' && (r.areaSqFt ?? 0) >= 500) return 'minor';
  return null;
}

function roomAnchor(r: CampusRoom): { lng: number; lat: number } {
  if (r.labelLng != null && r.labelLat != null) return { lng: r.labelLng, lat: r.labelLat };
  const pts = r.outline.slice(0, -1);
  return { lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length, lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length };
}

interface RoomLabelsProps {
  rooms: CampusRoom[];
  selectedId?: string;
  onSelect?: (room: CampusRoom) => void;
}

/**
 * Floor-view markers: icon chips for amenities (restrooms, stairs, elevators, dining, lactation), text labels for
 * rooms named on the plan, and minor labels for larger generated rooms (only when zoomed in).
 */
export function RoomLabels({ rooms, selectedId, onSelect }: RoomLabelsProps) {
  const items = useMemo(
    () =>
      rooms
        .map((r) => ({ room: r, level: roomMarkerLevel(r), at: roomAnchor(r) }))
        .filter((x) => x.level !== null || x.room.id === selectedId),
    [rooms, selectedId]
  );
  return (
    <>
      {items.map(({ room: r, level, at }) => {
        const Icon = ROOM_ICON[r.kind];
        const selected = r.id === selectedId;
        const showText = level !== 'amenity' || (r.kind === 'Cafe' && r.nameSource !== 'Generated') || selected;
        return (
          <MarkerPortal key={r.id} lng={at.lng} lat={at.lat} anchor="center" interactive={!!onSelect}>
            <button
              type="button"
              className={`cp-room-tag cp-room-tag--${level ?? 'named'} ${level === 'amenity' ? `cp-room-tag--${r.kind.toLowerCase()}` : ''}`}
              data-selected={selected}
              title={`${r.name}${r.number && !r.name.includes(r.number) ? ` · ${r.number}` : ''}`}
              aria-label={`${r.name}${r.number ? `, room ${r.number}` : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(r);
              }}
            >
              {level === 'amenity' ? <Icon className="size-3" /> : null}
              {showText ? <span>{r.name}</span> : null}
            </button>
          </MarkerPortal>
        );
      })}
    </>
  );
}

export interface PointLabel {
  id: string;
  lng: number;
  lat: number;
  text: string;
  hero?: boolean;
}

export function PointLabels({ items }: { items: PointLabel[] }) {
  return (
    <>
      {items.map((it) => (
        <MarkerPortal key={it.id} lng={it.lng} lat={it.lat} anchor="top" interactive={false}>
          <span className={`cp-label ${it.hero ? 'cp-label--hero' : ''}`}>{it.text}</span>
        </MarkerPortal>
      ))}
    </>
  );
}
