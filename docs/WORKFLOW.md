# User Workflow

## First Run

1. Launch the app with `Run.cmd`.
2. Use the left rail in order: Import, Library, Edit, Export.
3. In Import, choose individual photo files or whole folders.
4. Keep the default sidecar mirror or choose another mirror folder.
5. Open Tools for map setup, then import a `.pmtiles` offline map pack or keep using manual coordinates.

## Source Folders

Import is non-destructive registration. Source folders and individual files are read-only inputs. The app scans supported photo files and reads:

- Embedded metadata through `exiftool-vendored`.
- Adjacent sidecars if they already exist next to the media.
- Mirror sidecars from the configured sidecar mirror folder.

## Editing Metadata

Browse photos in the center library, switch between thumbnail/detail view, filter/sort the list, then select one or more photos. The right inspector edits:

- Description
- Rating
- Date/time
- Latitude and longitude
- Tags

Saving writes only to the mirror sidecar folder. Original media files are not modified.

When multiple photos are selected, mixed values are marked. Only fields you change are written to the selected sidecars.

## Geotagging

With an offline map pack installed:

1. Select a photo or batch of photos.
2. Click or drag the map pin.
3. Use Apply Pin.
4. The coordinates are saved to mirror sidecars.

Without a map pack, use the manual latitude and longitude fields.

## Batch Editing

Batch editing supports description, rating, date/time, GPS, and tags. Mixed fields are left unchanged until you edit them.

GPS accepts manual latitude and longitude, pasted `lat, lon`, or a map pin.

## Reverting Edits

Use Revert to remove the mirror sidecar for selected photos. The UI then falls back to adjacent sidecar metadata or embedded metadata.

## Immich Export

Use Export Selected or Export All to choose a staging folder. The app creates media files plus sidecars next to them in the layout Immich expects.

The export tries to hardlink media first. If hardlinking fails, it copies the media file.

## Bridge Health

The startup banner shows whether the Electron preload bridge is connected. If the app is opened as plain HTML in a browser, it shows a clear "Desktop bridge unavailable" screen because file dialogs, scans, sidecar writes, map import, and export require Electron.
