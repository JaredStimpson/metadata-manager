import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../src/main/db/database';
import { ExifToolService } from '../src/main/metadata/exiftool';
import { LibraryService } from '../src/main/services/library-service';
import { SourceRoot } from '../src/shared/types';

describe('library import safety', () => {
  let tempDir: string;
  let db: DatabaseService;
  let library: LibraryService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-meta-library-'));
    db = new DatabaseService(tempDir);
    await db.init();
    library = new LibraryService(db, fakeExifTool());
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('rejects source roots that would contain the sidecar mirror', async () => {
    await db.updateSettings({ sidecarRoot: path.join(tempDir, 'Sidecars') });

    await expect(library.addSourceRoots([tempDir])).rejects.toThrow(/outside of the sidecar mirror/);
  });

  it('reuses an existing ancestor source root when importing individual files', async () => {
    const root: SourceRoot = {
      id: 'root-1',
      path: path.join(tempDir, 'Photos'),
      name: 'Photos',
      createdAt: '2026-01-01T00:00:00.000Z'
    };
    const nested = path.join(root.path, 'Trip');
    const photo = path.join(nested, 'IMG_0001.jpg');
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(photo, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    await db.updateSettings({ sidecarRoot: path.join(tempDir, 'Sidecars') });
    await db.upsertSourceRoot(root);

    const result = await library.addImportedFiles([photo]);

    expect(result.imported).toBe(1);
    expect(result.sourceRoots).toHaveLength(1);
    expect(result.sourceRoots[0].id).toBe(root.id);
    expect(result.assets[0].sourceRootId).toBe(root.id);
    expect(result.assets[0].relativePath).toBe('Trip/IMG_0001.jpg');
  });
});

function fakeExifTool(): ExifToolService {
  return {
    readEmbedded: async () => ({ metadata: { tags: [] as string[] } }),
    readSidecar: async () => ({ tags: [] as string[] }),
    end: async () => undefined
  } as ExifToolService;
}
