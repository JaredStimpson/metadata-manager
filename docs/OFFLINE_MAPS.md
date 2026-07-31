# Offline Maps

Offline maps use MapLibre GL JS with local `.pmtiles` files.

## Path 1: Download Inside The App

Use Maintenance -> Maps in the app for the normal path:

- Pick one or more regions.
- Pick a detail level.
- Keep the default 5 GB planning target or adjust it. This is advisory and never blocks a download.
- Choose the output folder if needed.
- Download selected regions while online. The app downloads the Windows PMTiles CLI when needed, finds an available official Protomaps daily build, then uses HTTP range requests to extract each selected region.
- Watch current status in the bottom Activity panel. Open Maintenance -> Settings -> Backend Console for the full live subprocess log and exact failures.
- Use installed packs offline later.

The script fallback runs the same downloader outside the app:

```powershell
.\MapSetup.cmd
```

It offers:

- `1` for a small world overview map.
- `2` for a custom area map.
- `3` to open the official Protomaps download docs and a bounding-box helper.

When the script finishes, launch the app and import the generated `.pmtiles` file with Import Pack.

## Path 2: Download On The Web, Then Import

You can keep map acquisition completely separate from the app:

1. Download a ready-made vector `.pmtiles` pack from a provider in your browser.
2. Or open the [Protomaps builds page](https://maps.protomaps.com/builds), copy a current daily build URL, and use the [PMTiles CLI](https://github.com/protomaps/go-pmtiles/releases) to extract a practical region:

```powershell
pmtiles extract "PASTE_DAILY_BUILD_URL_HERE" "my-region.pmtiles" --bbox=-124.7,32.0,-113.8,42.2 --maxzoom=10
```

3. In the app, open Maintenance -> Maps -> Import Pack.
4. Select the downloaded or extracted `.pmtiles` file and click Use.

The full daily planet build is very large, so downloading a regional pack or using `pmtiles extract` is usually the practical route. The official [Protomaps download guide](https://docs.protomaps.com/basemaps/downloads) explains build size and extraction tradeoffs.

## Importing a Map Pack

1. Launch the app.
2. Open Maintenance -> Maps.
3. Use Import Pack and choose a `.pmtiles` file.
4. Select it as the active map pack in Installed Packs.

The app runs a localhost-only tile server so MapLibre can request byte ranges from the local file. The renderer never receives broad filesystem access.

## Normal Offline Use

After importing a `.pmtiles` file, normal geotagging does not require internet access.

Downloading new regions requires internet. The last installed packs remain registered in SQLite and stay usable after restart as long as the `.pmtiles` files remain on disk.

## Place Search

Place search is optional. The app can import `.sqlite` or `.db` files with a `places` table.

Expected table shape:

```sql
CREATE TABLE places (
  name TEXT NOT NULL,
  region TEXT,
  country TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  population INTEGER
);
```

The app searches by `name` and sorts by `population` when present.

## Manual Coordinates

If no map pack or place pack is installed, the metadata inspector still supports direct latitude and longitude entry plus pasted `lat, lon` text.

## Where the Map Data Comes From

The app and helper script follow the Protomaps workflow: use the PMTiles CLI to extract a smaller `.pmtiles` file from a larger Protomaps basemap build. Protomaps documents this workflow in its basemap downloads and PMTiles CLI docs:

- https://docs.protomaps.com/basemaps/downloads
- https://docs.protomaps.com/pmtiles/cli

The full planet file is very large, so a starter overview or custom area extract is usually the better first map.

## Diagnosing Downloads

The backend records source URL discovery, PMTiles CLI installation, output paths, subprocess output, region completion, and errors in an NDJSON log under the Electron user-data folder. Maintenance -> Settings shows the exact path and the active backend port.

If the visible frontend renderer crashes, the Electron backend and browser console continue running. If the whole app exits, the log remains on disk and is loaded into the console on the next launch.
