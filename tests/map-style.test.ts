import { describe, expect, it } from 'vitest';
import { buildStyle } from '../src/renderer/src/mapStyle';
import { MapPack } from '../src/shared/types';

describe('offline map styles', () => {
  it('derives Segoe UI labels for common vector layers without a glyph URL', () => {
    const style = buildStyle('http://127.0.0.1/map', pack({
      labelMode: 'protomaps',
      vectorLayers: [
        { id: 'places', fields: ['name', 'kind'] },
        { id: 'roads', fields: ['name', 'kind'] },
        { id: 'water', fields: ['kind'] }
      ]
    }));

    expect(style.glyphs).toBeUndefined();
    const labels = style.layers.filter((layer) => layer.type === 'symbol');
    expect(labels).toHaveLength(2);
    expect(labels.every((layer) => {
      const font = layer.type === 'symbol' ? layer.layout?.['text-font'] : undefined;
      return Array.isArray(font) && font[0] === 'Segoe UI';
    })).toBe(true);
  });

  it('keeps label layers but hides them when labels are disabled', () => {
    const style = buildStyle('http://127.0.0.1/map', pack({
      labelMode: 'common', vectorLayers: [{ id: 'place_label', fields: ['name_en'] }]
    }), false);

    const label = style.layers.find((layer) => layer.type === 'symbol');
    expect(label?.layout?.visibility).toBe('none');
  });

  it('does not add visual layers for undeclared schemas', () => {
    const style = buildStyle('http://127.0.0.1/map', pack({
      labelMode: 'none', vectorLayers: [{ id: 'arbitrary', fields: ['value'] }]
    }));

    expect(style.layers.map((layer) => layer.id)).toEqual(['background']);
  });
});

function pack(metadata: NonNullable<MapPack['metadata']>): MapPack {
  return {
    id: 'map-1', name: 'map.pmtiles', path: 'C:\\Maps\\map.pmtiles', kind: 'pmtiles',
    importedAt: '2026-01-01T00:00:00.000Z', origin: 'managed', availability: 'available', metadata
  };
}
