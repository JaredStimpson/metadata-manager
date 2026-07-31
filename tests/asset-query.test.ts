import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../src/main/db/database';
import { PhotoAsset, SourceRoot } from '../src/shared/types';

describe('asset query filters and sorting', () => {
  let tempDir: string;
  let db: DatabaseService;
  let root: SourceRoot;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-meta-db-'));
    db = new DatabaseService(tempDir);
    await db.init();
    root = {
      id: 'root-1',
      path: path.join(tempDir, 'Photos'),
      name: 'Photos',
      createdAt: '2026-01-01T00:00:00.000Z'
    };
    await fs.mkdir(root.path);
    await db.upsertSourceRoot(root);
    db.upsertAsset(asset('a.jpg', { rating: 5, latitude: 34, longitude: -118, tags: ['trip'] }, 'mirror'));
    db.upsertAsset(asset('b.png', { rating: 2, tags: ['family'] }, 'none'));
    db.upsertAsset(asset('c.heic', { rating: 4, latitude: 40, longitude: -74, tags: ['trip', 'city'] }, 'conflict'));
    await db.commit();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('filters by missing location, edited status, rating, tag, and extension', () => {
    expect(db.listAssets({ filter: 'missing-location' }).map((item) => item.filename)).toEqual(['b.png']);
    expect(db.listAssets({ filter: 'edited' }).map((item) => item.filename)).toEqual(['a.jpg']);
    expect(db.listAssets({ rating: 4 }).map((item) => item.filename)).toEqual(['c.heic']);
    expect(db.listAssets({ tag: 'trip' }).map((item) => item.filename)).toEqual(['a.jpg', 'c.heic']);
    expect(db.listAssets({ extension: '.png' }).map((item) => item.filename)).toEqual(['b.png']);
  });

  it('sorts library results by rating and file type', () => {
    expect(db.listAssets({ sortBy: 'rating', sortDirection: 'desc' }).map((item) => item.filename)).toEqual([
      'a.jpg',
      'c.heic',
      'b.png'
    ]);
    expect(db.listAssets({ sortBy: 'fileType', sortDirection: 'asc' }).map((item) => item.filename)).toEqual([
      'c.heic',
      'a.jpg',
      'b.png'
    ]);
  });

  function asset(filename: string, effective: PhotoAsset['effective'], sidecarStatus: PhotoAsset['sidecarStatus']): PhotoAsset {
    return {
      id: filename,
      sourceRootId: root.id,
      absolutePath: path.join(root.path, filename),
      relativePath: filename,
      filename,
      extension: path.extname(filename),
      size: 100,
      mtimeMs: 1,
      embedded: { tags: [] },
      mirrorSidecar: sidecarStatus === 'mirror' || sidecarStatus === 'conflict' ? effective : undefined,
      effective,
      effectiveSource: sidecarStatus === 'none' ? 'embedded' : 'mirror-sidecar',
      sidecarStatus,
      mirrorSidecarPath: sidecarStatus === 'none' ? undefined : path.join(tempDir, 'Sidecars', `${filename}.xmp`),
      updatedAt: '2026-01-01T00:00:00.000Z'
    };
  }
});
