import fs from 'node:fs/promises';
import path from 'node:path';
import initSqlJs, { Database, SqlJsStatic, SqlValue } from 'sql.js';
import {
  AppSettings,
  AssetSortBy,
  MapDownloadJob,
  MapPack,
  MetadataFields,
  MetadataSource,
  PhotoAsset,
  SidecarStatus,
  SortDirection,
  SourceRoot,
  emptyMetadata
} from '../../shared/types';
import { metadataFromUnknown } from '../metadata/xmp';

interface AssetRow {
  id: string;
  source_root_id: string;
  absolute_path: string;
  relative_path: string;
  filename: string;
  extension: string;
  size: number;
  mtime_ms: number;
  width?: number;
  height?: number;
  embedded_json: string;
  adjacent_sidecar_json?: string;
  mirror_sidecar_json?: string;
  effective_json: string;
  effective_source: MetadataSource;
  sidecar_status: SidecarStatus;
  mirror_sidecar_path?: string;
  adjacent_sidecar_path?: string;
  updated_at: string;
}

interface MapPackRow {
  id: string;
  name: string;
  path: string;
  kind: 'pmtiles' | 'places-sqlite';
  importedAt: string;
  origin?: MapPack['origin'];
  availability?: MapPack['availability'];
  lastSeenAt?: string;
  metadata_json?: string;
}

interface MapDownloadJobRow {
  id: string;
  region_ids_json: string;
  detail_id: string;
  max_zoom: number;
  output_directory: string;
  source_url?: string;
  estimated_bytes: number;
  output_paths_json: string;
  status: MapDownloadJob['status'];
  message?: string;
  created_at: string;
  completed_at?: string;
}

export class DatabaseService {
  private SQL?: SqlJsStatic;
  private db?: Database;
  private readonly filePath: string;

  constructor(userDataPath: string, private readonly sqlWasmPath?: string) {
    this.filePath = path.join(userDataPath, 'photo-metadata-manager.sqlite');
  }

  async init(): Promise<void> {
    this.SQL = await initSqlJs({
      locateFile: (file) => this.sqlWasmPath ?? path.join(process.cwd(), 'node_modules/sql.js/dist', file)
    });

    try {
      const data = await fs.readFile(this.filePath);
      this.db = new this.SQL.Database(data);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
      this.db = new this.SQL.Database();
    }

    this.migrate();
    await this.save();
  }

  getSettings(): AppSettings {
    const rows = this.select<{ key: string; value: string }>('SELECT key, value FROM settings');
    return rows.reduce<AppSettings>((settings, row) => {
      return { ...settings, [row.key]: JSON.parse(row.value) };
    }, {});
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') {
        this.run('DELETE FROM settings WHERE key = ?', [key]);
      } else {
        this.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
      }
    }
    await this.save();
    return this.getSettings();
  }

  listSourceRoots(): SourceRoot[] {
    return this.select<SourceRoot>('SELECT * FROM source_roots ORDER BY createdAt ASC');
  }

  async upsertSourceRoot(sourceRoot: SourceRoot): Promise<void> {
    this.run(
      `INSERT INTO source_roots (id, path, name, createdAt, lastScanAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        path = excluded.path,
        name = excluded.name,
        lastScanAt = excluded.lastScanAt`,
      [sourceRoot.id, sourceRoot.path, sourceRoot.name, sourceRoot.createdAt, sourceRoot.lastScanAt]
    );
    await this.save();
  }

  getSourceRoot(id: string): SourceRoot | undefined {
    return this.selectOne<SourceRoot>('SELECT * FROM source_roots WHERE id = ?', [id]);
  }

  listMapPacks(): MapPack[] {
    return this.select<MapPackRow>('SELECT * FROM map_packs ORDER BY importedAt DESC').map(mapMapPack);
  }

  getMapPack(id: string): MapPack | undefined {
    const row = this.selectOne<MapPackRow>('SELECT * FROM map_packs WHERE id = ?', [id]);
    return row ? mapMapPack(row) : undefined;
  }

  getMapPackByPath(filePath: string): MapPack | undefined {
    const row = this.selectOne<MapPackRow>('SELECT * FROM map_packs WHERE path = ?', [filePath]);
    return row ? mapMapPack(row) : undefined;
  }

  async addMapPack(mapPack: MapPack): Promise<void> {
    this.run(
      `INSERT OR REPLACE INTO map_packs (
        id, name, path, kind, importedAt, origin, availability, lastSeenAt, metadata_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mapPack.id,
        mapPack.name,
        mapPack.path,
        mapPack.kind,
        mapPack.importedAt,
        mapPack.origin,
        mapPack.availability,
        mapPack.lastSeenAt,
        mapPack.metadata ? JSON.stringify(mapPack.metadata) : undefined
      ]
    );
    await this.save();
  }

  async removeMapPack(id: string): Promise<MapPack | undefined> {
    const existing = this.getMapPack(id);
    if (!existing) return undefined;
    this.run('DELETE FROM map_packs WHERE id = ?', [id]);
    await this.save();
    return existing;
  }

  listMapDownloadJobs(): MapDownloadJob[] {
    return this.select<MapDownloadJobRow>('SELECT * FROM map_download_jobs ORDER BY created_at DESC LIMIT 20').map(
      mapMapDownloadJob
    );
  }

  async upsertMapDownloadJob(job: MapDownloadJob): Promise<void> {
    this.run(
      `INSERT INTO map_download_jobs (
        id, region_ids_json, detail_id, max_zoom, output_directory, source_url,
        estimated_bytes, output_paths_json, status, message, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        region_ids_json = excluded.region_ids_json,
        detail_id = excluded.detail_id,
        max_zoom = excluded.max_zoom,
        output_directory = excluded.output_directory,
        source_url = excluded.source_url,
        estimated_bytes = excluded.estimated_bytes,
        output_paths_json = excluded.output_paths_json,
        status = excluded.status,
        message = excluded.message,
        completed_at = excluded.completed_at`,
      [
        job.id,
        JSON.stringify(job.regionIds),
        job.detailId,
        job.maxZoom,
        job.outputDirectory,
        job.sourceUrl,
        job.estimatedBytes,
        JSON.stringify(job.outputPaths),
        job.status,
        job.message,
        job.createdAt,
        job.completedAt
      ]
    );
    await this.save();
  }

  upsertAsset(asset: PhotoAsset): void {
    this.run(
      `INSERT INTO assets (
        id, source_root_id, absolute_path, relative_path, filename, extension,
        size, mtime_ms, width, height, embedded_json, adjacent_sidecar_json,
        mirror_sidecar_json, effective_json, effective_source, sidecar_status,
        mirror_sidecar_path, adjacent_sidecar_path, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(absolute_path) DO UPDATE SET
        source_root_id = excluded.source_root_id,
        relative_path = excluded.relative_path,
        filename = excluded.filename,
        extension = excluded.extension,
        size = excluded.size,
        mtime_ms = excluded.mtime_ms,
        width = excluded.width,
        height = excluded.height,
        embedded_json = excluded.embedded_json,
        adjacent_sidecar_json = excluded.adjacent_sidecar_json,
        mirror_sidecar_json = excluded.mirror_sidecar_json,
        effective_json = excluded.effective_json,
        effective_source = excluded.effective_source,
        sidecar_status = excluded.sidecar_status,
        mirror_sidecar_path = excluded.mirror_sidecar_path,
        adjacent_sidecar_path = excluded.adjacent_sidecar_path,
        updated_at = excluded.updated_at`,
      [
        asset.id,
        asset.sourceRootId,
        asset.absolutePath,
        asset.relativePath,
        asset.filename,
        asset.extension,
        asset.size,
        asset.mtimeMs,
        asset.width,
        asset.height,
        JSON.stringify(asset.embedded),
        asset.adjacentSidecar ? JSON.stringify(asset.adjacentSidecar) : undefined,
        asset.mirrorSidecar ? JSON.stringify(asset.mirrorSidecar) : undefined,
        JSON.stringify(asset.effective),
        asset.effectiveSource,
        asset.sidecarStatus,
        asset.mirrorSidecarPath,
        asset.adjacentSidecarPath,
        asset.updatedAt
      ]
    );
  }

  async commit(): Promise<void> {
    await this.save();
  }

  getAsset(id: string): PhotoAsset | undefined {
    const row = this.selectOne<AssetRow>('SELECT * FROM assets WHERE id = ?', [id]);
    return row ? mapAsset(row) : undefined;
  }

  getAssetByPath(absolutePath: string): PhotoAsset | undefined {
    const row = this.selectOne<AssetRow>('SELECT * FROM assets WHERE absolute_path = ?', [absolutePath]);
    return row ? mapAsset(row) : undefined;
  }

  getAssetsByIds(ids: string[]): PhotoAsset[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return this.select<AssetRow>(`SELECT * FROM assets WHERE id IN (${placeholders})`, ids).map(mapAsset);
  }

  async deleteAssetsByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const existing = this.getAssetsByIds(ids);
    if (existing.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    this.run(`DELETE FROM assets WHERE id IN (${placeholders})`, ids);
    await this.save();
    return existing.length;
  }

  async clearPhotoSession(): Promise<void> {
    this.run('DELETE FROM edit_history');
    this.run('DELETE FROM assets');
    this.run('DELETE FROM source_roots');
    await this.save();
  }

  async replacePhotoSessionSource(sourceRoot: SourceRoot): Promise<void> {
    const db = this.requireDb();
    db.exec('BEGIN');
    try {
      this.run('DELETE FROM edit_history');
      this.run('DELETE FROM assets');
      this.run('DELETE FROM source_roots');
      this.run(
        'INSERT INTO source_roots (id, path, name, createdAt, lastScanAt) VALUES (?, ?, ?, ?, ?)',
        [sourceRoot.id, sourceRoot.path, sourceRoot.name, sourceRoot.createdAt, sourceRoot.lastScanAt]
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    await this.save();
  }

  listAssets(options: {
    text?: string;
    sourceRootId?: string;
    filter?: 'all' | 'missing-location' | 'has-location' | 'edited' | 'conflicts';
    sortBy?: AssetSortBy;
    sortDirection?: SortDirection;
    rating?: number;
    tag?: string;
    extension?: string;
    limit?: number;
  } = {}): PhotoAsset[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (options.sourceRootId) {
      where.push('source_root_id = ?');
      values.push(options.sourceRootId);
    }
    if (options.text) {
      where.push('(filename LIKE ? OR relative_path LIKE ? OR effective_json LIKE ?)');
      const query = `%${options.text}%`;
      values.push(query, query, query);
    }
    if (options.filter === 'missing-location') {
      where.push("(json_extract(effective_json, '$.latitude') IS NULL OR json_extract(effective_json, '$.longitude') IS NULL)");
    }
    if (options.filter === 'has-location') {
      where.push("(json_extract(effective_json, '$.latitude') IS NOT NULL AND json_extract(effective_json, '$.longitude') IS NOT NULL)");
    }
    if (options.filter === 'edited') {
      where.push("sidecar_status = 'mirror'");
    }
    if (options.filter === 'conflicts') {
      where.push("sidecar_status = 'conflict'");
    }
    if (options.rating !== undefined) {
      where.push("json_extract(effective_json, '$.rating') = ?");
      values.push(options.rating);
    }
    if (options.tag) {
      where.push("effective_json LIKE ?");
      values.push(`%"${escapeLike(options.tag)}"%`);
    }
    if (options.extension) {
      where.push('extension = ?');
      values.push(options.extension.toLowerCase());
    }

    const orderBy = orderByForAssets(options.sortBy, options.sortDirection);
    const sql = `SELECT * FROM assets ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${orderBy} LIMIT ?`;
    values.push(options.limit ?? 500);
    return this.select<AssetRow>(sql, values).map(mapAsset);
  }

  async logEdit(assetId: string, patchJson: string): Promise<void> {
    this.run('INSERT INTO edit_history (id, asset_id, patch_json, created_at) VALUES (?, ?, ?, ?)', [
      crypto.randomUUID(),
      assetId,
      patchJson,
      new Date().toISOString()
    ]);
    await this.save();
  }

  async createExportJob(data: {
    id: string;
    destination: string;
    exportedAssets: number;
    errorsJson: string;
    createdAt: string;
  }): Promise<void> {
    this.run(
      'INSERT INTO export_jobs (id, destination, exported_assets, errors_json, created_at) VALUES (?, ?, ?, ?, ?)',
      [data.id, data.destination, data.exportedAssets, data.errorsJson, data.createdAt]
    );
    await this.save();
  }

  private migrate(): void {
    const db = this.requireDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS source_roots (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        lastScanAt TEXT
      );

      CREATE TABLE IF NOT EXISTS map_packs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        importedAt TEXT NOT NULL,
        metadata_json TEXT
      );

      CREATE TABLE IF NOT EXISTS map_download_jobs (
        id TEXT PRIMARY KEY,
        region_ids_json TEXT NOT NULL,
        detail_id TEXT NOT NULL,
        max_zoom INTEGER NOT NULL,
        output_directory TEXT NOT NULL,
        source_url TEXT,
        estimated_bytes INTEGER NOT NULL,
        output_paths_json TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        source_root_id TEXT NOT NULL,
        absolute_path TEXT NOT NULL UNIQUE,
        relative_path TEXT NOT NULL,
        filename TEXT NOT NULL,
        extension TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime_ms REAL NOT NULL,
        width INTEGER,
        height INTEGER,
        embedded_json TEXT NOT NULL,
        adjacent_sidecar_json TEXT,
        mirror_sidecar_json TEXT,
        effective_json TEXT NOT NULL,
        effective_source TEXT NOT NULL,
        sidecar_status TEXT NOT NULL,
        mirror_sidecar_path TEXT,
        adjacent_sidecar_path TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(source_root_id) REFERENCES source_roots(id)
      );

      CREATE INDEX IF NOT EXISTS idx_assets_source_root ON assets(source_root_id);
      CREATE INDEX IF NOT EXISTS idx_assets_sidecar_status ON assets(sidecar_status);

      CREATE TABLE IF NOT EXISTS edit_history (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        patch_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(asset_id) REFERENCES assets(id)
      );

      CREATE TABLE IF NOT EXISTS export_jobs (
        id TEXT PRIMARY KEY,
        destination TEXT NOT NULL,
        exported_assets INTEGER NOT NULL,
        errors_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.ensureColumn('map_packs', 'metadata_json', 'TEXT');
    this.ensureColumn('map_packs', 'origin', "TEXT NOT NULL DEFAULT 'imported'");
    this.ensureColumn('map_packs', 'availability', "TEXT NOT NULL DEFAULT 'available'");
    this.ensureColumn('map_packs', 'lastSeenAt', 'TEXT');
  }

  private ensureColumn(table: string, column: string, declaration: string): void {
    const existing = this.select<{ name: string }>(`PRAGMA table_info(${table})`);
    if (existing.some((row) => row.name === column)) return;
    this.requireDb().exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
  }

  private run(sql: string, values: unknown[] = []): void {
    this.requireDb().run(sql, toSqlValues(values));
  }

  private select<T>(sql: string, values: unknown[] = []): T[] {
    const statement = this.requireDb().prepare(sql, toSqlValues(values));
    const rows: T[] = [];
    try {
      while (statement.step()) rows.push(statement.getAsObject() as T);
    } finally {
      statement.free();
    }
    return rows;
  }

  private selectOne<T>(sql: string, values: unknown[] = []): T | undefined {
    return this.select<T>(sql, values)[0];
  }

  private async save(): Promise<void> {
    const db = this.requireDb();
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, Buffer.from(db.export()));
  }

  private requireDb(): Database {
    if (!this.db) throw new Error('Database has not been initialized');
    return this.db;
  }
}

function toSqlValues(values: unknown[]): SqlValue[] {
  return values.map((value) => {
    if (value === undefined) return null;
    if (value === null || typeof value === 'string' || typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Uint8Array) return value;
    return String(value);
  });
}

function orderByForAssets(sortBy: AssetSortBy = 'filename', direction: SortDirection = 'asc'): string {
  const dir = direction === 'desc' ? 'DESC' : 'ASC';
  const nulls = direction === 'desc' ? 'NULLS LAST' : 'NULLS FIRST';
  switch (sortBy) {
    case 'date':
      return `json_extract(effective_json, '$.dateTimeOriginal') ${dir} ${nulls}, filename ASC`;
    case 'rating':
      return `json_extract(effective_json, '$.rating') ${dir} ${nulls}, filename ASC`;
    case 'location':
      return `json_extract(effective_json, '$.latitude') ${dir} ${nulls}, filename ASC`;
    case 'edited':
      return `sidecar_status ${dir}, updated_at DESC`;
    case 'fileType':
      return `extension ${dir}, filename ASC`;
    case 'updated':
      return `updated_at ${dir}, filename ASC`;
    case 'filename':
    default:
      return `filename ${dir}, relative_path ASC`;
  }
}

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, '');
}

function mapAsset(row: AssetRow): PhotoAsset {
  return {
    id: row.id,
    sourceRootId: row.source_root_id,
    absolutePath: row.absolute_path,
    relativePath: row.relative_path,
    filename: row.filename,
    extension: row.extension,
    size: row.size,
    mtimeMs: row.mtime_ms,
    width: row.width,
    height: row.height,
    embedded: parseMetadata(row.embedded_json),
    adjacentSidecar: row.adjacent_sidecar_json ? parseMetadata(row.adjacent_sidecar_json) : undefined,
    mirrorSidecar: row.mirror_sidecar_json ? parseMetadata(row.mirror_sidecar_json) : undefined,
    effective: parseMetadata(row.effective_json),
    effectiveSource: row.effective_source,
    sidecarStatus: row.sidecar_status,
    mirrorSidecarPath: row.mirror_sidecar_path,
    adjacentSidecarPath: row.adjacent_sidecar_path,
    updatedAt: row.updated_at
  };
}

function mapMapPack(row: MapPackRow): MapPack {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    kind: row.kind,
    importedAt: row.importedAt,
    origin: row.origin ?? 'imported',
    availability: row.availability ?? 'available',
    lastSeenAt: row.lastSeenAt,
    metadata: row.metadata_json ? parseMapPackMetadata(row.metadata_json) : undefined
  };
}

function mapMapDownloadJob(row: MapDownloadJobRow): MapDownloadJob {
  return {
    id: row.id,
    regionIds: parseStringArray(row.region_ids_json),
    detailId: row.detail_id,
    maxZoom: row.max_zoom,
    outputDirectory: row.output_directory,
    sourceUrl: row.source_url,
    estimatedBytes: row.estimated_bytes,
    outputPaths: parseStringArray(row.output_paths_json),
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

function parseMetadata(value: string): MetadataFields {
  try {
    return metadataFromUnknown(JSON.parse(value));
  } catch {
    return emptyMetadata();
  }
}

function parseMapPackMetadata(value: string): MapPack['metadata'] {
  try {
    const parsed = JSON.parse(value) as MapPack['metadata'];
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
