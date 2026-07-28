import { MetadataFields, MetadataPatch, PhotoAsset } from '../../shared/types';

export type MetadataFieldKey = 'description' | 'rating' | 'dateTimeOriginal' | 'latitude' | 'longitude' | 'tags';

export interface MetadataFormState {
  description: string;
  rating: string;
  dateTimeOriginal: string;
  latitude: string;
  longitude: string;
  coordinatePaste: string;
  tags: string[];
}

export type DirtyMetadataFields = Set<MetadataFieldKey>;

export const emptyMetadataForm = (): MetadataFormState => ({
  description: '',
  rating: '',
  dateTimeOriginal: '',
  latitude: '',
  longitude: '',
  coordinatePaste: '',
  tags: []
});

export function formFromSelection(assets: PhotoAsset[]): { form: MetadataFormState; mixed: Set<MetadataFieldKey> } {
  if (assets.length === 0) return { form: emptyMetadataForm(), mixed: new Set() };

  const values = assets.map((asset) => asset.effective);
  const mixed = new Set<MetadataFieldKey>();
  const getValue = <T>(key: MetadataFieldKey, formatter: (metadata: MetadataFields) => T): T | undefined => {
    const first = formatter(values[0]);
    const allSame = values.every((metadata) => sameValue(formatter(metadata), first));
    if (!allSame) {
      mixed.add(key);
      return undefined;
    }
    return first;
  };

  const tags = getValue('tags', (metadata) => metadata.tags.join('\u0000'));

  return {
    form: {
      description: getValue('description', (metadata) => metadata.description ?? '') ?? '',
      rating: String(getValue('rating', (metadata) => metadata.rating ?? '') ?? ''),
      dateTimeOriginal: getValue('dateTimeOriginal', (metadata) => metadata.dateTimeOriginal ?? '') ?? '',
      latitude: String(getValue('latitude', (metadata) => metadata.latitude ?? '') ?? ''),
      longitude: String(getValue('longitude', (metadata) => metadata.longitude ?? '') ?? ''),
      coordinatePaste: '',
      tags: tags ? tags.split('\u0000').filter(Boolean) : []
    },
    mixed
  };
}

export function buildMetadataPatch(form: MetadataFormState, dirty: DirtyMetadataFields): MetadataPatch {
  const patch: MetadataPatch = {};

  if (dirty.has('description')) patch.description = form.description.trim() || null;
  if (dirty.has('rating')) patch.rating = parseNumberInput(form.rating, 0, 5, 'Rating');
  if (dirty.has('dateTimeOriginal')) patch.dateTimeOriginal = normalizeDateTime(form.dateTimeOriginal);
  if (dirty.has('latitude')) patch.latitude = parseNumberInput(form.latitude, -90, 90, 'Latitude');
  if (dirty.has('longitude')) patch.longitude = parseNumberInput(form.longitude, -180, 180, 'Longitude');
  if (dirty.has('tags')) patch.tags = uniqueTags(form.tags);

  return patch;
}

export function parseCoordinatePair(value: string): { latitude: string; longitude: string } | undefined {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return undefined;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  return { latitude: String(latitude), longitude: String(longitude) };
}

export function normalizeDateTime(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}:\d{2}:\d{2}/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    const [date, time] = trimmed.split('T');
    return `${date.replace(/-/g, ':')} ${time.length === 5 ? `${time}:00` : time}`;
  }
  return trimmed;
}

export function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

function parseNumberInput(value: string, min: number, max: number, label: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function sameValue(left: unknown, right: unknown): boolean {
  return left === right || (left === undefined && right === '') || (left === '' && right === undefined);
}

