import { describe, expect, it } from 'vitest';
import {
  buildMetadataPatch,
  formFromSelection,
  parseCoordinatePair,
  uniqueTags
} from '../src/renderer/src/metadataForm';
import { PhotoAsset } from '../src/shared/types';

describe('metadata form batching', () => {
  it('marks mixed fields without writing them unless the user changes them', () => {
    const { form, mixed } = formFromSelection([
      asset('a', { description: 'first', rating: 4, tags: ['trip'] }),
      asset('b', { description: 'second', rating: 4, tags: ['trip'] })
    ]);

    expect([...mixed]).toEqual(['description']);
    expect(form.rating).toBe('4');

    const patch = buildMetadataPatch({ ...form, rating: '5' }, new Set(['rating']));
    expect(patch).toEqual({ rating: 5 });
  });

  it('deduplicates tag edits before saving', () => {
    const patch = buildMetadataPatch(
      {
        description: '',
        rating: '',
        dateTimeOriginal: '',
        latitude: '',
        longitude: '',
        coordinatePaste: '',
        tags: ['family', ' Family ', 'travel', 'family']
      },
      new Set(['tags'])
    );

    expect(patch.tags).toEqual(['family', 'Family', 'travel']);
    expect(uniqueTags(['', 'one', 'one', ' two '])).toEqual(['one', 'two']);
  });

  it('parses paste-friendly coordinates and rejects impossible ones', () => {
    expect(parseCoordinatePair('34.0522, -118.2437')).toEqual({ latitude: '34.0522', longitude: '-118.2437' });
    expect(parseCoordinatePair('91, 0')).toBeUndefined();
    expect(parseCoordinatePair('not coordinates')).toBeUndefined();
  });
});

function asset(id: string, effective: PhotoAsset['effective']): PhotoAsset {
  return {
    id,
    sourceRootId: 'root',
    absolutePath: `C:\\Photos\\${id}.jpg`,
    relativePath: `${id}.jpg`,
    filename: `${id}.jpg`,
    extension: '.jpg',
    size: 100,
    mtimeMs: 1,
    embedded: { tags: [] },
    effective,
    effectiveSource: 'embedded',
    sidecarStatus: 'none',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}
