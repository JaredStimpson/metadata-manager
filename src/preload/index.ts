import { contextBridge, ipcRenderer } from 'electron';
import { AppSettings, AssetQuery, MetadataPatch, PhotoMetadataApi } from '../shared/types';

const api: PhotoMetadataApi = {
  healthCheck: () => ipcRenderer.invoke('health:check'),
  getInitialState: () => ipcRenderer.invoke('app:getInitialState'),
  choosePhotoFolders: () => ipcRenderer.invoke('dialog:choosePhotoFolders'),
  choosePhotoFiles: () => ipcRenderer.invoke('dialog:choosePhotoFiles'),
  chooseDirectory: (title?: string) => ipcRenderer.invoke('dialog:chooseDirectory', title),
  chooseMapPack: () => ipcRenderer.invoke('dialog:chooseMapPack'),
  updateSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', settings),
  addSourceRoots: (paths: string[]) => ipcRenderer.invoke('library:addSourceRoots', paths),
  addImportedFiles: (paths: string[]) => ipcRenderer.invoke('library:addImportedFiles', paths),
  scanSourceRoot: (sourceRootId: string) => ipcRenderer.invoke('library:scan', sourceRootId),
  listAssets: (query?: AssetQuery) => ipcRenderer.invoke('assets:list', query),
  saveMetadata: (assetIds: string[], patch: MetadataPatch) => ipcRenderer.invoke('metadata:save', assetIds, patch),
  revertSidecars: (assetIds: string[]) => ipcRenderer.invoke('metadata:revert', assetIds),
  importMapPack: (path: string) => ipcRenderer.invoke('maps:import', path),
  listMapPacks: () => ipcRenderer.invoke('maps:list'),
  searchPlaces: (query: string) => ipcRenderer.invoke('places:search', query),
  exportImmich: (assetIds: string[] | 'all', destination: string) => ipcRenderer.invoke('export:immich', assetIds, destination),
  revealPath: (path: string) => ipcRenderer.invoke('path:reveal', path),
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  openMapSetup: () => ipcRenderer.invoke('tools:openMapSetup')
};

contextBridge.exposeInMainWorld('photoMeta', api);
