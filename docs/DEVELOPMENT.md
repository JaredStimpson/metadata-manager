# Development

## Stack

- Electron
- React
- TypeScript
- electron-vite
- sql.js
- exiftool-vendored
- MapLibre GL JS
- PMTiles
- Vitest

## Project Structure

```text
src/
  main/
    db/
    metadata/
    services/
  preload/
  renderer/
  shared/
tests/
scripts/
docs/
```

## Stability Notes

- Renderer code does not read or write the filesystem directly.
- Renderer code calls Electron only through `src/renderer/src/apiClient.ts`; buttons do not call `window.photoMeta` directly.
- `health:check` reports app version, user data path, sidecar root, tile server state, and IPC capabilities for startup diagnostics.
- A localhost-only HTTP backend exposes health, persistent logs, live SSE log events, and cached thumbnails. The preferred port is `43821`; set `PHOTO_METADATA_BACKEND_PORT` to override it.
- Backend logs are appended as NDJSON under Electron `userData/logs/backend.ndjson` and loaded on restart.
- Renderer crashes are captured by main-process crash hooks. A synchronous crash-log write protects the final error from queued asynchronous work.
- Main-process IPC validates imported map packs before storing them.
- Managed-map discovery scans direct children and uses a debounced `fs.watch`; registrations track origin, availability, last-seen time, vector layers, label mode, and companion style status.
- MapLibre 5.11+ uses local Segoe UI glyph rendering. Styles never require a remote glyph URL.
- `RuntimePaths` resolves SQL.js WASM and bundled tools for development, ASAR, NSIS, and portable layouts instead of assuming `process.cwd()`.
- Map downloads are modeled as a Maintenance feature with persistent preferences and download jobs.
- Map subprocess stdout and stderr stream into the backend log. Carriage-return progress updates are handled and the retained error buffer is bounded.
- Photo sources and scanned assets are session-only and are cleared during main-process startup.
- Selecting a source atomically replaces the prior source after the new path is validated.
- Source changes clear the generated thumbnail cache. Thumbnail URLs include source file size and modified time for cache invalidation.
- Source IDs are deterministic hashes of normalized source paths so mirrored sidecars reconnect after a future re-selection without persisting source paths.
- Startup migrates a legacy random-ID sidecar directory to the deterministic source ID when the destination does not already exist, then clears session rows.
- The default sidecar mirror is outside photo source folders.
- External links are restricted to `http` and `https` protocols.
- Original media files are never modified by metadata saves.

## Main Process

The Electron main process owns:

- Folder selection dialogs.
- Filesystem scanning.
- XMP sidecar reads and writes.
- SQLite persistence.
- PMTiles byte-range serving.
- Managed map discovery, watcher lifecycle, PMTiles metadata inspection, and native CLI downloads.
- Persistent operational logging and localhost diagnostics.
- Cached JPEG thumbnail generation, with embedded RAW preview fallback.
- Immich staging export.

The renderer talks to the main process through typed IPC exposed by the preload script. It never receives arbitrary filesystem access. The localhost HTTP backend is deliberately narrow: diagnostics, event streaming, and asset-ID-based thumbnail responses.

The preload bridge is exposed from `src/preload/index.ts`. `Doctor.cmd` checks both the preload source and built preload output so missing bridge bundles are visible.

## UI Areas

Workflow parent areas:

- Import
- Library
- Edit
- Export

Maintenance parent areas:

- Maps
- Settings and diagnostics

Map setup controls belong in Maintenance -> Maps. The geotag panel can use an installed map pack, but it should not own downloading or cleanup.

Sidecar storage belongs in Maintenance -> Settings. Import owns source selection, Library owns scanning and removal, Edit owns metadata and geotagging, and Export owns Immich staging. Avoid global action strips that duplicate those owners.

## Renderer

The React renderer owns:

- Setup state.
- Photo grid.
- Filters and selection.
- Metadata inspector.
- Map panel.
- Export controls.
- Session activity log and elapsed-time indicators.
- Backend progress subscription for map and error events.

Long or multi-step renderer actions use `runTask` in `App.tsx`. The callback can append progress lines to the Activity console. It records running, informational, successful, and failed states while supporting overlapping background actions.

## Tests

Run:

```powershell
.\Verify.cmd
```

Focused unit tests cover:

- Desktop bridge capability shape.
- Backend console, health endpoint, and persistent logs.
- Library query filters and sorting.
- Library removal without deleting source files.
- Session clearing while preserving persistent settings.
- Current-source replacement and stable source identity.
- Batch metadata patch generation.
- Map download catalog defaults and estimates.
- PMTiles rejection behavior.
- First-run folder creation and overlap safety.
- Managed-map missing state and active selection cleanup.
- Common-schema offline labels and custom style sanitization.
- XMP generation.
- GPS conversion.
- XMP parsing.
- Metadata precedence.
- Mirror sidecar paths.
- Immich staging sidecar naming.

## Packaging

`Bundle.cmd` creates `out/` only. `Build.cmd` runs verification, prepares the pinned/checksummed PMTiles runtime, and invokes electron-builder for x64 assisted NSIS and portable targets. SQL.js WASM and ExifTool executable resources are unpacked from ASAR; `pmtiles.exe` is installed under `resources/bin`.

See [Windows Packaging](PACKAGING.md) for artifact names, runtime layout, and unsigned-release notes.
