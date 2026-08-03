import { describe, expect, it } from 'vitest';
import { photoMetadataCapabilities } from '../src/shared/types';

describe('desktop bridge contract', () => {
  it('lists the IPC actions needed by the renderer workflow', () => {
    expect(photoMetadataCapabilities).toEqual(
      expect.arrayContaining([
        'healthCheck',
        'choosePhotoFolder',
        'choosePhotoFiles',
        'setSourceRoot',
        'addImportedFiles',
        'removeAssetsFromLibrary',
        'scanSourceRoot',
        'listAssets',
        'saveMetadata',
        'revertSidecars',
        'importMapPack',
        'rescanMapLibrary',
        'completeFirstRunSetup',
        'getMapDownloadPlan',
        'saveMapDownloadPreferences',
        'downloadMapSelection',
        'removeMapPack',
        'searchPlaces',
        'exportImmich',
        'openMapSetup',
        'onBackendLog',
        'onMapLibraryChanged'
      ])
    );
  });

  it('does not publish duplicate capability names', () => {
    expect(new Set(photoMetadataCapabilities).size).toBe(photoMetadataCapabilities.length);
  });
});
