# Offline Photo Metadata Manager

Windows-first desktop app for local, non-destructive photo metadata editing.

The app scans selected photo folders, reads embedded metadata and existing sidecars, writes edits only to a separate mirrored XMP sidecar library, and can create an Immich-ready staging folder with sidecars placed next to staged media files.

## Quick Start on Windows

From a fresh clone:

```powershell
.\Setup.cmd
.\Launch.cmd
```

If PowerShell blocks scripts, run the same commands from a normal terminal. The `.cmd` wrappers already use `-ExecutionPolicy Bypass` for this repository's scripts.

## What It Does

- Scans selected photo folders in read-only mode.
- Writes metadata edits to a separate mirrored XMP sidecar library.
- Supports Immich-compatible sidecar fields: description, rating, date/time, GPS latitude/longitude, and tags.
- Imports offline `.pmtiles` map packs for MapLibre-based geotagging.
- Supports manual coordinate entry when no map pack is installed.
- Supports optional offline place search from a local SQLite place pack.
- Exports an Immich-ready staging folder with `filename.ext` plus `filename.ext.xmp`.

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
.\Setup.cmd
.\Launch.cmd
.\Verify.cmd
.\Build.cmd
```

Equivalent PowerShell scripts live in `scripts/`.

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

