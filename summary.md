# Photo Metadata Manager Development Summary

Updated: 2026-07-30

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

- Added a localhost diagnostic backend, normally at `http://127.0.0.1:43821`.
- Added a browser-based backend console with live and historical logs.
- Added persistent NDJSON logs for startup, IPC, map downloads, thumbnails, and crashes.
- Added real cached photo thumbnails with embedded RAW preview fallback.
- Added live map downloader output and progress to the backend and Activity console.
- Fixed Protomaps daily-build discovery and PMTiles CLI installation.
- Made the 5 GB map budget an advisory planning target instead of a download blocker.
- Documented both in-app map downloading and browser-download/import workflows.
- Reworked the visual design into a compact terminal-workstation theme.
- Expanded Settings with backend health, port, console, log path, tile server, bridge, and source-safety information.

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

The app streams PowerShell and PMTiles CLI output into persistent logs. Native carriage-return progress updates are handled so long extractions no longer appear inactive.

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
- 28 Vitest tests across 9 test files
- `electron-vite build`
- All `Doctor.cmd` checks
- Live Electron bridge and backend health checks
- Live cached thumbnail generation
- Real Protomaps network extraction

## Git State

Development continues on `test`. `main` is not changed by ongoing development work.

Relevant commits:

- `cdf1866` Add persistent diagnostics and thumbnail backend
- `8305f29` Fix PMTiles CLI installer idempotency

The continuously maintained development notebook lives outside the repository at:

`C:\Users\jared\Documents\Codex\2026-07-13\i\photo-metadata-manager-dev-notebook.md`
