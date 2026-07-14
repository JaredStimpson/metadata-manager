# Metadata and Immich Compatibility

The app writes XMP sidecars designed for Immich-friendly backup/import workflows.

## Normal Editing

Normal edits are written to a mirror sidecar folder:

```text
SidecarRoot/
  <sourceRootId>/
    <relative/photo/path>/
      IMG_0001.jpg.xmp
```

This keeps original photo folders untouched.

## Immich Staging

Immich expects sidecars beside media files. The app handles that by creating a staging export:

```text
ImmichStage/
  Camera Roll/
    2026/
      IMG_0001.jpg
      IMG_0001.jpg.xmp
```

Point Immich import or backup tooling at the staging folder when you are ready.

## Metadata Precedence

The UI resolves metadata in this order:

1. Mirror sidecar edits.
2. Existing adjacent sidecar metadata.
3. Embedded media metadata.

If both mirror and adjacent sidecars exist, the app shows a conflict badge and still prefers the mirror sidecar.

## Fields Written

The generated XMP can include:

- `dc:description`
- `tiff:ImageDescription`
- `xmp:Rating`
- `exif:DateTimeOriginal`
- `photoshop:DateCreated`
- `exif:GPSLatitude`
- `exif:GPSLongitude`
- `digiKam:TagsList`
- `lr:HierarchicalSubject`
- `dc:subject`

GPS coordinates are written in XMP `GPSCoordinate` format, for example:

```text
37,49.194000N
122,28.698000W
```

## Things This App Avoids

- It does not rewrite photo binaries.
- It does not write sidecars into source folders during normal editing.
- It does not require internet during normal geotagging after map packs are imported.

