import React, { useMemo, useState } from 'react';
import { Layers, Navigation, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CampusBuilding, CampusRoom, RoomKind } from '@/Interfaces';
import { ROOM_ICON } from '@/components/map/roomIcons';
import { ROOM_CATEGORIES, ROOM_KIND_LABEL, RoomCategoryId, floorName, sqft } from '@/shared/campusTheme';

const LIST_CAP = 80;

/* Amenities first so "where is the bathroom" is answered at the top of the list. */
const KIND_ORDER: RoomKind[] = [
  'Restroom', 'Lactation', 'Elevator', 'Stairs', 'Cafe', 'Assembly', 'Meeting', 'Classroom', 'Lounge', 'Study', 'Athletics', 'Retail',
  'Print', 'Lobby', 'Lab', 'Office', 'Stacks', 'Service', 'Storage', 'Utility', 'Corridor',
];

interface FloorDirectoryProps {
  building: CampusBuilding;
  floor: string;
  rooms: CampusRoom[];
  loading: boolean;
  selectedRoomId?: string;
  onSelect: (room: CampusRoom) => void;
  onClear: () => void;
  onNavigate: (room: CampusRoom) => void;
}

function matches(r: CampusRoom, q: string): boolean {
  if (!q) return true;
  const hay = [r.name, r.number, r.spaceType, r.department, ROOM_KIND_LABEL[r.kind]].filter(Boolean).join(' ').toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

function NameSourceBadge({ room }: { room: CampusRoom }) {
  if (!room.nameSource) {
    return (
      <Badge variant="outline" appearance="warning" size="sm">
        Demo data
      </Badge>
    );
  }
  if (room.nameSource === 'Floor plan') {
    return (
      <Badge variant="soft" appearance="success" size="sm">
        Name on plan
      </Badge>
    );
  }
  if (room.nameSource === 'Inferred') {
    return (
      <Badge variant="outline" appearance="warning" size="sm">
        Name inferred
      </Badge>
    );
  }
  return (
    <Badge variant="outline" size="sm">
      Generated name
    </Badge>
  );
}

function RoomDetail({ room, onClear, onNavigate }: { room: CampusRoom; onClear: () => void; onNavigate: (r: CampusRoom) => void }) {
  const Icon = ROOM_ICON[room.kind];
  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--cp-border)]/50 bg-[var(--cp-cream)]/60 p-2.5" aria-label={`${room.name} details`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-[var(--cp-border)]/50 cp-room-swatch" data-kind={room.kind}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-bold leading-tight text-[var(--cp-ink)]">{room.name}</h3>
          <p className="text-[12px] text-[var(--cp-muted)]">
            {room.number ? `Room ${room.number} · ` : ''}
            {floorName(room.floor)} · {ROOM_KIND_LABEL[room.kind]}
          </p>
        </div>
        <button type="button" className="cp-btn-secondary !min-h-7 !px-1.5" aria-label="Clear room selection" onClick={onClear}>
          <X className="size-4" />
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
        {room.spaceType ? (
          <>
            <dt className="text-[var(--cp-muted)]">Space type</dt>
            <dd className="text-[var(--cp-ink)]">{room.spaceType}</dd>
          </>
        ) : null}
        {room.areaSqFt ? (
          <>
            <dt className="text-[var(--cp-muted)]">Area</dt>
            <dd className="text-[var(--cp-ink)]">{sqft(room.areaSqFt)}</dd>
          </>
        ) : null}
        {room.department ? (
          <>
            <dt className="text-[var(--cp-muted)]">Department</dt>
            <dd className="text-[var(--cp-ink)]">{room.department}</dd>
          </>
        ) : null}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <NameSourceBadge room={room} />
        <button type="button" className="cp-btn-primary ml-auto flex items-center gap-1.5" onClick={() => onNavigate(room)}>
          <Navigation className="size-4" /> Navigate here
        </button>
      </div>
    </div>
  );
}

export default function FloorDirectory({ building, floor, rooms, loading, selectedRoomId, onSelect, onClear, onNavigate }: FloorDirectoryProps) {
  const [category, setCategory] = useState<RoomCategoryId>('places');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const c = new Map<RoomCategoryId, number>();
    ROOM_CATEGORIES.forEach((cat) => c.set(cat.id, rooms.filter((r) => !cat.kinds || cat.kinds.includes(r.kind)).length));
    return c;
  }, [rooms]);

  const list = useMemo(() => {
    const cat = ROOM_CATEGORIES.find((c) => c.id === category) ?? ROOM_CATEGORIES[0];
    // A search looks through every room on the floor, whatever chip is active.
    const pool = query.trim() ? rooms : rooms.filter((r) => !cat.kinds || cat.kinds.includes(r.kind));
    return pool
      .filter((r) => matches(r, query.trim()))
      .sort((a, b) => {
        const named = Number(a.nameSource === 'Generated') - Number(b.nameSource === 'Generated');
        if (named) return named;
        const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
        if (k) return k;
        return (a.number ?? a.name).localeCompare(b.number ?? b.name, undefined, { numeric: true });
      });
  }, [rooms, category, query]);

  const selected = rooms.find((r) => r.id === selectedRoomId);
  const searchId = `floor-search-${building.id}`;

  return (
    <section className="cp-glass cp-card-in flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2 p-3" aria-label={`${building.name} ${floorName(floor)} directory`}>
      <header className="flex items-start gap-2">
        <Layers className="mt-0.5 size-4 shrink-0 text-[var(--cp-muted)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-bold leading-tight text-[var(--cp-ink)]">
            {floorName(floor)} directory
          </h2>
          <p className="truncate text-[11px] text-[var(--cp-muted)]" title={building.floorPlanSource}>
            {loading ? 'Loading rooms…' : `${rooms.length} spaces · `}
            {loading ? null : building.floorPlanSource ? 'traced from CMU ESIM floor plans' : 'schematic demo floor'}
          </p>
        </div>
      </header>

      {selected ? <RoomDetail room={selected} onClear={onClear} onNavigate={onNavigate} /> : null}

      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Search rooms on this floor
        </label>
        <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-[var(--cp-muted)]" aria-hidden />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, room number, type…"
          className="h-8 w-full rounded-md border border-[var(--cp-border)] bg-[var(--cp-paper)] pl-8 pr-2 text-[12px] text-[var(--cp-ink)] outline-none focus-visible:border-[var(--cp-rust)] focus-visible:ring-2 focus-visible:ring-[var(--cp-rust)]/40"
        />
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Room categories">
        {ROOM_CATEGORIES.filter((c) => c.id === 'places' || c.id === 'everything' || (counts.get(c.id) ?? 0) > 0).map((c) => (
          <button
            key={c.id}
            type="button"
            className="cp-chip !min-h-6 !px-2 !py-0.5 text-[11px]"
            data-active={category === c.id && !query.trim()}
            aria-pressed={category === c.id}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
            <span className="text-[10px] opacity-75">{counts.get(c.id) ?? 0}</span>
          </button>
        ))}
      </div>

      <ul className="cp-scroll -mx-1 flex max-h-[260px] flex-col overflow-y-auto" aria-label="Rooms">
        {!loading && list.length === 0 ? <li className="px-1 py-2 text-[12px] text-[var(--cp-muted)]">No rooms match.</li> : null}
        {list.slice(0, LIST_CAP).map((r) => {
          const Icon = ROOM_ICON[r.kind];
          return (
            <li key={r.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-[var(--cp-hover)] data-[selected=true]:bg-[var(--cp-sand)]/70"
                data-selected={r.id === selectedRoomId}
                onClick={() => onSelect(r)}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded cp-room-swatch" data-kind={r.kind} aria-hidden>
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-[var(--cp-ink)]">{r.name}</span>
                  <span className="block truncate text-[11px] text-[var(--cp-muted)]">
                    {[r.number && !r.name.includes(r.number) ? r.number : null, ROOM_KIND_LABEL[r.kind], r.areaSqFt ? sqft(r.areaSqFt) : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {list.length > LIST_CAP ? (
          <li className="px-1 py-1.5 text-[11px] text-[var(--cp-muted)]">
            Showing {LIST_CAP} of {list.length} — search to narrow the list.
          </li>
        ) : null}
      </ul>

      <RoomLegend rooms={rooms} />
    </section>
  );
}

/** Colour key for the kinds present on this floor (matches the 3D fills). */
function RoomLegend({ rooms }: { rooms: CampusRoom[] }) {
  const kinds = useMemo(() => KIND_ORDER.filter((k) => k !== 'Corridor' && rooms.some((r) => r.kind === k)), [rooms]);
  if (!kinds.length) return null;
  return (
    <div className="flex flex-wrap gap-x-2.5 gap-y-1 border-t border-[var(--cp-border)]/40 pt-2" aria-label="Floor plan colour key">
      {kinds.map((k) => (
        <span key={k} className="flex items-center gap-1 text-[10px] text-[var(--cp-muted)]">
          <span className="size-2.5 rounded-sm border border-black/15 cp-room-swatch" data-kind={k} aria-hidden />
          {ROOM_KIND_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

