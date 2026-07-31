import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../src/main/db/database';
import { ExifToolService } from '../src/main/metadata/exiftool';
import { LibraryService } from '../src/main/services/library-service';
import { PhotoAsset, SourceRoot } from '../src/shared/types';

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

    await expect(library.setSourceRoot(tempDir)).rejects.toThrow(/separate from the sidecar mirror/);
  });

  it('adds individual files only under the current source root', async () => {
    const rootPath = path.join(tempDir, 'Photos');
    const nested = path.join(rootPath, 'Trip');
    const photo = path.join(nested, 'IMG_0001.jpg');
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(photo, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    await db.updateSettings({ sidecarRoot: path.join(tempDir, 'Sidecars') });
    const root = await library.setSourceRoot(rootPath);

    const result = await library.addImportedFiles([photo]);

    expect(result.imported).toBe(1);
    expect(result.sourceRoots).toHaveLength(1);
    expect(result.sourceRoots[0].id).toBe(root.id);
    expect(result.assets[0].sourceRootId).toBe(root.id);
    expect(result.assets[0].relativePath).toBe('Trip/IMG_0001.jpg');
  });

  it('replaces the current source and clears old session assets without deleting files', async () => {
    const firstRoot = await createRoot(tempDir, db, 'First');
    const firstPhoto = path.join(firstRoot.path, 'IMG_0001.jpg');
    await fs.writeFile(firstPhoto, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    db.upsertAsset(asset(firstRoot, firstPhoto));
    await db.commit();

    const secondPath = path.join(tempDir, 'Second');
    await fs.mkdir(secondPath, { recursive: true });
    const secondRoot = await library.setSourceRoot(secondPath);

    expect(db.listSourceRoots()).toHaveLength(1);
    expect(db.listSourceRoots()[0]).toMatchObject(secondRoot);
    expect(db.getAsset('asset-1')).toBeUndefined();
    await expect(fs.stat(firstPhoto)).resolves.toBeTruthy();
  });

  it('uses a stable source identity when the same folder is selected again', async () => {
    const rootPath = path.join(tempDir, 'Photos');
    await fs.mkdir(rootPath, { recursive: true });

    const first = await library.setSourceRoot(rootPath);
    const second = await library.setSourceRoot(rootPath);

    expect(second.id).toBe(first.id);
  });

  it('clears session caches when the source changes or the photo session closes', async () => {
    let clearCount = 0;
    const libraryWithCache = new LibraryService(db, fakeExifTool(), process.cwd(), {
      sessionCache: {
        clear: async () => {
          clearCount += 1;
        }
      }
    });
    const firstPath = path.join(tempDir, 'First');
    const secondPath = path.join(tempDir, 'Second');
    await fs.mkdir(firstPath, { recursive: true });
    await fs.mkdir(secondPath, { recursive: true });

    await libraryWithCache.setSourceRoot(firstPath);
    await libraryWithCache.setSourceRoot(secondPath);
    await libraryWithCache.clearPhotoSession();

    expect(clearCount).toBe(3);
  });

  it('clears source paths and assets while preserving persistent settings', async () => {
    const root = await createRoot(tempDir, db, 'Photos');
    const photo = path.join(root.path, 'IMG_0003.jpg');
    await fs.writeFile(photo, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    db.upsertAsset(asset(root, photo));
    await db.updateSettings({ sidecarRoot: path.join(tempDir, 'Sidecars') });
    await db.commit();

    await library.clearPhotoSession();

    expect(db.listSourceRoots()).toEqual([]);
    expect(db.listAssets()).toEqual([]);
    expect(db.getSettings().sidecarRoot).toBe(path.join(tempDir, 'Sidecars'));
  });

  it('moves legacy random-ID sidecar mirrors to the stable source identity before clearing', async () => {
    const root = await createRoot(tempDir, db, 'Photos');
    const sidecarRoot = path.join(tempDir, 'Sidecars');
    const legacySidecar = path.join(sidecarRoot, root.id, 'IMG_0004.jpg.xmp');
    await fs.mkdir(path.dirname(legacySidecar), { recursive: true });
    await fs.writeFile(legacySidecar, '<xmpmeta />');
    await db.updateSettings({ sidecarRoot });

    await library.clearPhotoSession();
    const stableRoot = await library.setSourceRoot(root.path);

    await expect(fs.readFile(path.join(sidecarRoot, stableRoot.id, 'IMG_0004.jpg.xmp'), 'utf8')).resolves.toBe(
      '<xmpmeta />'
    );
  });

  it('removes photos from the library without deleting source files', async () => {
    const root = await createRoot(tempDir, db, 'Photos');
    const photo = path.join(root.path, 'IMG_0002.jpg');
    await fs.writeFile(photo, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    db.upsertAsset(asset(root, photo));
    await db.commit();

    const result = await library.removeAssetsFromLibrary(['asset-1']);

    expect(result.removed).toBe(1);
    expect(db.getAsset('asset-1')).toBeUndefined();
    await expect(fs.stat(photo)).resolves.toBeTruthy();
  });

  it('persists map download preferences in the plan', async () => {
    const plan = await library.saveMapDownloadPreferences({
      regionIds: ['us-west'],
      detailId: 'regional',
      budgetBytes: 3 * 1024 * 1024 * 1024,
      outputDirectory: path.join(tempDir, 'Maps')
    });

    expect(plan.preferences.regionIds).toEqual(['us-west']);
    expect(plan.preferences.detailId).toBe('regional');
    expect(plan.overBudget).toBe(false);
    expect(library.getMapDownloadPlan().preferences.outputDirectory).toBe(path.join(tempDir, 'Maps'));
  });
});

async function createRoot(tempDir: string, db: DatabaseService, name: string): Promise<SourceRoot> {
  const root: SourceRoot = {
    id: 'root-1',
    path: path.join(tempDir, name),
    name,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
  await fs.mkdir(root.path, { recursive: true });
  await db.upsertSourceRoot(root);
  return root;
}

function asset(root: SourceRoot, absolutePath: string): PhotoAsset {
  return {
    id: 'asset-1',
    sourceRootId: root.id,
    absolutePath,
    relativePath: path.basename(absolutePath),
    filename: path.basename(absolutePath),
    extension: '.jpg',
    size: 100,
    mtimeMs: 1,
    embedded: { tags: [] },
    effective: { tags: [] },
    effectiveSource: 'embedded',
    sidecarStatus: 'none',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

function fakeExifTool(): ExifToolService {
  return {
    readEmbedded: async () => ({ metadata: { tags: [] as string[] } }),
    readSidecar: async () => ({ tags: [] as string[] }),
    extractBestPreview: async () => false,
    end: async () => undefined
  } as ExifToolService;
}
