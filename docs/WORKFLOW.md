# User Workflow

## First Run

1. Launch the app with `Launch.cmd`.
2. Choose one or more photo source folders.
3. Choose a sidecar mirror folder.
4. Optionally import a `.pmtiles` offline map pack.
5. Scan each source folder.

## Source Folders

Source folders are read-only inputs. The app scans supported photo files and reads:

- Embedded metadata through `exiftool-vendored`.
- Adjacent sidecars if they already exist next to the media.
- Mirror sidecars from the configured sidecar mirror folder.

## Editing Metadata

Select one or more photos, then edit:

- Description
- Rating
- Date/time
- Latitude and longitude
- Tags

Saving writes only to the mirror sidecar folder. Original media files are not modified.

## Geotagging

With an offline map pack installed:

1. Select a photo or batch of photos.
2. Click or drag the map pin.
3. Use Apply Pin.
4. The coordinates are saved to mirror sidecars.

Without a map pack, use the manual latitude and longitude fields.

## Batch Editing

When multiple photos are selected, blank fields are left unchanged. Filled fields are applied to every selected photo.

## Reverting Edits

Use Revert to remove the mirror sidecar for selected photos. The UI then falls back to adjacent sidecar metadata or embedded metadata.

## Immich Export

Use Export Selected or Export All to choose a staging folder. The app creates media files plus sidecars next to them in the layout Immich expects.

The export tries to hardlink media first. If hardlinking fails, it copies the media file.

