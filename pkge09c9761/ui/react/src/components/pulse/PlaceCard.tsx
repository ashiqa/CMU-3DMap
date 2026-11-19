import React, { useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, Clock, Layers, MessageSquareText, Navigation, Sparkles, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CampusBuilding, CampusPin, CrowdState, Selection } from '@/Interfaces';
import { LEVEL_LABEL, PIN_SWATCH, floorName, pct, relativeWindow } from '@/shared/campusTheme';

interface PlaceCardProps {
  selection: Selection;
  crowdForBuilding?: CrowdState;
  nowMs: number;
  onClose: () => void;
  onNavigate: () => void;
  onPredict?: () => void;
  onAsk: () => void;
  onFloor: (floor: string | undefined) => void;
}

function DataStatusBadge({ status }: { status: 'Verified' | 'Synthetic' }) {
  return status === 'Verified' ? (
    <Badge variant="soft" appearance="success" size="sm">
      Verified
    </Badge>
  ) : (
    <Badge variant="outline" appearance="warning" size="sm">
      Demo data
    </Badge>
  );
}

function Gallery({ photos, name }: { photos: string[]; name: string }) {
  const [i, setI] = useState(0);
  if (!photos.length) return null;
  return (
    <div className="relative overflow-hidden rounded-md border border-[var(--cp-border)]/40 bg-[var(--cp-sand)]/30">
      <img src={photos[i]} alt={`${name} — demo ${i + 1} of ${photos.length}`} className="h-36 w-full object-cover" loading="lazy" />
      {photos.length > 1 ? (
        <>
          <button type="button" className="cp-btn-secondary absolute left-1 top-1/2 !min-h-7 -translate-y-1/2 !px-1" aria-label="Previous photo" onClick={() => setI((i - 1 + photos.length) % photos.length)}>
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" className="cp-btn-secondary absolute right-1 top-1/2 !min-h-7 -translate-y-1/2 !px-1" aria-label="Next photo" onClick={() => setI((i + 1) % photos.length)}>
            <ChevronRight className="size-4" />
          </button>
          <span className="absolute bottom-1 right-2 rounded bg-[var(--cp-paper)]/90 px-1.5 text-[10px] font-semibold text-[var(--cp-ink)]">
            {i + 1}/{photos.length} · demo photo
          </span>
        </>
      ) : null}
    </div>
  );
}

function PinBody({ pin, nowMs }: { pin: CampusPin; nowMs: number }) {
  const win = relativeWindow(pin.startsAt, pin.expiresAt, nowMs);
  return (
    <>
      {pin.photos && pin.photos.length ? <Gallery photos={pin.photos} name={pin.name} /> : null}
      {win.label ? (
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--cp-rust)]">
          <Clock className="size-3.5" />
          <span>{win.label}</span>
          {pin.startsAt ? <span className="font-normal text-[var(--cp-muted)]">· starts {new Date(pin.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span> : null}
        </div>
      ) : null}
      {pin.details ? <p className="text-[13px] leading-snug text-[var(--cp-ink)]">{pin.details}</p> : null}
      {pin.tags && pin.tags.length ? (
        <div className="flex flex-wrap gap-1">
          {pin.tags.map((t) => (
            <span key={t} className="rounded-full border border-[var(--cp-border)]/60 px-2 py-0.5 text-[11px] text-[var(--cp-muted)]">
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

function BuildingBody({ building, floor, crowd, onFloor }: { building: CampusBuilding; floor?: string; crowd?: CrowdState; onFloor: (f: string | undefined) => void }) {
  const floors = building.schematicFloors ?? [];
  return (
    <>
      {crowd ? (
        <div className="flex items-center gap-2 text-[12px]">
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold cp-level-${crowd.level}`}>{LEVEL_LABEL[crowd.level]}</span>
          <span className="text-[var(--cp-muted)]">
            {pct(crowd.fraction)} of {crowd.zone.capacity.toLocaleString()} · {crowd.trend} · simulated
          </span>
        </div>
      ) : null}
      <div className="text-[12px] text-[var(--cp-muted)]">
        {building.floorLabels && building.floorLabels.length ? `${building.floorLabels.length} floors (${building.floorLabels.join(', ')})` : 'No floor list published'} · footprint from CMU Maps
      </div>
      {floors.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Layers className="size-4 text-[var(--cp-muted)]" />
          <span className="text-[12px] font-semibold">Floor</span>
          <button type="button" className="cp-floor-btn !h-8 !w-auto !px-2 text-[12px]" data-active={!floor} onClick={() => onFloor(undefined)}>
            Shell
          </button>
          {floors.map((f) => (
            <button key={f} type="button" className="cp-floor-btn !h-8 !w-auto !min-w-8 !px-1.5 text-[12px]" data-active={floor === f} onClick={() => onFloor(f)} aria-label={`Show ${floorName(f).toLowerCase()}`}>
              {f}
            </button>
          ))}
          <span className="ml-1 text-[11px] text-[var(--cp-muted)]">{building.floorPlanSource ? 'official floor plans' : 'schematic · demo data'}</span>
        </div>
      ) : null}
    </>
  );
}

export default function PlaceCard({ selection, crowdForBuilding, nowMs, onClose, onNavigate, onPredict, onAsk, onFloor }: PlaceCardProps) {
  if (!selection) return null;
  const isPin = selection.type === 'pin';
  const title = isPin ? selection.pin.name : selection.building.name;
  const subtitle = isPin
    ? `${selection.pin.kind}${selection.pin.building?.name ? ` · ${selection.pin.building.name}` : ' · outdoors'}${selection.pin.floor ? `, ${floorName(selection.pin.floor).toLowerCase()}` : ''}`
    : `${selection.building.code}${selection.building.hero ? ' · hero building' : ''}`;
  const status = isPin ? selection.pin.dataStatus : selection.building.dataStatus;

  return (
    <section className="cp-glass cp-card-in flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-3 p-3" aria-label={`${title} details`}>
      <header className="flex items-start gap-2">
        <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${isPin ? PIN_SWATCH[selection.pin.kind] : 'bg-[var(--cp-sienna)] text-[var(--cp-cream)]'}`} aria-hidden>
          {isPin ? <Sparkles className="size-4" /> : <Building2 className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold leading-tight text-[var(--cp-ink)]">{title}</h2>
          <p className="truncate text-[12px] text-[var(--cp-muted)]">{subtitle}</p>
        </div>
        <DataStatusBadge status={status} />
        <button type="button" className="cp-btn-secondary !min-h-7 !px-1.5" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </button>
      </header>

      {isPin ? <PinBody pin={selection.pin} nowMs={nowMs} /> : <BuildingBody building={selection.building} floor={selection.floor} crowd={crowdForBuilding} onFloor={onFloor} />}

      <footer className="flex flex-wrap gap-2">
        <button type="button" className="cp-btn-primary flex items-center gap-1.5" onClick={onNavigate}>
          <Navigation className="size-4" /> Navigate here
        </button>
        {onPredict ? (
          <button type="button" className="cp-btn-secondary flex items-center gap-1.5" onClick={onPredict}>
            <Sparkles className="size-4" /> Pin &amp; predict
          </button>
        ) : null}
        <button type="button" className="cp-btn-secondary flex items-center gap-1.5" onClick={onAsk}>
          <MessageSquareText className="size-4" /> Ask AI
        </button>
      </footer>
    </section>
  );
}
