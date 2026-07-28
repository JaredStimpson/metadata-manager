# Offline Maps

Offline maps use MapLibre GL JS with local `.pmtiles` files.

## Beginner Path

Run:

```powershell
.\MapSetup.cmd
```

Choose:

- `1` for a small world overview map.
- `2` for a custom area map.
- `3` to open the official Protomaps download docs and a bounding-box helper.

When the script finishes, launch the app and import the generated `.pmtiles` file with Map Pack.

## Importing a Map Pack

1. Launch the app.
2. Use Map Pack in the top toolbar.
3. Choose a `.pmtiles` file.
4. Select it in the Geotag panel.

The app runs a localhost-only tile server so MapLibre can request byte ranges from the local file. The renderer never receives broad filesystem access.

## Normal Offline Use

After importing a `.pmtiles` file, normal geotagging does not require internet access.

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

If no map pack or place pack is installed, the metadata inspector still supports direct latitude and longitude entry.

## Where the Map Data Comes From

The helper script follows the Protomaps workflow: use the PMTiles CLI to extract a smaller `.pmtiles` file from a larger Protomaps basemap build. Protomaps documents this workflow in its basemap downloads and PMTiles CLI docs:

- https://docs.protomaps.com/basemaps/downloads
- https://docs.protomaps.com/pmtiles/cli

The full planet file is very large, so a starter overview or custom area extract is usually the better first map.
