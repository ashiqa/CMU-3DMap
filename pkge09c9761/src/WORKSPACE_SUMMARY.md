# Workspace Summary

> Work-to-date map of this workspace. Read first each chat; keep updated. Concise map, not a transcript.

## Current state

**CMU Campus Pulse** — a 3D predictive campus map built as a C3 app (PRD: `.attachments/.../cmu-campus-pulse-prd.md`).
**Palette (current):** realistic ground + per-building facade materials, CMU Tartan brand for overlays/UI (Carnegie Red
`#C41230` primary, Skibo `#941120`, Scots Rose, Gold/Teal/Blue/Green Thread for pin kinds, Iron Gray text). The earlier
warm terracotta palette from `README-colors.md` was replaced at the user's request. Full Must+Should scope is built: 3D map with
real footprints, unified pins, simulated crowd layer, Rain/Event/Exam scenario, 3-hour forecast + recommendation,
Fast/Calm/Step-free routing (outdoor + indoor floors), assistant (deterministic parser + Gemini tool calling when a key is
set), Tour mode, Pins directory with "add event", Crowd Pulse dashboard, Evacuation-planning sandbox.

**Verification level:** `npm run build` passes; every UI `c3Call` replayed via `runJsOnLiveApp` (backend-verified);
**54 Jasmine backend tests** in `test/js-rhino/` pass (run on the live app, which is `dev` mode:
`TestRunner.make().withTestPathGlob('**/pkge09c9761/test/js-rhino/**').run()`); **15 Jest tests** in
`ui/react/src/shared/__tests__/campusTheme.test.ts` pass (`npx jest src/shared/__tests__ --coverage=false`).
The Playwright browser is **not authenticated** here (all `/api/8/*` → 401), so pages were only layout-checked; data
rendering in the UI is backend-verified only.

## Packages

- `pkge09c9761` (main, only package). Deps: `mcpServer 8.10`, `testtools 8.12` (for TestApi). Platform v8.12.

## Backend types (`pkge09c9761/src/`)

| Type | Kind | Notes |
| --- | --- | --- |
| `CampusPulse.DataStatus` | enum | `VERIFIED='Verified'`, `SYNTHETIC='Synthetic'` — **data files store display values** (`'Synthetic'`), not identifiers |
| `CampusPulse.LngLat`, `CampusPulse.Scenario` | value | Scenario = `{minuteOfDay, rain, eventNearby, examWeek, seed}`; drives crowd/forecast/Calm routing |
| `CampusBuilding` (+`.Room`, `.Room.Kind`, `.Room.NameSource`, `.Exit`, `.Facade`) | entity | `facade` = Buff brick / Concrete / Glass & metal / Limestone / Light brick / Red brick (assigned per building in gen_data.py; drives extrusion colour). 74 real footprints (ScottyLabs CMU Maps API `api.maps.scottylabs.org/buildings`); `schematicFloors` = HL 1/2/4, WEH 4/5, GHC 4/5, **CUC LL/1/2/3**; `floorPlanSource` = citation when floors are real plans (CUC only); hero = WEH, HL. Methods: `forCode`, `planEvacuation(occupants, seed)` (member) |
| `CampusBuilding.Room` | entity | `number`, `spaceType` (ESIM category verbatim), `areaSqFt`, `department`, `nameSource` (Floor plan / Inferred / Generated), `labelLng/labelLat` (point inside the outline), `navNode` (routable rooms). Kinds added: Meeting, Lounge, Assembly, Athletics, Retail, Service, Storage, Utility, Lactation |
| `CampusBuilding.EvacuationPlan` (+`.Run`, `.ExitLoad`, `.Cluster`, `.Assignment`) | value | nearest-exit baseline vs capacity-aware optimizer; `disclaimer` string |
| `CampusPin` (+`.Kind`) | entity | Food/Event/Bathroom/Printer/Study space; `demoStartOffsetMin`/`demoDurationMin` + `resetDemoClock()` re-anchor food/event times to now |
| `CrowdZone` (+`.Kind`, `.State`, `.Forecast`, `.Forecast.Driver`, `.Recommendation`, `.Alternative`) | entity/value | 15 zones; `simulate(scenario)` static, `forecast(scenario, horizonMin)` + `recommend(scenario)` members. Model in `CrowdZone.js`: 24-h profile + class-change bumps + rain/event/exam shifts + deterministic jitter; capacity threshold 0.9 |
| `NavNode` (+`.Kind`), `NavEdge` | entity | 150 nodes / 168 edges (outdoor junctions, doors, indoor corridors/rooms/stairs/elevators). `NavEdge.hasSteps` (not stepFree) marks stairs. `NavNode.nearest(lng, lat, buildingCode?, floor?)` |
| `NavRoute` (+`.Mode`, `.Point`, `.Step`) | value | `compute(fromNodeId, toNodeId, mode, stepFree, scenario)` — Dijkstra; Calm adds penalty for zones > 55% |
| `CampusPulse` (+`.AssistantReply`, `.MapAction`, `.MapAction.Kind`, `.Place`, `.LlmStatus`) | service | `ask(text, scenario, nearLng, nearLat)` → text + typed map actions; intents: set_scenario, open_pin (pin-name match), route (incl. "from X to Y"), forecast, recommend (no place → quietest study spaces), find_nearest, events_about, locate ("where is / show me"), help; `llmStatus()`; `resolvePlace(text)`. LLM tools mirror these (+`locate_place`). LLM failure → parser fallback with `technique` = "LLM unavailable: <short reason>" (verified with a bogus URL, then cleared) |
| `CampusPulse.Llm` (mixes REST), `CampusPulse.LlmConfig` (Config, Singleton) | REST/config | OpenAI-compatible `chat/completions`; default model `gemini-2.5-flash`. Enable: `CampusPulse.Llm.setApiUrlAndAuth('https://generativelanguage.googleapis.com/v1beta/openai/', 'Bearer <KEY>')` in Console (key stored as secret). Falls back to parser on error/not configured |

**Cohon University Center floor plans** (user-supplied CMU ESIM PDFs, `.attachments/f62c5659-…/CUC-{LL,1,2,3}-ESIM-Dept.pdf`): `.tmp/gen_cuc.py` (run with `.tmp/pdfenv/bin/python`; `gen_data.py` calls it at the end) rasterises each plan's department fills, flood-fills from every room label / leader-line dot to get outlines (590 rooms: LL 233, 1F 160, 2F 122, 3F 75; OTB "open to below" voids skipped), georeferences by IoU fit to the CUC footprint (scale from printed sq ft; rotation ≈164°, IoU 0.90–0.93; floors agree within ~0.3 m), maps ESIM space types → kinds, takes ~80 printed names from floor 2's grey CAD tags (Rangos Ballroom 1–3, Schatz Dining Room, WOMEN/MEN, ELEV/STAIRS…), propagates stair/elevator shafts to other floors by overlap, and flags a few inferred names (McConomy Auditorium 121, Gymnasium 133, Swimming pool 142, locker rooms, Postal Services, Career Center…). Writes `data/<Type>/<Type>-CUC.json` for Room, NavNode (470), NavEdge (503: corridor MST + room access + shaft links; west door `nn_door_CUC_04` → 1F), CampusPin (14 Verified bathroom/study pins), and patches CUC in `CampusBuilding.json` + moves 4 synthetic CUC pins onto real rooms (removed `pin_bath_cuc1`). Helper modules in `.tmp/`: `cuc_labels.py`, `cuc_rooms.py`, `greynames.py`, `georef.py`, `ecc.py`.

Assistant: `placeFor` tries `matchRoom` (named rooms only, `ROOM_STOPWORDS`/`ROOM_SYNONYMS`) → `CampusPulse.Place.room`; `toolLocate`/`toolRoute` emit new `MapAction.Kind.SELECT_ROOM` ('Select room'). `parseFloor` understands "lower level"/"basement" → `LL`.

JS runtime notes: `toNative()` on C3 arrays is not a JS array here — use `each` into a native array (`toJsArray` helper in each .js). `Filter.intersects` (not `inList`). Enum members compare as their display string (`NavNode.Kind.OUTDOOR === 'Outdoor'`).

## UI pages / routes (`ui/react/src`)

| Route | Page | Notes |
| --- | --- | --- |
| `/` | `pages/MapHome/MapHome.tsx` | Open floor = selected building floor **or** an indoor pin's floor when the building ships rooms; `FloorDirectory` card (`components/pulse/FloorDirectory.tsx`: search, category chips, room detail + Navigate, colour key); room click / `Select room` action highlights via `room-selected` layer; bathroom pins hidden on an open floor that has restroom rooms. MapLibre 3D scene (`components/map/CampusMap.tsx`, markers via portals in `components/map/Markers.tsx`); panels in `components/pulse/*` (PlaceCard, ForecastCard + SVG `ForecastChart`, RoutePanel, Assistant/CommandBar, Controls = LayerChips/ScenarioBar/camera presets). Tour button replays the PRD demo script. Click map = set route start |
| `/pins` | `pages/Pins/PinsPage.tsx` | DataGrid + Pagination (24/page, kind tabs), "Add event pin" modal → `CampusPin.create`, "Reset demo clock" |
| `/crowd` | `pages/Crowd/CrowdPage.tsx` | Zone table (6 s polling), metric cards, inline forecast card |
| `/evacuation` | `pages/Evacuation/EvacuationPage.tsx` | Fixed disclaimer banner; building/occupants/seed → baseline vs optimized; flows drawn as `overlayLines/overlayPoints` on CampusMap |

Shared: `shared/campusApi.ts` (all `c3Call` wrappers), `shared/campusTheme.ts` (palette maps, `relativeWindow`, `clockLabel`, `DEMO_MINUTE_OF_DAY`=14:10), `styles/campus-pulse.css` (`--cp-*` tokens, `.cp-glass`, `.cp-chip`, `.cp-pin--*`, `.cp-level-*`, rain overlay). `Interfaces.tsx` mirrors all backend types. Nav: `config/navigation.ts` (Map, Pins, Crowd Pulse, Evacuation Sandbox). `c3Action.ts` = canonical `c3Call` (legacy helpers removed; `shared/api.ts`, `data/sampleData.ts`, `pages/Dashboard` deleted).

Room styling shared in `shared/campusTheme.ts` (`ROOM_HEX`, `ROOM_KIND_LABEL`, `ROOM_CATEGORIES`, `AMENITY_KINDS`, `floorName`, `sqft`); icons in `components/map/roomIcons.ts`; swatch CSS `.cp-room-swatch[data-kind=…]` and `.cp-room-tag--*` in `campus-pulse.css` (mirror ROOM_HEX by hand — no inline styles). `RoomLabels` marks amenities with icon chips, named rooms with labels (hidden at far zoom), larger generated rooms only at near zoom. CampusMap has one click handler: rooms → `onRoomClick`, else building, else map. `npm run build` needs `VITE_C3_PKG=pkge09c9761` in the shell.

Map scene (`CampusMap.tsx`): `GROUND` dry/rain palettes for bg/park/grass/water/OSM buildings/roads/paths; our nav `paths` layer has a casing; building colours are computed in JS (`buildingColor(facade, level, rain)` in campusTheme) into feature props `color`/`selectedColor`; `data-zoom-band` (far/mid/near) on the `.cp-map` wrapper shrinks pins/hides countdowns at far zoom; while a floor is open, other-floor pins in that building are hidden. Crowd polling reports an error once and shows a "crowd feed offline" chip; Tour re-anchors demo pins first; `resetDemoClock` failure is non-fatal on load.

Component facts learned: vendored `Button` appearance = `accent|secondary|success|danger|warning` (no `neutral`); `Switch` has no `label` prop (wrap in `<label>`); `Combobox` has no `clearable`; `ModalHeader` takes children (`ModalTitle`/`ModalSubtitle`), `ModalContent` has `width` not `overflow`; `ui/chart.tsx` from the skill needs React 19 (`useEffectEvent`) so charts here are hand-drawn SVG. MapLibre CSS overrides Tailwind `absolute` on the container → give it `h-full w-full`. CARTO raster tiles now need an API key → basemap is OpenFreeMap vector tiles (`tiles.openfreemap.org/planet`), styled warm, toggle "Streets".

## Seed / data (`pkge09c9761/data/<Type>/`)

Generated by `/usr/workspace/.tmp/gen_data.py` (gitignored scratch; reads `.tmp/buildings.json` from ScottyLabs). Counts: CampusBuilding 74, Room 61 + 590 CUC, Exit 9, CrowdZone 15, NavNode 150 + 470 CUC, NavEdge 168 + 503 CUC, CampusPin 36 + 14 CUC. Loaded with `App.State.inst().get().withFields({pkgFingerprint:-1, seeded:false}).update(); C3.pkg().upsertAllSeed()`.

## Key decisions

- Built as a C3 ontology + backend methods (not the PRD's "static JSON in browser"): simulation, forecast, routing, assistant, evacuation all run server-side and return concrete value types.
- Verified vs synthetic is explicit everywhere (`dataStatus`); UI shows "Demo data" badges, "Simulated" chip, evacuation disclaimer.
- Warm palette from README-colors replaces the PRD's navy blue-hour look.
- LLM = Gemini via OpenAI-compatible endpoint with tool calling; key never passes through chat.
- `.tmp/` is gitignored scratch; `maplibre-gl@^5` added to `package.json`/lock.
