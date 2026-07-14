import { describe, expect, it } from 'vitest';
import { mergeMetadata } from '../src/main/metadata/merge';
import { mirrorSidecarPath, stagingMediaPath } from '../src/main/metadata/paths';

describe('metadata precedence', () => {
  it('prefers mirror sidecars over adjacent sidecars and embedded metadata', () => {
    const result = mergeMetadata(
      { description: 'embedded', tags: [] },
      { description: 'adjacent', tags: [] },
      { description: 'mirror', tags: [] }
    );

    expect(result.effective.description).toBe('mirror');
    expect(result.effectiveSource).toBe('mirror-sidecar');
    expect(result.sidecarStatus).toBe('conflict');
  });

  it('falls back to adjacent sidecars before embedded metadata', () => {
    const result = mergeMetadata({ description: 'embedded', tags: [] }, { description: 'adjacent', tags: [] });

    expect(result.effective.description).toBe('adjacent');
    expect(result.effectiveSource).toBe('adjacent-sidecar');
    expect(result.sidecarStatus).toBe('adjacent');
  });
});

describe('sidecar mirror paths', () => {
  it('places sidecars under source root id while preserving relative path', () => {
    expect(mirrorSidecarPath('D:/Sidecars', 'root-1', 'Trips/IMG_0001.jpg')).toMatch(
      /D:[/\\]Sidecars[/\\]root-1[/\\]Trips[/\\]IMG_0001\.jpg\.xmp$/
    );
  });

  it('stages media where Immich can find filename.ext.xmp beside it', () => {
    const mediaPath = stagingMediaPath('E:/ImmichStage', 'Camera Roll', '2026/IMG_0001.jpg');
    expect(`${mediaPath}.xmp`).toMatch(/E:[/\\]ImmichStage[/\\]Camera Roll[/\\]2026[/\\]IMG_0001\.jpg\.xmp$/);
  });
});
