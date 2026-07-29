# Offline Maps

Offline maps use MapLibre GL JS with local `.pmtiles` files.

## Beginner Path

Use Maintenance -> Maps in the app for the normal path:

- Pick one or more regions.
- Pick a detail level.
- Keep the default 5 GB budget or adjust it.
- Choose the output folder if needed.
- Download selected regions while online.
- Use installed packs offline later.

The fallback script is still available:

```powershell
.\MapSetup.cmd
```

It offers:

- `1` for a small world overview map.
- `2` for a custom area map.
- `3` to open the official Protomaps download docs and a bounding-box helper.

When the script finishes, launch the app and import the generated `.pmtiles` file with Map Pack.

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

The helper script follows the Protomaps workflow: use the PMTiles CLI to extract a smaller `.pmtiles` file from a larger Protomaps basemap build. Protomaps documents this workflow in its basemap downloads and PMTiles CLI docs:

- https://docs.protomaps.com/basemaps/downloads
- https://docs.protomaps.com/pmtiles/cli

The full planet file is very large, so a starter overview or custom area extract is usually the better first map.
