import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { shell } from 'electron';
import { DatabaseService } from '../db/database';
import { ExifToolService } from '../metadata/exiftool';
import { inspectPmtiles } from '../metadata/map-pack';
import { hasMetadata, mergeMetadata, normalizeMetadata } from '../metadata/merge';
import {
  fallbackAdjacentSidecarPath,
  mirrorSidecarPath,
  normalizeRelativePath,
  preferredAdjacentSidecarPath,
  stagingMediaPath
} from '../metadata/paths';
import { removeXmpSidecar, writeXmpSidecar } from '../metadata/xmp';
import { isSupportedImagePath } from '../../shared/media';
import {
  defaultMapDownloadPreferences,
  estimateMapDownloadBytes,
  getMapDetail,
  getMapRegion,
  mapDetailPresets,
  mapRegionPresets,
  normalizeMapDownloadPreferences
} from '../../shared/mapCatalog';
import {
  AppSettings,
  ExportResult,
  ImportFilesResult,
  LocalPlace,
  MapDownloadJob,
  MapDownloadPlan,
  MapDownloadPreferences,
  MapDownloadRequest,
  MapDownloadResult,
  MapPack,
  MapPackMetadata,
  MetadataFields,
  MetadataPatch,
  PhotoAsset,
  RemoveAssetsResult,
  RemoveMapPackResult,
  SaveMetadataResult,
  ScanResult,
  SourceRoot
} from '../../shared/types';

export class LibraryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly exiftool: ExifToolService,
    private readonly projectRoot = process.cwd()
  ) {}

  async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    if (settings.sidecarRoot) {
      const resolved = path.resolve(settings.sidecarRoot);
      for (const sourceRoot of this.db.listSourceRoots()) {
        if (isSameOrChildPath(sourceRoot.path, resolved)) {
          throw new Error('Choose a sidecar mirror folder outside of your photo source folders.');
        }
      }
      settings.sidecarRoot = resolved;
    }
    return this.db.updateSettings(settings);
  }

  async addSourceRoots(paths: string[]): Promise<SourceRoot[]> {
    const settings = this.db.getSettings();
    const existing = this.db.listSourceRoots();
    const existingByPath = new Map(existing.map((root) => [normalizeFsPath(root.path), root]));
    const roots: SourceRoot[] = [];

    for (const rootPath of paths) {
      const resolved = path.resolve(rootPath);
      if (settings.sidecarRoot && isSameOrChildPath(resolved, settings.sidecarRoot)) {
        throw new Error('Choose photo source folders outside of the sidecar mirror folder.');
      }
      const current = existingByPath.get(normalizeFsPath(resolved));
      if (current) {
        roots.push(current);
        continue;
      }

      const stat = await fs.stat(resolved);
      if (!stat.isDirectory()) continue;

      const sourceRoot: SourceRoot = {
        id: crypto.randomUUID(),
        path: resolved,
        name: path.basename(resolved) || resolved,
        createdAt: new Date().toISOString()
      };
      await this.db.upsertSourceRoot(sourceRoot);
      roots.push(sourceRoot);
    }

    return roots;
  }

  async addImportedFiles(paths: string[]): Promise<ImportFilesResult> {
    const settings = this.db.getSettings();
    const rootsByPath = new Map(this.db.listSourceRoots().map((root) => [normalizeFsPath(root.path), root]));
    const sourceRootsById = new Map<string, SourceRoot>();
    const assets: PhotoAsset[] = [];
    const errors: ImportFilesResult['errors'] = [];
    let imported = 0;
    let skipped = 0;

    for (const filePath of paths) {
      const resolved = path.resolve(filePath);
      try {
        const stat = await fs.stat(resolved);
        if (!stat.isFile() || !isSupportedImagePath(resolved)) {
          skipped += 1;
          continue;
        }

        const sourceRoot = await this.ensureSourceRoot(path.dirname(resolved), rootsByPath);
        sourceRootsById.set(sourceRoot.id, sourceRoot);
        const asset = await this.buildAsset(sourceRoot, resolved, settings);
        this.db.upsertAsset(asset);
        assets.push(asset);
        imported += 1;
      } catch (error) {
        errors.push({ path: resolved, message: String((error as Error).message ?? error) });
      }
    }

    await this.db.commit();
    return {
      sourceRoots: [...sourceRootsById.values()],
      assets,
      imported,
      skipped,
      errors
    };
  }

  async scanSourceRoot(sourceRootId: string): Promise<ScanResult> {
    const sourceRoot = this.requireSourceRoot(sourceRootId);
    const settings = this.db.getSettings();
    const errors: ScanResult['errors'] = [];
    let scanned = 0;
    let addedOrUpdated = 0;
    let skipped = 0;

    for await (const filePath of walkFiles(sourceRoot.path)) {
      if (!isSupportedImagePath(filePath)) {
        skipped += 1;
        continue;
      }

      scanned += 1;
      try {
        const asset = await this.buildAsset(sourceRoot, filePath, settings);
        this.db.upsertAsset(asset);
        addedOrUpdated += 1;
      } catch (error) {
        errors.push({ path: filePath, message: String((error as Error).message ?? error) });
      }
    }

    sourceRoot.lastScanAt = new Date().toISOString();
    await this.db.upsertSourceRoot(sourceRoot);
    await this.db.commit();

    return { sourceRoot, scanned, addedOrUpdated, skipped, errors };
  }

  listAssets(options = {}): PhotoAsset[] {
    return this.db.listAssets(options);
  }

  async removeAssetsFromLibrary(assetIds: string[]): Promise<RemoveAssetsResult> {
    return { removed: await this.db.deleteAssetsByIds(assetIds) };
  }

  async saveMetadata(assetIds: string[], patch: MetadataPatch): Promise<SaveMetadataResult> {
    const settings = this.db.getSettings();
    if (!settings.sidecarRoot) {
      throw new Error('Choose a sidecar mirror folder before saving metadata.');
    }

    const updated: PhotoAsset[] = [];
    let sidecarsWritten = 0;

    for (const asset of this.db.getAssetsByIds(assetIds)) {
      const sourceRoot = this.requireSourceRoot(asset.sourceRootId);
      const nextMirror = applyPatchForSave(asset.mirrorSidecar ?? asset.effective, patch);
      const sidecarPath = asset.mirrorSidecarPath ?? mirrorSidecarPath(settings.sidecarRoot, sourceRoot.id, asset.relativePath);

      await writeXmpSidecar(sidecarPath, nextMirror);
      sidecarsWritten += 1;

      const merged = mergeMetadata(asset.embedded, asset.adjacentSidecar, nextMirror);
      const nextAsset: PhotoAsset = {
        ...asset,
        mirrorSidecar: nextMirror,
        mirrorSidecarPath: sidecarPath,
        effective: merged.effective,
        effectiveSource: merged.effectiveSource,
        sidecarStatus: merged.sidecarStatus,
        updatedAt: new Date().toISOString()
      };

      this.db.upsertAsset(nextAsset);
      await this.db.logEdit(asset.id, JSON.stringify(patch));
      updated.push(nextAsset);
    }

    await this.db.commit();
    return { assets: updated, sidecarsWritten };
  }

  async revertSidecars(assetIds: string[]): Promise<PhotoAsset[]> {
    const updated: PhotoAsset[] = [];

    for (const asset of this.db.getAssetsByIds(assetIds)) {
      if (asset.mirrorSidecarPath) {
        await removeXmpSidecar(asset.mirrorSidecarPath);
      }

      const merged = mergeMetadata(asset.embedded, asset.adjacentSidecar, undefined);
      const nextAsset: PhotoAsset = {
        ...asset,
        mirrorSidecar: undefined,
        effective: merged.effective,
        effectiveSource: merged.effectiveSource,
        sidecarStatus: merged.sidecarStatus,
        updatedAt: new Date().toISOString()
      };
      this.db.upsertAsset(nextAsset);
      updated.push(nextAsset);
    }

    await this.db.commit();
    return updated;
  }

  async importMapPack(filePath: string): Promise<MapPack> {
    const resolved = path.resolve(filePath);
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) throw new Error('Map pack must be a file.');

    const extension = path.extname(resolved).toLowerCase();
    const kind = extension === '.pmtiles' ? 'pmtiles' : extension === '.sqlite' || extension === '.db' ? 'places-sqlite' : undefined;
    if (!kind) throw new Error('Map packs must be .pmtiles, .sqlite, or .db files.');

    const existing = this.db.getMapPackByPath(resolved);
    const metadata = kind === 'pmtiles' ? await inspectPmtiles(resolved) : await this.inspectPlacesPack(resolved);
    if (kind === 'pmtiles' && metadata.tileType !== 'mvt') {
      throw new Error('The map panel supports vector PMTiles basemaps. Choose a vector .pmtiles file.');
    }

    const mapPack: MapPack = {
      id: existing?.id ?? crypto.randomUUID(),
      name: path.basename(resolved),
      path: resolved,
      kind,
      importedAt: existing?.importedAt ?? new Date().toISOString(),
      metadata
    };

    await this.db.addMapPack(mapPack);
    if (kind === 'pmtiles' && !this.db.getSettings().activeMapPackId) {
      await this.db.updateSettings({ activeMapPackId: mapPack.id });
    }
    return mapPack;
  }

  getMapDownloadPlan(): MapDownloadPlan {
    const preferences = normalizeMapDownloadPreferences(
      this.db.getSettings().mapDownloadPreferences ?? defaultMapDownloadPreferences()
    );
    const estimatedBytes = estimateMapDownloadBytes(preferences.regionIds, preferences.detailId);
    return {
      preferences,
      regions: mapRegionPresets,
      details: mapDetailPresets,
      estimatedBytes,
      budgetBytes: preferences.budgetBytes,
      overBudget: estimatedBytes > preferences.budgetBytes,
      installedPacks: this.db.listMapPacks().filter((pack) => pack.kind === 'pmtiles'),
      jobs: this.db.listMapDownloadJobs(),
      defaultOutputDirectory: getDefaultMapsDir()
    };
  }

  async saveMapDownloadPreferences(preferences: MapDownloadPreferences): Promise<MapDownloadPlan> {
    const normalized = normalizeMapDownloadPreferences(preferences);
    normalized.outputDirectory = normalized.outputDirectory ? path.resolve(normalized.outputDirectory) : undefined;
    await this.db.updateSettings({ mapDownloadPreferences: normalized });
    return this.getMapDownloadPlan();
  }

  async downloadMapSelection(request: MapDownloadRequest): Promise<MapDownloadResult> {
    const preferences = normalizeMapDownloadPreferences(request);
    const detail = getMapDetail(preferences.detailId);
    if (!detail) throw new Error('Choose a map detail level.');

    const estimatedBytes = estimateMapDownloadBytes(preferences.regionIds, preferences.detailId);
    const budgetBytes = request.budgetBytes ?? preferences.budgetBytes;
    if (estimatedBytes > budgetBytes) {
      throw new Error(`Selected maps are estimated above the active budget. Raise the budget or choose fewer regions.`);
    }

    const outputDirectory = path.resolve(preferences.outputDirectory || getDefaultMapsDir());
    await fs.mkdir(outputDirectory, { recursive: true });
    await this.saveMapDownloadPreferences({ ...preferences, outputDirectory, budgetBytes });

    const job: MapDownloadJob = {
      id: crypto.randomUUID(),
      regionIds: preferences.regionIds,
      detailId: preferences.detailId,
      maxZoom: detail.maxZoom,
      outputDirectory,
      sourceUrl: preferences.sourceUrl,
      estimatedBytes,
      outputPaths: preferences.regionIds.map((regionId) =>
        path.join(outputDirectory, `${slugFileName(getMapRegion(regionId)?.label ?? regionId)}_z${detail.maxZoom}.pmtiles`)
      ),
      status: 'running',
      createdAt: new Date().toISOString()
    };
    await this.db.upsertMapDownloadJob(job);

    const scriptPath = findMapScript(this.projectRoot);
    const mapPacks: MapPack[] = [];
    const errors: MapDownloadResult['errors'] = [];

    for (const regionId of preferences.regionIds) {
      const region = getMapRegion(regionId);
      if (!region) {
        errors.push({ regionId, message: 'Unknown region preset.' });
        continue;
      }

      const outputPath = path.join(outputDirectory, `${slugFileName(region.label)}_z${detail.maxZoom}.pmtiles`);
      const args = [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-Mode',
        region.bbox ? 'Custom' : 'Starter',
        '-MaxZoom',
        String(detail.maxZoom),
        '-Output',
        outputPath
      ];
      if (region.bbox) args.push('-Bbox', region.bbox.join(','));
      if (preferences.sourceUrl) args.push('-SourceUrl', preferences.sourceUrl);

      try {
        await runPowerShell(args, this.projectRoot);
        mapPacks.push(await this.importMapPack(outputPath));
      } catch (error) {
        errors.push({ regionId, message: String((error as Error).message ?? error) });
      }
    }

    const completedJob: MapDownloadJob = {
      ...job,
      status: errors.length === 0 ? 'completed' : 'failed',
      message:
        errors.length === 0
          ? `Downloaded and registered ${mapPacks.length} map pack${mapPacks.length === 1 ? '' : 's'}.`
          : `Downloaded ${mapPacks.length} map pack${mapPacks.length === 1 ? '' : 's'} with ${errors.length} error${errors.length === 1 ? '' : 's'}.`,
      completedAt: new Date().toISOString()
    };
    await this.db.upsertMapDownloadJob(completedJob);

    return { job: completedJob, mapPacks, errors };
  }

  async removeMapPack(id: string, deleteFile = false): Promise<RemoveMapPackResult> {
    const mapPack = this.db.getMapPack(id);
    if (!mapPack) {
      return {
        removed: false,
        deletedFile: false,
        settings: this.db.getSettings(),
        mapPacks: this.db.listMapPacks()
      };
    }

    const defaultMapsDir = getDefaultMapsDir();
    if (deleteFile && !isSameOrChildPath(defaultMapsDir, mapPack.path)) {
      throw new Error('Only map files in the app maps folder can be deleted from here. Unregister imported files instead.');
    }

    await this.db.removeMapPack(id);
    const settings = this.db.getSettings();
    let nextSettings = settings;
    if (settings.activeMapPackId === id) {
      nextSettings = await this.db.updateSettings({ activeMapPackId: undefined });
    }

    let deletedFile = false;
    if (deleteFile) {
      try {
        await fs.unlink(mapPack.path);
        deletedFile = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }

    return {
      removed: true,
      deletedFile,
      settings: nextSettings,
      mapPacks: this.db.listMapPacks()
    };
  }

  listMapPacks(): MapPack[] {
    return this.db.listMapPacks();
  }

  async searchPlaces(query: string): Promise<LocalPlace[]> {
    const text = query.trim();
    if (text.length < 2) return [];

    const placePacks = this.db.listMapPacks().filter((pack) => pack.kind === 'places-sqlite');
    const SQL = await initSqlJs({
      locateFile: (file) => path.join(process.cwd(), 'node_modules/sql.js/dist', file)
    });
    const results: LocalPlace[] = [];

    for (const pack of placePacks) {
      if (results.length >= 20) break;
      try {
        const db = new SQL.Database(await fs.readFile(pack.path));
        const columns = getTableColumns(db, 'places');
        const orderBy = columns.includes('population') ? 'population DESC NULLS LAST, name ASC' : 'name ASC';
        const statement = db.prepare(
          `SELECT rowid AS id, name, region, country, latitude, longitude
           FROM places
           WHERE name LIKE ?
           ORDER BY ${orderBy}
           LIMIT ?`,
          [`%${text}%`, 20 - results.length]
        );
        try {
          while (statement.step()) {
            const row = statement.getAsObject() as Record<string, unknown>;
            const latitude = Number(row.latitude);
            const longitude = Number(row.longitude);
            if (Number.isNaN(latitude) || Number.isNaN(longitude)) continue;
            results.push({
              id: String(row.id),
              name: String(row.name),
              region: row.region ? String(row.region) : undefined,
              country: row.country ? String(row.country) : undefined,
              latitude,
              longitude
            });
          }
        } finally {
          statement.free();
          db.close();
        }
      } catch {
        // Unsupported place-pack schemas are ignored; manual map pinning still works.
      }
    }

    return results;
  }

  private async inspectPlacesPack(filePath: string): Promise<MapPackMetadata> {
    const SQL = await initSqlJs({
      locateFile: (file) => path.join(process.cwd(), 'node_modules/sql.js/dist', file)
    });
    const db = new SQL.Database(await fs.readFile(filePath));
    try {
      const columns = getTableColumns(db, 'places');
      for (const required of ['name', 'latitude', 'longitude']) {
        if (!columns.includes(required)) {
          throw new Error(`Place packs need a places table with ${required}.`);
        }
      }
      const result = db.exec('SELECT COUNT(*) AS count FROM places')[0]?.values[0]?.[0];
      return { placesCount: Number(result) || 0 };
    } finally {
      db.close();
    }
  }

  async exportImmich(assetIds: string[] | 'all', destination: string): Promise<ExportResult> {
    const resolvedDestination = path.resolve(destination);
    const sourceRoots = this.db.listSourceRoots();
    for (const root of sourceRoots) {
      if (isSameOrChildPath(root.path, resolvedDestination)) {
        throw new Error('Choose a staging destination outside of the source photo folders.');
      }
    }

    const assets = assetIds === 'all' ? this.db.listAssets({ limit: 1000000 }) : this.db.getAssetsByIds(assetIds);
    const rootById = new Map(sourceRoots.map((root) => [root.id, root]));
    const errors: ExportResult['errors'] = [];
    let exportedAssets = 0;
    let hardlinked = 0;
    let copied = 0;
    let sidecarsWritten = 0;

    await fs.mkdir(resolvedDestination, { recursive: true });

    for (const asset of assets) {
      const sourceRoot = rootById.get(asset.sourceRootId);
      if (!sourceRoot) continue;

      const targetMediaPath = stagingMediaPath(resolvedDestination, sourceRoot.name, asset.relativePath);
      try {
        await fs.mkdir(path.dirname(targetMediaPath), { recursive: true });
        try {
          await fs.link(asset.absolutePath, targetMediaPath);
          hardlinked += 1;
        } catch {
          await fs.copyFile(asset.absolutePath, targetMediaPath);
          copied += 1;
        }

        await writeXmpSidecar(`${targetMediaPath}.xmp`, asset.effective);
        sidecarsWritten += 1;
        exportedAssets += 1;
      } catch (error) {
        errors.push({ path: asset.absolutePath, message: String((error as Error).message ?? error) });
      }
    }

    const result: ExportResult = {
      id: crypto.randomUUID(),
      destination: resolvedDestination,
      exportedAssets,
      hardlinked,
      copied,
      sidecarsWritten,
      errors,
      createdAt: new Date().toISOString()
    };

    await this.db.createExportJob({
      id: result.id,
      destination: result.destination,
      exportedAssets,
      errorsJson: JSON.stringify(errors),
      createdAt: result.createdAt
    });

    return result;
  }

  async revealPath(filePath: string): Promise<void> {
    await shell.openPath(filePath);
  }

  private requireSourceRoot(id: string): SourceRoot {
    const sourceRoot = this.db.getSourceRoot(id);
    if (!sourceRoot) throw new Error(`Unknown source root: ${id}`);
    return sourceRoot;
  }

  private async ensureSourceRoot(rootPath: string, rootsByPath?: Map<string, SourceRoot>): Promise<SourceRoot> {
    const resolved = path.resolve(rootPath);
    const map = rootsByPath ?? new Map(this.db.listSourceRoots().map((root) => [normalizeFsPath(root.path), root]));
    const existing = map.get(normalizeFsPath(resolved));
    if (existing) return existing;

    const containingRoot = [...map.values()].find((root) => isSameOrChildPath(root.path, resolved));
    if (containingRoot) return containingRoot;

    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      throw new Error('Imported files must belong to a readable folder.');
    }

    const sourceRoot: SourceRoot = {
      id: crypto.randomUUID(),
      path: resolved,
      name: path.basename(resolved) || resolved,
      createdAt: new Date().toISOString(),
      lastScanAt: new Date().toISOString()
    };
    await this.db.upsertSourceRoot(sourceRoot);
    map.set(normalizeFsPath(resolved), sourceRoot);
    return sourceRoot;
  }

  private async buildAsset(sourceRoot: SourceRoot, filePath: string, settings: AppSettings): Promise<PhotoAsset> {
    const stat = await fs.stat(filePath);
    const relativePath = normalizeRelativePath(sourceRoot.path, filePath);
    const preferredSidecar = preferredAdjacentSidecarPath(filePath);
    const fallbackSidecar = fallbackAdjacentSidecarPath(filePath);
    const adjacentSidecarPath = await firstExistingPath(preferredSidecar, fallbackSidecar);
    const mirrorPath = settings.sidecarRoot ? mirrorSidecarPath(settings.sidecarRoot, sourceRoot.id, relativePath) : undefined;

    const embedded = await this.exiftool.readEmbedded(filePath);
    const adjacentSidecar = adjacentSidecarPath ? await this.exiftool.readSidecar(adjacentSidecarPath) : undefined;
    const mirrorSidecar = mirrorPath ? await this.exiftool.readSidecar(mirrorPath) : undefined;
    const merged = mergeMetadata(embedded.metadata, adjacentSidecar, mirrorSidecar);
    const existing = this.db.getAssetByPath(filePath);

    return {
      id: existing?.id ?? crypto.randomUUID(),
      sourceRootId: sourceRoot.id,
      absolutePath: filePath,
      relativePath,
      filename: path.basename(filePath),
      extension: path.extname(filePath).toLowerCase(),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      width: embedded.width,
      height: embedded.height,
      embedded: embedded.metadata,
      adjacentSidecar: hasMetadata(adjacentSidecar) ? adjacentSidecar : undefined,
      mirrorSidecar: hasMetadata(mirrorSidecar) ? mirrorSidecar : undefined,
      effective: merged.effective,
      effectiveSource: merged.effectiveSource,
      sidecarStatus: merged.sidecarStatus,
      mirrorSidecarPath: mirrorPath,
      adjacentSidecarPath,
      updatedAt: new Date().toISOString()
    };
  }
}

function getTableColumns(db: SqlJsDatabase, table: string): string[] {
  return db.exec(`PRAGMA table_info(${table})`)[0]?.values.map((row) => String(row[1])) ?? [];
}

async function* walkFiles(directory: string): AsyncGenerator<string> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(absolute);
    } else if (entry.isFile()) {
      yield absolute;
    }
  }
}

async function firstExistingPath(...paths: string[]): Promise<string | undefined> {
  for (const filePath of paths) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) return filePath;
    } catch {
      // Try the next naming rule.
    }
  }
  return undefined;
}

function applyPatchForSave(base: MetadataFields, patch: MetadataPatch): MetadataFields {
  return normalizeMetadata({
    description: patch.description === undefined ? base.description : patch.description ?? undefined,
    rating: patch.rating === undefined ? base.rating : patch.rating ?? undefined,
    dateTimeOriginal: patch.dateTimeOriginal === undefined ? base.dateTimeOriginal : patch.dateTimeOriginal ?? undefined,
    latitude: patch.latitude === undefined ? base.latitude : patch.latitude ?? undefined,
    longitude: patch.longitude === undefined ? base.longitude : patch.longitude ?? undefined,
    tags: patch.tags === undefined ? base.tags : patch.tags
  });
}

function normalizeFsPath(filePath: string): string {
  return path.resolve(filePath).toLowerCase();
}

function isSameOrChildPath(parent: string, child: string): boolean {
  const parentPath = normalizeFsPath(parent);
  const childPath = normalizeFsPath(child);
  return childPath === parentPath || childPath.startsWith(`${parentPath}${path.sep}`);
}

function getDefaultMapsDir(): string {
  const documents = path.join(os.homedir(), 'Documents');
  return path.join(documents, 'Photo Metadata Manager', 'Maps');
}

function findMapScript(projectRoot: string): string {
  const candidates = [
    path.join(projectRoot, 'scripts', 'maps.ps1'),
    path.join(process.cwd(), 'scripts', 'maps.ps1')
  ];
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function slugFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'map';
}

async function runPowerShell(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell', args, {
      cwd,
      windowsHide: true
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(new Error(output.trim() || `PowerShell exited with code ${code ?? 'unknown'}.`));
    });
  });
}
