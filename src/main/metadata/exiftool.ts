import { exiftool } from 'exiftool-vendored';
import { MetadataFields, emptyMetadata } from '../../shared/types';
import { normalizeMetadata } from './merge';
import { readXmpSidecar } from './xmp';

export interface EmbeddedReadResult {
  metadata: MetadataFields;
  width?: number;
  height?: number;
}

export class ExifToolService {
  async readEmbedded(filePath: string): Promise<EmbeddedReadResult> {
    try {
      const tags = (await exiftool.read(filePath)) as Record<string, unknown>;
      return {
        metadata: metadataFromTags(tags),
        width: firstNumber(tags.ImageWidth, tags.ExifImageWidth),
        height: firstNumber(tags.ImageHeight, tags.ExifImageHeight)
      };
    } catch {
      return { metadata: emptyMetadata() };
    }
  }

  async readSidecar(filePath: string): Promise<MetadataFields | undefined> {
    try {
      const tags = (await exiftool.read(filePath)) as Record<string, unknown>;
      return metadataFromTags(tags);
    } catch {
      return readXmpSidecar(filePath);
    }
  }

  async end(): Promise<void> {
    await exiftool.end();
  }
}

function metadataFromTags(tags: Record<string, unknown>): MetadataFields {
  return normalizeMetadata({
    description: firstString(tags.Description, tags.ImageDescription, tags.Caption, tags.Title),
    rating: firstNumber(tags.Rating, tags.RatingPercent),
    dateTimeOriginal: firstString(
      stringifyDate(tags.SubSecDateTimeOriginal),
      stringifyDate(tags.DateTimeOriginal),
      stringifyDate(tags.CreateDate),
      stringifyDate(tags.MediaCreateDate),
      stringifyDate(tags.FileModifyDate)
    ),
    latitude: firstNumber(tags.GPSLatitude),
    longitude: firstNumber(tags.GPSLongitude),
    tags: firstStringArray(tags.TagsList, tags.HierarchicalSubject, tags.Keywords, tags.Subject)
  });
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return undefined;
}

function firstStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string' && value.trim()) {
      return value
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function stringifyDate(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.rawValue === 'string') return record.rawValue;
    if (typeof record.toISOString === 'function') return String(record.toISOString());
    if (typeof record.toString === 'function') return String(record.toString());
  }
  return undefined;
}
