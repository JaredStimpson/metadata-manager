import { contextBridge, ipcRenderer } from 'electron';
import {
  AppSettings,
  AssetQuery,
  BackendLogEntry,
  MapDownloadPreferences,
  MapDownloadRequest,
  MetadataPatch,
  PhotoMetadataApi
} from '../shared/types';

const api: PhotoMetadataApi = {
  healthCheck: () => ipcRenderer.invoke('health:check'),
  getInitialState: () => ipcRenderer.invoke('app:getInitialState'),
  choosePhotoFolder: () => ipcRenderer.invoke('dialog:choosePhotoFolder'),
  choosePhotoFiles: () => ipcRenderer.invoke('dialog:choosePhotoFiles'),
  chooseDirectory: (title?: string) => ipcRenderer.invoke('dialog:chooseDirectory', title),
  chooseMapPack: () => ipcRenderer.invoke('dialog:chooseMapPack'),
  updateSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', settings),
  setSourceRoot: (path: string) => ipcRenderer.invoke('library:setSourceRoot', path),
  addImportedFiles: (paths: string[]) => ipcRenderer.invoke('library:addImportedFiles', paths),
  removeAssetsFromLibrary: (assetIds: string[]) => ipcRenderer.invoke('library:removeAssets', assetIds),
  scanSourceRoot: (sourceRootId: string) => ipcRenderer.invoke('library:scan', sourceRootId),
  listAssets: (query?: AssetQuery) => ipcRenderer.invoke('assets:list', query),
  saveMetadata: (assetIds: string[], patch: MetadataPatch) => ipcRenderer.invoke('metadata:save', assetIds, patch),
  revertSidecars: (assetIds: string[]) => ipcRenderer.invoke('metadata:revert', assetIds),
  importMapPack: (path: string) => ipcRenderer.invoke('maps:import', path),
  getMapDownloadPlan: () => ipcRenderer.invoke('maps:downloadPlan'),
  saveMapDownloadPreferences: (preferences: MapDownloadPreferences) =>
    ipcRenderer.invoke('maps:saveDownloadPreferences', preferences),
  downloadMapSelection: (request: MapDownloadRequest) => ipcRenderer.invoke('maps:downloadSelection', request),
  removeMapPack: (id: string, deleteFile?: boolean) => ipcRenderer.invoke('maps:remove', id, deleteFile),
  listMapPacks: () => ipcRenderer.invoke('maps:list'),
  searchPlaces: (query: string) => ipcRenderer.invoke('places:search', query),
  exportImmich: (assetIds: string[] | 'all', destination: string) => ipcRenderer.invoke('export:immich', assetIds, destination),
  revealPath: (path: string) => ipcRenderer.invoke('path:reveal', path),
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  openMapSetup: () => ipcRenderer.invoke('tools:openMapSetup'),
  onBackendLog: (listener: (entry: BackendLogEntry) => void) => {
    ipcRenderer.removeAllListeners('backend:log');
    ipcRenderer.on('backend:log', (_event, entry: BackendLogEntry) => listener(entry));
  }
};

contextBridge.exposeInMainWorld('photoMeta', api);
