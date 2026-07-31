import fs from 'node:fs/promises';
import path from 'node:path';
import { nativeImage } from 'electron';
import { PhotoAsset } from '../../shared/types';
import { ExifToolService } from '../metadata/exiftool';
import { BackendLogger } from './backend-logger';
import { ThumbnailResponse } from './backend-server';

const THUMBNAIL_SIZE = { width: 420, height: 280 };

export class ThumbnailCache {
  readonly directory: string;
  private epoch = 0;
  private readonly pending = new Map<string, Promise<ThumbnailResponse | undefined>>();

  constructor(
    userDataPath: string,
    private readonly exiftool: ExifToolService,
    private readonly logger: BackendLogger
  ) {
    this.directory = path.join(userDataPath, 'cache', 'thumbnails');
  }

  async clear(): Promise<void> {
    this.epoch += 1;
    this.pending.clear();
    await fs.rm(this.directory, { recursive: true, force: true });
    await fs.mkdir(this.directory, { recursive: true });
    this.logger.info('thumbnails', 'Session thumbnail cache cleared.', {
      details: { directory: this.directory }
    });
  }

  async get(asset: PhotoAsset): Promise<ThumbnailResponse | undefined> {
    const cacheKey = `${asset.id}-${Math.trunc(asset.mtimeMs)}-${asset.size}`;
    const outputPath = path.join(this.directory, `${cacheKey}.jpg`);
    try {
      await fs.access(outputPath);
      return { path: outputPath, contentType: 'image/jpeg' };
    } catch {
      // Generate a cache entry on first visible request.
    }

    const existing = this.pending.get(cacheKey);
    if (existing) return existing;
    const promise = this.generate(asset, outputPath, this.epoch).finally(() => this.pending.delete(cacheKey));
    this.pending.set(cacheKey, promise);
    return promise;
  }

  private async generate(
    asset: PhotoAsset,
    outputPath: string,
    generationEpoch: number
  ): Promise<ThumbnailResponse | undefined> {
    await fs.mkdir(this.directory, { recursive: true });
    const tempOutput = `${outputPath}.${crypto.randomUUID()}.tmp`;
    const extractedPreview = `${outputPath}.${crypto.randomUUID()}.preview.jpg`;

    try {
      let thumbnail = await nativeImage.createThumbnailFromPath(asset.absolutePath, THUMBNAIL_SIZE);
      if (thumbnail.isEmpty()) {
        const extracted = await this.exiftool.extractBestPreview(asset.absolutePath, extractedPreview);
        if (!extracted) throw new Error('No native or embedded preview was available.');
        thumbnail = await nativeImage.createThumbnailFromPath(extractedPreview, THUMBNAIL_SIZE);
      }
      if (thumbnail.isEmpty()) throw new Error('Thumbnail decoder returned an empty image.');
      await fs.writeFile(tempOutput, thumbnail.toJPEG(82));

      if (generationEpoch !== this.epoch) {
        await fs.rm(tempOutput, { force: true });
        return undefined;
      }

      await fs.rename(tempOutput, outputPath);
      this.logger.debug('thumbnails', `Cached thumbnail for ${asset.filename}.`, {
        details: { assetId: asset.id, outputPath }
      });
      return { path: outputPath, contentType: 'image/jpeg' };
    } catch (error) {
      this.logger.warn('thumbnails', `Thumbnail unavailable for ${asset.filename}.`, {
        details: { assetId: asset.id, message: error instanceof Error ? error.message : String(error) }
      });
      return undefined;
    } finally {
      await fs.rm(tempOutput, { force: true });
      await fs.rm(extractedPreview, { force: true });
    }
  }
}
