import fs from 'node:fs/promises';
import path from 'node:path';
import { PMTiles, Source, TileType } from 'pmtiles';
import { MapLabelMode, MapPackMetadata, MapVectorLayerMetadata } from '../../shared/types';

export async function inspectPmtiles(filePath: string): Promise<MapPackMetadata> {
  try {
    const archive = new PMTiles(new NodeFileSource(filePath));
    const [header, rawMetadata, stat] = await Promise.all([archive.getHeader(), archive.getMetadata(), fs.stat(filePath)]);
    const vectorLayers = parseVectorLayers(rawMetadata);
    const style = await inspectStyleSidecar(filePath, vectorLayers);
    const labelMode = style.layers.length > 0 ? 'custom-style' : detectLabelMode(vectorLayers);

    return {
      sizeBytes: stat.size,
      minZoom: header.minZoom,
      maxZoom: header.maxZoom,
      bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
      center: {
        latitude: header.centerLat,
        longitude: header.centerLon,
        zoom: header.centerZoom
      },
      tileType: mapTileType(header.tileType),
      vectorLayers,
      labelMode,
      customStylePath: style.path,
      customStyleLayers: style.layers,
      styleWarnings: style.warnings
    };
  } catch (error) {
    throw new Error(`Could not read PMTiles archive: ${String((error as Error).message ?? error)}`);
  }
}

class NodeFileSource implements Source {
  constructor(private readonly filePath: string) {}

  getKey(): string {
    return this.filePath;
  }

  async getBytes(offset: number, length: number): Promise<{ data: ArrayBuffer }> {
    const handle = await fs.open(this.filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      const bytes = buffer.subarray(0, bytesRead);
      return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
    } finally {
      await handle.close();
    }
  }
}

function parseVectorLayers(value: unknown): MapVectorLayerMetadata[] {
  if (!value || typeof value !== 'object') return [];
  const layers = (value as Record<string, unknown>).vector_layers;
  if (!Array.isArray(layers)) return [];
  return layers.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id.trim()) return [];
    const fields = record.fields && typeof record.fields === 'object' ? Object.keys(record.fields) : [];
    return [{
      id: record.id,
      fields,
      minZoom: finiteNumber(record.minzoom),
      maxZoom: finiteNumber(record.maxzoom)
    }];
  });
}

function detectLabelMode(layers: MapVectorLayerMetadata[]): MapLabelMode {
  const ids = new Set(layers.map((layer) => layer.id.toLowerCase()));
  const hasNameField = layers.some((layer) => layer.fields.some((field) => /^name(?:_|$)/i.test(field) || field === 'ref'));
  if (!hasNameField) return 'none';
  if (['places', 'pois', 'roads', 'transit'].some((id) => ids.has(id))) return 'protomaps';
  if ([...ids].some((id) => /(place|label|road|transport|poi|water)/.test(id))) return 'common';
  return 'none';
}

async function inspectStyleSidecar(
  filePath: string,
  vectorLayers: MapVectorLayerMetadata[]
): Promise<{ path?: string; layers: Array<Record<string, unknown>>; warnings: string[] }> {
  const candidates = [`${filePath}.style.json`, filePath.replace(/\.pmtiles$/i, '.style.json')];
  const warnings: string[] = [];
  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed = JSON.parse(await fs.readFile(candidate, 'utf8')) as Record<string, unknown>;
      const sanitized = sanitizeCustomMapStyle(parsed, vectorLayers);
      return { path: candidate, layers: sanitized.layers, warnings: sanitized.warnings };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      warnings.push(`${path.basename(candidate)} could not be read: ${String((error as Error).message ?? error)}`);
      return { path: candidate, layers: [], warnings };
    }
  }
  return { layers: [], warnings };
}

export function sanitizeCustomMapStyle(
  value: unknown,
  vectorLayers: MapVectorLayerMetadata[]
): { layers: Array<Record<string, unknown>>; warnings: string[] } {
  const warnings: string[] = [];
  if (!value || typeof value !== 'object') return { layers: [], warnings: ['Style JSON must be an object.'] };
  const style = value as Record<string, unknown>;
  if (style.version !== 8 || !Array.isArray(style.layers)) {
    return { layers: [], warnings: ['Style is not a MapLibre version 8 style.'] };
  }
  const available = new Set(vectorLayers.map((layer) => layer.id));
  const layers = style.layers.flatMap((layer, index) => {
    const sanitized = sanitizeStyleLayer(layer, available, warnings, index);
    return sanitized ? [sanitized] : [];
  });
  return { layers, warnings };
}

function sanitizeStyleLayer(
  value: unknown,
  available: Set<string>,
  warnings: string[],
  index: number
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const layer = structuredClone(value as Record<string, unknown>);
  const id = typeof layer.id === 'string' ? layer.id : `custom-${index}`;
  const type = typeof layer.type === 'string' ? layer.type : '';
  if (!['background', 'fill', 'line', 'circle', 'symbol'].includes(type)) return undefined;
  const sourceLayer = layer['source-layer'];
  if (type !== 'background') {
    if (typeof sourceLayer !== 'string' || !available.has(sourceLayer)) {
      warnings.push(`Skipped ${id}: source layer is not declared by this archive.`);
      return undefined;
    }
    layer.source = 'offline';
  } else {
    delete layer.source;
    delete layer['source-layer'];
  }
  delete layer['source-url'];
  if (layer.layout && typeof layer.layout === 'object') {
    const layout = layer.layout as Record<string, unknown>;
    for (const key of Object.keys(layout)) {
      if (key.startsWith('icon-')) delete layout[key];
      if (containsRemoteReference(layout[key])) delete layout[key];
    }
    if (type === 'symbol') {
      if (!layout['text-field']) return undefined;
      layout['text-font'] = ['Segoe UI'];
    }
  }
  if (layer.paint && typeof layer.paint === 'object') {
    const paint = layer.paint as Record<string, unknown>;
    for (const key of Object.keys(paint)) if (containsRemoteReference(paint[key])) delete paint[key];
  }
  layer.id = `custom-${id}`;
  return layer;
}

function containsRemoteReference(value: unknown): boolean {
  if (typeof value === 'string') return /^(?:https?:|mapbox:|data:)/i.test(value);
  if (Array.isArray(value)) return value.some(containsRemoteReference);
  if (value && typeof value === 'object') return Object.values(value).some(containsRemoteReference);
  return false;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mapTileType(tileType: TileType): MapPackMetadata['tileType'] {
  switch (tileType) {
    case TileType.Mvt:
      return 'mvt';
    case TileType.Png:
      return 'png';
    case TileType.Jpeg:
      return 'jpeg';
    case TileType.Webp:
      return 'webp';
    case TileType.Avif:
      return 'avif';
    default:
      return 'unknown';
  }
}
