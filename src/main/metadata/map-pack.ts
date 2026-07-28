import fs from 'node:fs/promises';
import { bytesToHeader, TileType } from 'pmtiles';
import { MapPackMetadata } from '../../shared/types';

const PMTILES_HEADER_BYTES = 127;

export async function inspectPmtiles(filePath: string): Promise<MapPackMetadata> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(PMTILES_HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, PMTILES_HEADER_BYTES, 0);
    if (bytesRead < PMTILES_HEADER_BYTES) {
      throw new Error('This file is too small to be a PMTiles archive.');
    }

    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead);
    const header = bytesToHeader(arrayBuffer);
    const stat = await handle.stat();

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
      tileType: mapTileType(header.tileType)
    };
  } catch (error) {
    throw new Error(`Could not read PMTiles header: ${String((error as Error).message ?? error)}`);
  } finally {
    await handle.close();
  }
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

