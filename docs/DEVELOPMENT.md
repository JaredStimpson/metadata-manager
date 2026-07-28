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
- Main-process IPC validates imported map packs before storing them.
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

## Renderer

The React renderer owns:

- Setup state.
- Photo grid.
- Filters and selection.
- Metadata inspector.
- Map panel.
- Export controls.

## Tests

Run:

```powershell
.\Verify.cmd
```

Focused unit tests cover:

- XMP generation.
- GPS conversion.
- XMP parsing.
- Metadata precedence.
- Mirror sidecar paths.
- Immich staging sidecar naming.

## Release Notes

This repository currently builds unpackaged Electron bundles into `out/`. A future packaging step can add `electron-builder` or a similar packager once installer/update preferences are clear.
