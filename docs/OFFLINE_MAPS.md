# Offline Maps

Offline maps use MapLibre GL JS with local `.pmtiles` files.

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

