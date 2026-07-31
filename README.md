# Offline Photo Metadata Manager

Windows-first desktop app for local, non-destructive photo metadata editing.

The app opens one photo source per session, reads embedded metadata and existing sidecars, writes edits only to a separate mirrored XMP sidecar library, and can create an Immich-ready staging folder with sidecars placed next to staged media files.

## Quick Start on Windows

From a fresh clone:

```powershell
.\Install.cmd
.\MapSetup.cmd
.\Run.cmd
```

The `.cmd` files are the beginner path. They call the PowerShell scripts with the right execution policy and do not require knowing Node, pnpm, Electron, or PMTiles.

If a `.cmd` script fails, the terminal window stays open and waits for a key press so the error message is visible.

## What It Does

- Scans one current photo source in read-only mode and forgets its path when the app closes.
- Writes metadata edits to a separate mirrored XMP sidecar library.
- Supports Immich-compatible sidecar fields: description, rating, date/time, GPS latitude/longitude, and tags.
- Imports offline `.pmtiles` map packs for MapLibre-based geotagging.
- Generates and caches real photo thumbnails, including embedded RAW previews when available.
- Supports manual coordinate entry when no map pack is installed.
- Supports optional offline place search from a local SQLite place pack.
- Exports an Immich-ready staging folder with `filename.ext` plus `filename.ext.xmp`.
- Runs a localhost diagnostic backend with a persistent log and live browser console.

## Safety Model

Original media files and source folders are treated as read-only. Normal edits write only to the configured sidecar mirror folder. Immich export writes only to the export destination you choose.

The normal editing layout is:

```text
SidecarRoot/
  <sourceRootId>/
    <relative/photo/path>/
      IMG_0001.jpg.xmp
```

The Immich staging layout is:

```text
ImmichStage/
  <Source Folder Name>/
    <relative/photo/path>/
      IMG_0001.jpg
      IMG_0001.jpg.xmp
```

## Useful Commands

```powershell
.\Install.cmd
.\Run.cmd
.\MapSetup.cmd
.\Doctor.cmd

# Older aliases also work:
.\Setup.cmd
.\Launch.cmd
.\Verify.cmd
.\Build.cmd
```

Equivalent PowerShell scripts live in `scripts/`.

## Getting Offline Maps

The normal setup path is inside the app:

1. Open Maintenance -> Maps.
2. Select regions and a detail level.
3. Use the size estimate and advisory budget to plan disk usage.
4. Click Download Selected.
5. Follow live progress in Activity or Maintenance -> Settings -> Open Console.
6. Use the downloaded pack in Edit -> Geotag Map.

Existing vector `.pmtiles` files can be registered with the import button in Installed Packs.

The budget never blocks a download. `MapSetup.cmd` remains a fallback and a map downloaded in a web browser can be registered with Import Pack. See [Offline Maps](docs/OFFLINE_MAPS.md) for both complete routes. Manual latitude/longitude entry works before a map is installed.

## Main Workflow

Use the left rail: Import -> Library -> Edit -> Export. Import chooses the current source, Library shows thumbnails or details, and Edit opens the metadata inspector for one photo or a batch. Choosing a different source clears the old session view without deleting any files.

Maps live under Maintenance -> Maps. That tab handles region/detail download setup, the active map budget, installed packs, and map download history.

Sidecar storage and desktop diagnostics live under Maintenance -> Settings. The Activity console at the bottom records current operations, progress, errors, and elapsed time. Open Backend Console there to inspect persistent historical logs at the displayed localhost port, even if the renderer has crashed.

## Requirements

- Windows 10/11 for the easiest path.
- Node.js 20.18 or newer if you are outside the Codex workspace.
- pnpm 11.x, or Corepack with pnpm available.

Inside the Codex workspace, the setup scripts automatically use the bundled Node runtime when it exists.

## Documentation

- [Setup](docs/SETUP.md)
- [User Workflow](docs/WORKFLOW.md)
- [Metadata and Immich Compatibility](docs/METADATA_AND_IMMICH.md)
- [Offline Maps](docs/OFFLINE_MAPS.md)
- [Development](docs/DEVELOPMENT.md)
