import {
  MapDetailPreset,
  MapDownloadPreferences,
  MapRegionPreset
} from './types';

export const DEFAULT_MAP_BUDGET_BYTES = 5 * 1024 * 1024 * 1024;

export const mapDetailPresets: MapDetailPreset[] = [
  {
    id: 'overview',
    label: 'Overview',
    maxZoom: 5,
    description: 'Smallest files for continent-scale orientation.'
  },
  {
    id: 'travel',
    label: 'Travel',
    maxZoom: 8,
    description: 'Good for road trips, towns, and broad geotagging.'
  },
  {
    id: 'regional',
    label: 'Regional',
    maxZoom: 10,
    description: 'Better local roads and neighborhoods with moderate file size.'
  },
  {
    id: 'city',
    label: 'City',
    maxZoom: 12,
    description: 'Best detail for city geotagging. Use smaller regions.'
  }
];

export const mapRegionPresets: MapRegionPreset[] = [
  {
    id: 'world-overview',
    label: 'World Overview',
    group: 'Global',
    estimateMbByMaxZoom: { 5: 180, 8: 900, 10: 2400, 12: 6200 },
    notes: 'No bounding box. Use low detail to keep this small.'
  },
  {
    id: 'north-america',
    label: 'North America',
    group: 'Continents',
    bbox: [-168.0, 7.0, -52.0, 72.0],
    estimateMbByMaxZoom: { 5: 160, 8: 820, 10: 2600, 12: 7400 }
  },
  {
    id: 'united-states',
    label: 'United States',
    group: 'North America',
    bbox: [-125.0, 24.0, -66.5, 49.5],
    estimateMbByMaxZoom: { 5: 120, 8: 640, 10: 2100, 12: 5800 }
  },
  {
    id: 'us-west',
    label: 'US West',
    group: 'North America',
    bbox: [-125.0, 31.0, -102.0, 49.5],
    estimateMbByMaxZoom: { 5: 55, 8: 300, 10: 900, 12: 2500 }
  },
  {
    id: 'us-east',
    label: 'US East',
    group: 'North America',
    bbox: [-90.0, 24.0, -66.5, 49.5],
    estimateMbByMaxZoom: { 5: 70, 8: 420, 10: 1500, 12: 4300 }
  },
  {
    id: 'california-nevada',
    label: 'California + Nevada',
    group: 'North America',
    bbox: [-124.7, 32.0, -113.8, 42.2],
    estimateMbByMaxZoom: { 5: 30, 8: 160, 10: 520, 12: 1500 }
  },
  {
    id: 'europe',
    label: 'Europe',
    group: 'Continents',
    bbox: [-11.5, 34.0, 31.5, 71.5],
    estimateMbByMaxZoom: { 5: 150, 8: 900, 10: 3300, 12: 9800 }
  },
  {
    id: 'uk-ireland',
    label: 'UK + Ireland',
    group: 'Europe',
    bbox: [-11.0, 49.5, 2.2, 61.0],
    estimateMbByMaxZoom: { 5: 35, 8: 210, 10: 760, 12: 2300 }
  },
  {
    id: 'mexico-central-america',
    label: 'Mexico + Central America',
    group: 'North America',
    bbox: [-118.5, 5.0, -77.0, 33.0],
    estimateMbByMaxZoom: { 5: 65, 8: 320, 10: 1100, 12: 3100 }
  },
  {
    id: 'south-america',
    label: 'South America',
    group: 'Continents',
    bbox: [-82.0, -56.5, -34.0, 13.5],
    estimateMbByMaxZoom: { 5: 120, 8: 600, 10: 2000, 12: 5600 }
  },
  {
    id: 'asia-pacific',
    label: 'Asia Pacific',
    group: 'Continents',
    bbox: [60.0, -47.5, 180.0, 62.0],
    estimateMbByMaxZoom: { 5: 210, 8: 1300, 10: 4700, 12: 14200 }
  },
  {
    id: 'australia-new-zealand',
    label: 'Australia + New Zealand',
    group: 'Asia Pacific',
    bbox: [112.0, -48.0, 179.5, -9.0],
    estimateMbByMaxZoom: { 5: 70, 8: 320, 10: 900, 12: 2600 }
  }
];

export const defaultMapDownloadPreferences = (): MapDownloadPreferences => ({
  regionIds: ['world-overview'],
  detailId: 'travel',
  budgetBytes: DEFAULT_MAP_BUDGET_BYTES
});

export function estimateMapDownloadBytes(regionIds: string[], detailId: string): number {
  const detail = getMapDetail(detailId);
  if (!detail) return 0;
  return regionIds.reduce((total, regionId) => {
    const region = getMapRegion(regionId);
    return total + (region?.estimateMbByMaxZoom[detail.maxZoom] ?? 0) * 1024 * 1024;
  }, 0);
}

export function getMapDetail(detailId: string): MapDetailPreset | undefined {
  return mapDetailPresets.find((detail) => detail.id === detailId);
}

export function getMapRegion(regionId: string): MapRegionPreset | undefined {
  return mapRegionPresets.find((region) => region.id === regionId);
}

export function normalizeMapDownloadPreferences(
  preferences?: Partial<MapDownloadPreferences>
): MapDownloadPreferences {
  const defaults = defaultMapDownloadPreferences();
  const detailId = preferences?.detailId && getMapDetail(preferences.detailId) ? preferences.detailId : defaults.detailId;
  const regionIds = (preferences?.regionIds?.filter((regionId) => Boolean(getMapRegion(regionId))) ?? defaults.regionIds);
  return {
    regionIds: regionIds.length ? [...new Set(regionIds)] : defaults.regionIds,
    detailId,
    budgetBytes: preferences?.budgetBytes && preferences.budgetBytes > 0 ? preferences.budgetBytes : defaults.budgetBytes,
    outputDirectory: preferences?.outputDirectory,
    sourceUrl: preferences?.sourceUrl
  };
}

export function formatBytes(value: number): string {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${Math.round(value / 1024 / 1024)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}
