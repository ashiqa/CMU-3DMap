import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { DataGrid, DataGridBody, DataGridCell, DataGridHead, DataGridHeader, DataGridRow } from '@/components/ui/data-grid';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal, ModalBody, ModalContent, ModalFooter, ModalFooterActions, ModalHeader, ModalSubtitle, ModalTitle } from '@/components/ui/modal';
import { Pagination } from '@/components/ui/pagination';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { CampusBuilding, CampusPin, PinKind } from '@/Interfaces';
import { createPin, fetchBuildings, fetchPinPage, resetDemoClock } from '@/shared/campusApi';
import { PIN_SWATCH, relativeWindow } from '@/shared/campusTheme';
import '@/styles/campus-pulse.css';

const PAGE_SIZE = 24;
const KINDS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'Food', label: 'Food' },
  { value: 'Event', label: 'Events' },
  { value: 'Bathroom', label: 'Bathrooms' },
  { value: 'Printer', label: 'Printers' },
  { value: 'Study space', label: 'Study spaces' },
];

interface EventDraft {
  name: string;
  buildingId: string | null;
  floor: string;
  details: string;
  photo: string;
  startsInMin: number;
  durationMin: number;
  tags: string;
}

const EMPTY_DRAFT: EventDraft = { name: '', buildingId: null, floor: '', details: '', photo: '', startsInMin: 60, durationMin: 90, tags: '' };

export default function PinsPage() {
  const { reportError } = useErrorBoundary();
  const [kind, setKind] = useState('all');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CampusPin[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buildings, setBuildings] = useState<CampusBuilding[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<EventDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const nowMs = Date.now();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPinPage(page, PAGE_SIZE, kind === 'all' ? undefined : kind);
      setRows(res.rows);
      setCount(res.count);
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }, [page, kind, reportError]);

  useEffect(() => {
    let cancelled = false;
    fetchPinPage(page, PAGE_SIZE, kind === 'all' ? undefined : kind)
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setCount(res.count);
      })
      .catch((err) => {
        if (!cancelled) reportError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, kind, reportError]);

  useEffect(() => {
    let cancelled = false;
    fetchBuildings()
      .then((b) => {
        if (!cancelled) setBuildings(b);
      })
      .catch((err) => {
        if (!cancelled) reportError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [reportError]);

  const buildingOptions = useMemo(
    () => buildings.filter((b) => (b.floorLabels?.length ?? 0) > 0).map((b) => ({ value: b.id, label: b.name, subLabel: b.code })),
    [buildings]
  );
  const draftBuilding = useMemo(() => buildings.find((b) => b.id === draft.buildingId) ?? null, [buildings, draft.buildingId]);
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim() || !draftBuilding) return;
    setSaving(true);
    try {
      const start = new Date(Date.now() + draft.startsInMin * 60000);
      const end = new Date(start.getTime() + draft.durationMin * 60000);
      await createPin({
        kind: 'Event' as PinKind,
        name: draft.name.trim(),
        lng: draftBuilding.lng,
        lat: draftBuilding.lat,
        building: { id: draftBuilding.id },
        floor: draft.floor.trim() || undefined,
        details: draft.details.trim() || undefined,
        photos: draft.photo.trim() ? [draft.photo.trim()] : undefined,
        startsAt: start.toISOString(),
        expiresAt: end.toISOString(),
        demoStartOffsetMin: draft.startsInMin,
        demoDurationMin: draft.durationMin,
        tags: draft.tags
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
        dataStatus: 'Synthetic',
      });
      setOpen(false);
      setDraft(EMPTY_DRAFT);
      setNotice(`Added "${draft.name.trim()}" to the map.`);
      setKind('Event');
      setPage(1);
      await load();
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  const reanchor = async () => {
    try {
      const n = await resetDemoClock();
      setNotice(`Re-anchored ${n} food and event pins to now.`);
      await load();
    } catch (err) {
      reportError(err);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-c3-bold-heading-h4 text-foreground">Campus pins</h1>
          <p className="text-c3-regular-body-p2 text-muted-foreground">
            Everything on the map shares one record: <code className="cp-kbd">CampusPin</code>. Synthetic rows are labelled <em>Demo data</em>; verified rows are checked campus facts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" appearance="secondary" size="md" leadingIcon={<RefreshCw />} onClick={reanchor}>
            Reset demo clock
          </Button>
          <Button variant="solid" appearance="accent" size="md" leadingIcon={<Plus />} onClick={() => setOpen(true)}>
            Add event pin
          </Button>
        </div>
      </header>

      {notice ? (
        <div className="rounded-sm border border-[var(--c3-style-basic-border-success)] bg-[var(--c3-style-basic-bg-success)] px-3 py-2 text-c3-regular-body-p3 text-foreground" role="status">
          {notice}
        </div>
      ) : null}

      <Tabs
        value={kind}
        onValueChange={(v) => {
          setKind(v);
          setPage(1);
        }}
        variant="boxed"
        size="sm"
      >
        <TabsList>
          {KINDS.map((k) => (
            <TabsTrigger key={k.value} value={k.value}>
              {k.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="min-h-0 flex-1 overflow-auto">
        <DataGrid className="w-full">
          <DataGridHeader>
            <DataGridRow>
              <DataGridHead>Kind</DataGridHead>
              <DataGridHead>Name</DataGridHead>
              <DataGridHead>Where</DataGridHead>
              <DataGridHead>Window</DataGridHead>
              <DataGridHead>Tags</DataGridHead>
              <DataGridHead>Provenance</DataGridHead>
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody>
            {rows.map((p) => {
              const win = relativeWindow(p.startsAt, p.expiresAt, nowMs);
              return (
                <DataGridRow key={p.id}>
                  <DataGridCell>
                    <span className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${PIN_SWATCH[p.kind]}`}>{p.kind}</span>
                  </DataGridCell>
                  <DataGridCell>
                    <span className="font-medium">{p.name}</span>
                    {p.details ? <div className="max-w-md truncate text-c3-regular-body-p3 text-muted-foreground">{p.details}</div> : null}
                  </DataGridCell>
                  <DataGridCell>
                    {p.building?.name ?? 'Outdoors'}
                    {p.floor ? ` · floor ${p.floor}` : ''}
                  </DataGridCell>
                  <DataGridCell>{win.label || '—'}</DataGridCell>
                  <DataGridCell>
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {(p.tags ?? []).map((t) => (
                        <Badge key={t} variant="outline" appearance="secondary" size="sm">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </DataGridCell>
                  <DataGridCell>
                    {p.dataStatus === 'Verified' ? (
                      <Badge variant="soft" appearance="success" size="sm">
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="outline" appearance="warning" size="sm">
                        Demo data
                      </Badge>
                    )}
                  </DataGridCell>
                </DataGridRow>
              );
            })}
            {!loading && rows.length === 0 ? (
              <DataGridRow>
                <DataGridCell colSpan={6}>No pins of this kind yet.</DataGridCell>
              </DataGridRow>
            ) : null}
          </DataGridBody>
        </DataGrid>
      </div>

      <Pagination type="full" page={page} pageCount={pageCount} totalItems={count} pageSize={PAGE_SIZE} onPageChange={setPage} />

      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent contentWidth="contained" width={560}>
          <ModalHeader>
            <ModalTitle>Add an event pin</ModalTitle>
            <ModalSubtitle>Club organizers: put your event on the map with a photo. Saved as demo data.</ModalSubtitle>
          </ModalHeader>
          <form onSubmit={submit} id="add-event-form">
            <ModalBody>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ev-name">Event name</Label>
                  <Input id="ev-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Robotics Club Demo Day" required />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="ev-building">Building</Label>
                    <Combobox id="ev-building" options={buildingOptions} value={draft.buildingId} onValueChange={(v) => setDraft({ ...draft, buildingId: v })} placeholder="Pick a building" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="ev-floor">Floor (optional)</Label>
                    <Input id="ev-floor" value={draft.floor} onChange={(e) => setDraft({ ...draft, floor: e.target.value })} placeholder={draftBuilding?.floorLabels?.join(', ') ?? 'e.g. 2'} />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ev-details">Details</Label>
                  <Textarea id="ev-details" value={draft.details} onChange={(e) => setDraft({ ...draft, details: e.target.value })} placeholder="One or two sentences shown on the card." rows={3} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ev-photo">Photo URL (optional)</Label>
                  <Input id="ev-photo" type="url" value={draft.photo} onChange={(e) => setDraft({ ...draft, photo: e.target.value })} placeholder="https://…" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="ev-start">Starts in (min)</Label>
                    <Input id="ev-start" type="number" min={-600} max={1440} value={draft.startsInMin} onChange={(e) => setDraft({ ...draft, startsInMin: Number(e.target.value) })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="ev-dur">Duration (min)</Label>
                    <Input id="ev-dur" type="number" min={5} max={1440} value={draft.durationMin} onChange={(e) => setDraft({ ...draft, durationMin: Number(e.target.value) })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="ev-tags">Tags (comma-separated)</Label>
                    <Input id="ev-tags" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="robotics, demo" />
                  </div>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalFooterActions>
                <Button type="button" variant="ghost" appearance="secondary" size="md" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="solid" appearance="accent" size="md" loading={saving} disabled={!draft.name.trim() || !draftBuilding}>
                  Add to map
                </Button>
              </ModalFooterActions>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
