import fs from 'node:fs/promises';
import path from 'node:path';
import initSqlJs, { Database, SqlJsStatic, SqlValue } from 'sql.js';
import {
  AppSettings,
  MapPack,
  MetadataFields,
  MetadataSource,
  PhotoAsset,
  SidecarStatus,
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

export class DatabaseService {
  private SQL?: SqlJsStatic;
  private db?: Database;
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'photo-metadata-manager.sqlite');
  }

  async init(): Promise<void> {
    this.SQL = await initSqlJs({
      locateFile: (file) => path.join(process.cwd(), 'node_modules/sql.js/dist', file)
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
    return this.select<MapPack>('SELECT * FROM map_packs ORDER BY importedAt DESC');
  }

  getMapPack(id: string): MapPack | undefined {
    return this.selectOne<MapPack>('SELECT * FROM map_packs WHERE id = ?', [id]);
  }

  async addMapPack(mapPack: MapPack): Promise<void> {
    this.run(
      `INSERT OR REPLACE INTO map_packs (id, name, path, kind, importedAt)
       VALUES (?, ?, ?, ?, ?)`,
      [mapPack.id, mapPack.name, mapPack.path, mapPack.kind, mapPack.importedAt]
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

  listAssets(options: {
    text?: string;
    sourceRootId?: string;
    filter?: 'all' | 'missing-location' | 'edited' | 'conflicts';
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
    if (options.filter === 'edited') {
      where.push("sidecar_status = 'mirror'");
    }
    if (options.filter === 'conflicts') {
      where.push("sidecar_status = 'conflict'");
    }

    const sql = `SELECT * FROM assets ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY relative_path ASC LIMIT ?`;
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
        importedAt TEXT NOT NULL
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

function parseMetadata(value: string): MetadataFields {
  try {
    return metadataFromUnknown(JSON.parse(value));
  } catch {
    return emptyMetadata();
  }
}
