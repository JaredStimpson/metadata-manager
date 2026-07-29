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
- Main-process IPC validates imported map packs before storing them.
- Map downloads are modeled as a Maintenance feature with persistent preferences and download jobs.
- Photo sources and scanned assets are session-only and are cleared during main-process startup.
- Selecting a source atomically replaces the prior source after the new path is validated.
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
- Immich staging export.

The renderer talks to the main process through typed IPC exposed by the preload script.

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

Long or multi-step renderer actions use `runTask` in `App.tsx`. The callback can append progress lines to the Activity console. It records running, informational, successful, and failed states while supporting overlapping background actions.

## Tests

Run:

```powershell
.\Verify.cmd
```

Focused unit tests cover:

- Desktop bridge capability shape.
- Library query filters and sorting.
- Library removal without deleting source files.
- Session clearing while preserving persistent settings.
- Current-source replacement and stable source identity.
- Batch metadata patch generation.
- Map download catalog defaults and estimates.
- PMTiles rejection behavior.
- XMP generation.
- GPS conversion.
- XMP parsing.
- Metadata precedence.
- Mirror sidecar paths.
- Immich staging sidecar naming.

## Release Notes

This repository currently builds unpackaged Electron bundles into `out/`. A future packaging step can add `electron-builder` or a similar packager once installer/update preferences are clear.
