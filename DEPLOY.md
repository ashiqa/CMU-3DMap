# Deploying CMU Campus Pulse

CMU Campus Pulse is a **C3 AI application**. The React frontend calls C3 backend types for every piece of data
(buildings, rooms, pins, crowd simulation, forecasts, routing, assistant, evacuation planning), so it must run on a
C3 AI environment. Static hosts (GitHub Pages, Vercel, Netlify) would serve the UI with no data.

## Requirements

| Item | Value |
| --- | --- |
| Platform | C3 Agentic AI Platform **8.12** or newer |
| Package | `pkge09c9761` (manifest: `pkge09c9761/pkge09c9761.c3pkg.json`) |
| Dependencies | `mcpServer` 8.10, `testtools` 8.12 (tests only). Both ship with the platform. |
| External services | OpenFreeMap vector tiles (`tiles.openfreemap.org`, free, loaded by the browser). Gemini API key is optional. |

## What is in this repository

```
pkge09c9761/
  pkge09c9761.c3pkg.json   package manifest
  src/                     C3 types (.c3typ) and JavaScript implementations
  data/                    app data, one folder per type (see "Load the data")
  ui/react/                React + Vite frontend (package.json + package-lock.json)
  test/js-rhino/           Jasmine backend tests
README.md                  product requirements document
DEPLOY.md                  this file
```

Not committed on purpose (see `.gitignore`): `gen/` (generated from `src/`), `*.c3pkg.lock.json` (re-resolved by
the platform), `node_modules/` and `ui/content/` (rebuilt from `package-lock.json`), editor caches, and secrets.

## 1. Deploy

**From C3 Code:** open the workspace connected to this repository and click **Deploy** in the header. You need
application-admin access and a running workspace.

**On another C3 environment:** create a C3 Code workspace (or application) from this repository with
`pkge09c9761` as the root package, then deploy it the same way.

## 2. Load the data (required, once per deployment)

Files in `data/` are **not loaded automatically** on deployment; only `seed/` is. Load them once from the deployed
app's **C3 Console**:

```js
App.State.inst().get().withFields({ pkgFingerprint: -1, seeded: false }).update();
C3.pkg().upsertAllSeed();
```

Re-running it is safe: records are upserted by `id`.

Check the counts:

```js
['CampusBuilding', 'CampusBuilding.Room', 'CampusBuilding.Exit', 'CampusPin', 'CrowdZone', 'NavNode', 'NavEdge']
  .map(function (n) { return n + ': ' + C3.type(n).fetchCount(); });
```

| Type | Records | Source files |
| --- | --- | --- |
| `CampusBuilding` | 74 | `CampusBuilding.json` (real footprints from the ScottyLabs CMU Maps API) |
| `CampusBuilding.Room` | 2,315 | `CampusBuilding.Room.json`, `-CUC.json`, `-ESIM.json` |
| `CampusBuilding.Exit` | 9 | `CampusBuilding.Exit.json` |
| `CampusPin` | 50 | `CampusPin.json`, `CampusPin-CUC.json` |
| `CrowdZone` | 15 | `CrowdZone.json` |
| `NavNode` | 3,701 | `NavNode.json`, `-CUC.json`, `-ESIM.json` |
| `NavEdge` | 5,302 | `NavEdge.json`, `-CUC.json`, `-ESIM.json` |

Food and event pins use times relative to "now". The map re-anchors them on load; to do it manually run
`CampusPin.resetDemoClock()`.

## 3. Optional: enable the Gemini assistant

Without a key the assistant uses its built-in deterministic parser, so every scripted query still works. To enable
LLM tool calling, run this once in the deployed app's C3 Console (the key is stored as a secret and never returned):

```js
CampusPulse.Llm.setApiUrlAndAuth('https://generativelanguage.googleapis.com/v1beta/openai/', 'Bearer <YOUR_KEY>');
CampusPulse.llmStatus();   // confirm it reports as configured
```

Never commit the key. Model and sampling settings live in `CampusPulse.LlmConfig` (default model `gemini-2.5-flash`).

## 4. Give people access

Use **Share** in C3 Code or the application's **User Management** to add users. Share the deployed application's
URL, not the workspace preview (`localhost:9000` only works inside the workspace).

## Developing and testing

- Build the UI: `cd pkge09c9761/ui/react && npm ci && VITE_C3_PKG=pkge09c9761 npm run build` (runs lint, type-check,
  and Vite build). See `ui/react/README.md` for local `.env` settings.
- Backend tests (dev-mode app only), from the C3 Console:
  `TestRunner.make().withTestPathGlob('**/pkge09c9761/test/js-rhino/**').run()`
- UI unit tests: `cd pkge09c9761/ui/react && npx jest src/shared/__tests__ --coverage=false`

## Data caveats

- Crowd levels, forecasts, and some pins are **simulated** and labelled "Simulated" / "Demo data" in the UI.
- The evacuation sandbox is a planning simulation, **not operational emergency guidance**.
- The scripts that generated `data/` (blueprint tracing, georeferencing, ScottyLabs import) are not in this
  repository. Edit the JSON in `data/` directly, then re-run the load step above.
