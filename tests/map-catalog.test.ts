import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_BUDGET_BYTES,
  estimateMapDownloadBytes,
  formatBytes,
  normalizeMapDownloadPreferences
} from '../src/shared/mapCatalog';

describe('map download catalog', () => {
  it('normalizes invalid saved preferences back to safe defaults', () => {
    const preferences = normalizeMapDownloadPreferences({
      regionIds: ['missing-region'],
      detailId: 'missing-detail',
      budgetBytes: -1
    });

    expect(preferences.regionIds).toEqual(['world-overview']);
    expect(preferences.detailId).toBe('travel');
    expect(preferences.budgetBytes).toBe(DEFAULT_MAP_BUDGET_BYTES);
  });

  it('estimates download size for selected regions and formats budgets', () => {
    expect(estimateMapDownloadBytes(['us-west', 'california-nevada'], 'regional')).toBeGreaterThan(0);
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5.0 GB');
  });
});
