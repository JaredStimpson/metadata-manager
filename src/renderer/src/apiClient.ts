import {
  AppSettings,
  AssetQuery,
  BackendLogEntry,
  FirstRunSetup,
  HealthStatus,
  ImportFilesResult,
  MapDownloadPreferences,
  MapDownloadRequest,
  MapDownloadResult,
  MapDownloadPlan,
  MapPack,
  MapLibraryScanResult,
  MetadataPatch,
  PhotoAsset,
  PhotoMetadataApi,
  SaveMetadataResult,
  ScanResult,
  SourceRoot
} from '../../shared/types';

export class DesktopBridgeUnavailableError extends Error {
  constructor() {
    super('Desktop bridge unavailable. Start the app with Run.cmd instead of opening the HTML file in a browser.');
    this.name = 'DesktopBridgeUnavailableError';
  }
}

export class ApiActionError extends Error {
  constructor(
    readonly action: string,
    cause: unknown
  ) {
    super(`${action} failed: ${formatError(cause)}`);
    this.name = 'ApiActionError';
  }
}

export function hasDesktopBridge(): boolean {
  return Boolean(getOptionalBridge());
}

export const apiClient = {
  healthCheck: () => call('Health check', (api) => api.healthCheck()),
  getInitialState: () => call('Load app state', (api) => api.getInitialState()),
  choosePhotoFolder: () => call('Choose current photo source', (api) => api.choosePhotoFolder()),
  choosePhotoFiles: () => call('Choose photo files', (api) => api.choosePhotoFiles()),
  chooseDirectory: (title?: string) => call('Choose folder', (api) => api.chooseDirectory(title)),
  chooseMapPack: () => call('Choose map pack', (api) => api.chooseMapPack()),
  updateSettings: (settings: Partial<AppSettings>) => call('Update settings', (api) => api.updateSettings(settings)),
  completeFirstRunSetup: (setup: FirstRunSetup) =>
    call('Complete first-run setup', (api) => api.completeFirstRunSetup(setup)),
  setSourceRoot: (path: string) => call('Set current photo source', (api) => api.setSourceRoot(path)),
  addImportedFiles: (paths: string[]) => call('Register photo files', (api) => api.addImportedFiles(paths)),
  removeAssetsFromLibrary: (assetIds: string[]) =>
    call('Remove photos from library', (api) => api.removeAssetsFromLibrary(assetIds)),
  scanSourceRoot: (sourceRootId: string) => call('Scan source folder', (api) => api.scanSourceRoot(sourceRootId)),
  listAssets: (query?: AssetQuery) => call('List photos', (api) => api.listAssets(query)),
  saveMetadata: (assetIds: string[], patch: MetadataPatch) => call('Save metadata', (api) => api.saveMetadata(assetIds, patch)),
  revertSidecars: (assetIds: string[]) => call('Revert sidecars', (api) => api.revertSidecars(assetIds)),
  importMapPack: (path: string) => call('Import map pack', (api) => api.importMapPack(path)),
  rescanMapLibrary: () => call('Rescan managed map library', (api) => api.rescanMapLibrary()),
  getMapDownloadPlan: () => call('Load map download plan', (api) => api.getMapDownloadPlan()),
  saveMapDownloadPreferences: (preferences: MapDownloadPreferences) =>
    call('Save map download preferences', (api) => api.saveMapDownloadPreferences(preferences)),
  downloadMapSelection: (request: MapDownloadRequest) =>
    call('Download map selection', (api) => api.downloadMapSelection(request)),
  removeMapPack: (id: string, deleteFile?: boolean) => call('Remove map pack', (api) => api.removeMapPack(id, deleteFile)),
  listMapPacks: () => call('List map packs', (api) => api.listMapPacks()),
  searchPlaces: (query: string) => call('Search places', (api) => api.searchPlaces(query)),
  exportImmich: (assetIds: string[] | 'all', destination: string) =>
    call('Export for Immich', (api) => api.exportImmich(assetIds, destination)),
  revealPath: (path: string) => call('Reveal path', (api) => api.revealPath(path)),
  openExternal: (url: string) => call('Open link', (api) => api.openExternal(url)),
  openMapSetup: () => call('Open map setup', (api) => api.openMapSetup()),
  onBackendLog: (listener: (entry: BackendLogEntry) => void): void => {
    const bridge = getOptionalBridge();
    if (!bridge) throw new DesktopBridgeUnavailableError();
    bridge.onBackendLog(listener);
  },
  onMapLibraryChanged: (listener: (result: MapLibraryScanResult) => void): void => {
    const bridge = getOptionalBridge();
    if (!bridge) throw new DesktopBridgeUnavailableError();
    bridge.onMapLibraryChanged(listener);
  }
};

async function call<T>(action: string, fn: (api: PhotoMetadataApi) => Promise<T>): Promise<T> {
  const bridge = getOptionalBridge();
  if (!bridge) throw new DesktopBridgeUnavailableError();

  try {
    return await fn(bridge);
  } catch (error) {
    throw new ApiActionError(action, error);
  }
}

function getOptionalBridge(): PhotoMetadataApi | undefined {
  return typeof window === 'undefined' ? undefined : window.photoMeta;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unexpected error';
}

export type ApiClient = typeof apiClient;

export type {
  HealthStatus,
  ImportFilesResult,
  MapDownloadPlan,
  MapDownloadPreferences,
  MapDownloadRequest,
  MapDownloadResult,
  MapPack,
  PhotoAsset,
  SaveMetadataResult,
  ScanResult,
  SourceRoot
};
