import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inspectPmtiles } from '../src/main/metadata/map-pack';

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

    await expect(inspectPmtiles(filePath)).rejects.toThrow(/too small|Could not read PMTiles header/);
  });
});
