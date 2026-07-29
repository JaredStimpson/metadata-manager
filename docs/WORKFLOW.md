# User Workflow

## First Run

1. Launch the app with `Run.cmd`.
2. Use the left rail in order: Import, Library, Edit, Export.
3. In Import, choose one folder as the current source. The app scans it and opens Library.
4. Keep the default sidecar mirror or choose another under Maintenance -> Settings.
5. Use Maintenance -> Maps for map downloads, installed packs, and active map selection.

## Current Source

Import is non-destructive, session-only registration. The app has exactly one current source:

- Choosing a different source clears the previous library view before scanning the new folder.
- Closing the app forgets the source path and cached photo records.
- Source photos, mirrored sidecars, map packs, and persistent settings remain on disk.
- Add Specific Photos registers selected files only when they are inside the current source.

The app scans supported photo files and reads:

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

Selection controls:

- Ctrl-click toggles individual photos.
- Shift-click selects a range from the last selected photo.
- Ctrl+A selects all filtered photos when the browser has focus.
- Remove From Library unregisters selected photos from the app without deleting files.

The current-source indicator above the browser shows only the active source. Rescan beside it checks that folder for new or changed photos.

## Geotagging

With an offline map pack installed:

1. Select a photo or batch of photos.
2. Open Edit and use the map button in the Metadata panel.
3. Click or drag the map pin.
4. Use Apply Pin.
5. The coordinates are saved to mirror sidecars.

Without a map pack, use the manual latitude and longitude fields.

Map downloading and installed-pack cleanup are not part of the photo workflow. Use Maintenance -> Maps for regions, depth/detail, budget, download output folder, active pack, unregister, and app-managed file deletion.

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

## Activity And Help

The docked Activity console shows a terminal-style session log. Every operation has a start line, progress messages, success or failure state, and elapsed time while running. Errors automatically expand the console so failures do not disappear.

Hover buttons, fields, status pills, source indicators, and map controls for a short explanation. Configuration controls are kept under Maintenance, while photo actions stay in Import, Library, Edit, or Export.
