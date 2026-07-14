import { describe, expect, it } from 'vitest';
import { buildXmp, decimalToXmpGps, parseGps, parseXmp } from '../src/main/metadata/xmp';

describe('XMP sidecars', () => {
  it('writes Immich-readable metadata fields', () => {
    const xml = buildXmp({
      description: 'Golden Gate picnic',
      rating: 4,
      dateTimeOriginal: '2026-07-13T19:15:30',
      latitude: 37.8199,
      longitude: -122.4783,
      tags: ['family', 'travel']
    });

    expect(xml).toContain('<dc:description>');
    expect(xml).toContain('<xmp:Rating>4</xmp:Rating>');
    expect(xml).toContain('<exif:DateTimeOriginal>2026:07:13 19:15:30</exif:DateTimeOriginal>');
    expect(xml).toContain('<exif:GPSLatitude>37,49.194000N</exif:GPSLatitude>');
    expect(xml).toContain('<exif:GPSLongitude>122,28.698000W</exif:GPSLongitude>');
    expect(xml).toContain('<digiKam:TagsList>');
  });

  it('round-trips the fields this app owns', () => {
    const parsed = parseXmp(
      buildXmp({
        description: 'Trailhead',
        rating: 5,
        dateTimeOriginal: '2024:03:01 08:00:00',
        latitude: 46.8523,
        longitude: -121.7603,
        tags: ['mountain', 'winter']
      })
    );

    expect(parsed.description).toBe('Trailhead');
    expect(parsed.rating).toBe(5);
    expect(parsed.dateTimeOriginal).toBe('2024:03:01 08:00:00');
    expect(parsed.latitude).toBe(46.8523);
    expect(parsed.longitude).toBe(-121.7603);
    expect(parsed.tags).toEqual(['mountain', 'winter']);
  });

  it('does not treat subject tags as description', () => {
    const parsed = parseXmp('<dc:subject><rdf:Bag><rdf:li>parks</rdf:li></rdf:Bag></dc:subject>');
    expect(parsed.description).toBeUndefined();
    expect(parsed.tags).toEqual(['parks']);
  });

  it('converts decimal GPS coordinates to XMP GPSCoordinate values', () => {
    expect(decimalToXmpGps(-33.865143, 'lat')).toBe('33,51.908580S');
    expect(decimalToXmpGps(151.2099, 'lng')).toBe('151,12.594000E');
    expect(parseGps('33,51.908580S')).toBe(-33.865143);
    expect(parseGps('151,12.594000E')).toBe(151.2099);
  });
});

