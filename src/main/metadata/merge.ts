import { MetadataFields, MetadataSource, SidecarStatus, emptyMetadata } from '../../shared/types';

function hasValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '';
}

export function hasMetadata(metadata?: MetadataFields): boolean {
  if (!metadata) return false;
  return (
    hasValue(metadata.description) ||
    hasValue(metadata.rating) ||
    hasValue(metadata.dateTimeOriginal) ||
    hasValue(metadata.latitude) ||
    hasValue(metadata.longitude) ||
    metadata.tags.length > 0
  );
}

export function mergeMetadata(
  embedded: MetadataFields = emptyMetadata(),
  adjacentSidecar?: MetadataFields,
  mirrorSidecar?: MetadataFields
): {
  effective: MetadataFields;
  effectiveSource: MetadataSource;
  sidecarStatus: SidecarStatus;
} {
  if (hasMetadata(mirrorSidecar)) {
    return {
      effective: normalizeMetadata(mirrorSidecar!),
      effectiveSource: 'mirror-sidecar',
      sidecarStatus: hasMetadata(adjacentSidecar) ? 'conflict' : 'mirror'
    };
  }

  if (hasMetadata(adjacentSidecar)) {
    return {
      effective: normalizeMetadata(adjacentSidecar!),
      effectiveSource: 'adjacent-sidecar',
      sidecarStatus: 'adjacent'
    };
  }

  return {
    effective: normalizeMetadata(embedded),
    effectiveSource: 'embedded',
    sidecarStatus: 'none'
  };
}

export function normalizeMetadata(metadata: MetadataFields): MetadataFields {
  return {
    description: cleanString(metadata.description),
    rating: normalizeRating(metadata.rating),
    dateTimeOriginal: cleanString(metadata.dateTimeOriginal),
    latitude: normalizeCoordinate(metadata.latitude, -90, 90),
    longitude: normalizeCoordinate(metadata.longitude, -180, 180),
    tags: [...new Set((metadata.tags ?? []).map((tag) => tag.trim()).filter(Boolean))]
  };
}

export function applyMetadataPatch(base: MetadataFields, patch: Partial<MetadataFields>): MetadataFields {
  return normalizeMetadata({
    description: patch.description !== undefined ? patch.description : base.description,
    rating: patch.rating !== undefined ? patch.rating : base.rating,
    dateTimeOriginal: patch.dateTimeOriginal !== undefined ? patch.dateTimeOriginal : base.dateTimeOriginal,
    latitude: patch.latitude !== undefined ? patch.latitude : base.latitude,
    longitude: patch.longitude !== undefined ? patch.longitude : base.longitude,
    tags: patch.tags !== undefined ? patch.tags : base.tags
  });
}

function cleanString(value?: string): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function normalizeRating(value?: number): number | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(5, Math.round(value)));
}

function normalizeCoordinate(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  return Math.max(min, Math.min(max, Number(value.toFixed(7))));
}
