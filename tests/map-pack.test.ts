import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inspectPmtiles, sanitizeCustomMapStyle } from '../src/main/metadata/map-pack';

describe('PMTiles validation', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-meta-map-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('rejects files that are too small to contain a PMTiles header', async () => {
    const filePath = path.join(tempDir, 'invalid.pmtiles');
    await fs.writeFile(filePath, Buffer.alloc(16));

    await expect(inspectPmtiles(filePath)).rejects.toThrow(/too small|Could not read PMTiles archive/);
  });

  it('sanitizes custom styles to declared offline layers and system-font text', () => {
    const result = sanitizeCustomMapStyle({
      version: 8,
      glyphs: 'https://example.com/fonts/{fontstack}/{range}.pbf',
      sprite: 'https://example.com/sprite',
      layers: [
        { id: 'places', type: 'symbol', source: 'remote', 'source-layer': 'places', layout: { 'text-field': ['get', 'name'], 'text-font': ['Remote Font'], 'icon-image': 'marker' } },
        { id: 'unknown', type: 'fill', source: 'remote', 'source-layer': 'secret', paint: { 'fill-pattern': 'https://example.com/pattern' } }
      ]
    }, [{ id: 'places', fields: ['name'] }]);

    expect(result.layers).toHaveLength(1);
    expect(result.layers[0]).toMatchObject({ id: 'custom-places', source: 'offline', 'source-layer': 'places' });
    expect(result.layers[0].layout).toMatchObject({ 'text-font': ['Segoe UI'] });
    expect((result.layers[0].layout as Record<string, unknown>)['icon-image']).toBeUndefined();
    expect(result.warnings[0]).toMatch(/not declared/);
  });

  it('rejects malformed custom style objects without throwing', () => {
    expect(sanitizeCustomMapStyle({ version: 7, layers: [] }, []).layers).toEqual([]);
    expect(sanitizeCustomMapStyle({ version: 7, layers: [] }, []).warnings[0]).toMatch(/version 8/);
  });
});
