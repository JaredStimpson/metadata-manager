# Photo Metadata Manager Development Summary

Updated: 2026-08-02

## Current Product

Photo Metadata Manager is a Windows-first Electron desktop app for editing photo metadata without modifying original media files or writing into source folders.

The primary workflow is:

1. Choose a photo source for the current session.
2. Browse photos in thumbnail or detail view.
3. Select one photo or a batch.
4. Edit description, rating, date/time, tags, or GPS.
5. Save mirrored XMP sidecars.
6. Optionally export an Immich-ready staging folder.

## Latest Changes

- Added first-run setup for separate mirrored sidecar and managed map libraries, with safe defaults and overlap/write validation.
- Added direct-child managed PMTiles discovery at startup, Maps open, folder changes, manual Rescan, and debounced filesystem watcher events.
- Map registrations now retain origin, availability, last-seen time, vector-layer fields, label mode, and companion style diagnostics.
- Added default-on offline labels for Protomaps/common schemas using MapLibre 5.11 local Segoe UI rendering without glyph network requests.
- Added sanitized `map.pmtiles.style.json` and `map.style.json` support for arbitrary vector schemas.
- Added a half-workspace geotag map mode that preserves camera, pin, selected pack, search results, and mounted metadata form state.
- Replaced app-side PowerShell map downloads with direct backend execution of bundled `pmtiles.exe`.
- Added packaged runtime path resolution for SQL.js WASM and bundled tools.
- Added assisted x64 NSIS and portable builds with branded icon, shortcuts, uninstall support, and unsigned-release guidance.
- Added `Bundle.cmd` for developer-only `out/` builds; `Build.cmd` now emits distributable Windows EXEs.

## Backend And Logs

The backend is hosted by the Electron main process and is separate from the React renderer. It binds only to localhost.

Available backend routes include:

- `/` for the live browser console.
- `/api/health` for backend status.
- `/api/logs` for recent structured log entries.
- `/api/events` for live Server-Sent Events.
- `/api/logs/download` for the persistent NDJSON log.
- `/thumbnails/<assetId>` for generated thumbnail responses.

The backend remains available when the renderer crashes. If the entire Electron application exits, the server stops, but its log remains on disk and is loaded again on the next launch. It is not currently a permanent Windows service.

## Thumbnail Pipeline

- Standard images use Electron native thumbnail decoding.
- RAW and unsupported native formats try ExifTool embedded previews.
- Generated JPEG thumbnails are stored under Electron `userData/cache/thumbnails`.
- Cache keys include the asset ID, source modified time, and source size.
- Generation is lazy and duplicate requests share the same pending job.
- The cache is cleared when the current source changes or the photo session is reset.
- No thumbnail is written into the photo source.

## Offline Maps

Two supported acquisition paths are available:

1. Maintenance -> Maps downloads selected regions using the PMTiles CLI and an official Protomaps daily build.
2. A compatible vector `.pmtiles` file can be downloaded separately and registered with Import Pack.

The app streams PMTiles CLI output into persistent logs. Installed builds use `resources/bin/pmtiles.exe` and need no development toolchain.

The download path was tested with a real zoom-0 extraction from the 20260730 Protomaps build. It completed using five HTTP requests, transferred about 67 KB, and produced a valid PMTiles archive.

## Metadata Safety

- Original photo bytes and modified timestamps are not changed by metadata saves.
- Normal edits write only to the configured sidecar mirror.
- Existing adjacent sidecars and embedded metadata remain readable.
- Metadata precedence is mirror sidecar, adjacent sidecar, then embedded metadata.
- Immich export writes media and `filename.ext.xmp` sidecars into a separate staging folder.

## Installation And Commands

Beginner Windows commands:

```powershell
.\Install.cmd
.\Run.cmd
.\MapSetup.cmd
.\Doctor.cmd
```

The command wrappers pause on failure so errors remain visible when launched by double-clicking.

## Verification

The latest release passed:

- `tsc --noEmit`
- 38 Vitest tests across 10 test files
- `electron-vite build`
- Pinned PMTiles v1.31.2 download with official SHA-256 verification
- `Photo-Meta-Setup-0.1.0-x64.exe` NSIS build
- `Photo-Meta-Portable-0.1.0-x64.exe` portable build
- Packaged Electron startup with development Node/pnpm removed from `PATH`
- Packaged preload health check, SQLite initialization, renderer load, and first-run state
- Final portable EXE self-extraction, renderer connection, and SQLite creation with development tools absent from `PATH`

## Git State

Development continues on `test`. `main` is not changed by ongoing development work.

Relevant commits:

- `cdf1866` Add persistent diagnostics and thumbnail backend
- `8305f29` Fix PMTiles CLI installer idempotency

The continuously maintained development notebook lives outside the repository at:

`C:\Users\jared\Documents\Codex\2026-07-13\i\photo-metadata-manager-dev-notebook.md`
