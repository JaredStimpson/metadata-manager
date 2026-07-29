export type SidecarStatus = 'none' | 'adjacent' | 'mirror' | 'conflict';

export type MetadataSource = 'embedded' | 'adjacent-sidecar' | 'mirror-sidecar' | 'manual';

export interface MetadataFields {
  description?: string;
  rating?: number;
  dateTimeOriginal?: string;
  latitude?: number;
  longitude?: number;
  tags: string[];
}

export interface MetadataPatch {
  description?: string | null;
  rating?: number | null;
  dateTimeOriginal?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  tags?: string[];
}

export interface SourceRoot {
  id: string;
  path: string;
  name: string;
  createdAt: string;
  lastScanAt?: string;
}

export interface MapPack {
  id: string;
  name: string;
  path: string;
  kind: 'pmtiles' | 'places-sqlite';
  importedAt: string;
  metadata?: MapPackMetadata;
}

export interface MapPackMetadata {
  sizeBytes?: number;
  minZoom?: number;
  maxZoom?: number;
  bounds?: [number, number, number, number];
  center?: {
    latitude: number;
    longitude: number;
    zoom?: number;
  };
  tileType?: 'mvt' | 'png' | 'jpeg' | 'webp' | 'avif' | 'unknown';
  placesCount?: number;
}

export interface AppSettings {
  sidecarRoot?: string;
  activeMapPackId?: string;
  mapDownloadPreferences?: MapDownloadPreferences;
}

export interface MapRegionPreset {
  id: string;
  label: string;
  group: string;
  bbox?: [number, number, number, number];
  estimateMbByMaxZoom: Record<number, number>;
  notes?: string;
}

export interface MapDetailPreset {
  id: string;
  label: string;
  maxZoom: number;
  description: string;
}

export interface MapDownloadPreferences {
  regionIds: string[];
  detailId: string;
  budgetBytes: number;
  outputDirectory?: string;
  sourceUrl?: string;
}

export interface MapDownloadPlan {
  preferences: MapDownloadPreferences;
  regions: MapRegionPreset[];
  details: MapDetailPreset[];
  estimatedBytes: number;
  budgetBytes: number;
  overBudget: boolean;
  installedPacks: MapPack[];
  jobs: MapDownloadJob[];
  defaultOutputDirectory: string;
}

export type MapDownloadStatus = 'planned' | 'running' | 'completed' | 'failed';

export interface MapDownloadJob {
  id: string;
  regionIds: string[];
  detailId: string;
  maxZoom: number;
  outputDirectory: string;
  sourceUrl?: string;
  estimatedBytes: number;
  outputPaths: string[];
  status: MapDownloadStatus;
  message?: string;
  createdAt: string;
  completedAt?: string;
}

export interface MapDownloadRequest {
  regionIds: string[];
  detailId: string;
  budgetBytes?: number;
  outputDirectory?: string;
  sourceUrl?: string;
}

export interface MapDownloadResult {
  job: MapDownloadJob;
  mapPacks: MapPack[];
  errors: Array<{ regionId: string; message: string }>;
}

export interface RemoveMapPackResult {
  removed: boolean;
  deletedFile: boolean;
  settings: AppSettings;
  mapPacks: MapPack[];
}

export type AssetSortBy = 'filename' | 'date' | 'rating' | 'location' | 'edited' | 'fileType' | 'updated';

export type SortDirection = 'asc' | 'desc';

export interface PhotoAsset {
  id: string;
  sourceRootId: string;
  absolutePath: string;
  relativePath: string;
  filename: string;
  extension: string;
  size: number;
  mtimeMs: number;
  width?: number;
  height?: number;
  embedded: MetadataFields;
  adjacentSidecar?: MetadataFields;
  mirrorSidecar?: MetadataFields;
  effective: MetadataFields;
  effectiveSource: MetadataSource;
  sidecarStatus: SidecarStatus;
  mirrorSidecarPath?: string;
  adjacentSidecarPath?: string;
  updatedAt: string;
}

export interface InitialState {
  settings: AppSettings;
  sourceRoots: SourceRoot[];
  mapPacks: MapPack[];
  tileServerUrl?: string;
}

export interface HealthStatus {
  appVersion: string;
  userDataPath: string;
  sidecarRoot?: string;
  tileServerRunning: boolean;
  tileServerUrl?: string;
  capabilities: string[];
}

export interface ScanResult {
  sourceRoot: SourceRoot;
  scanned: number;
  addedOrUpdated: number;
  skipped: number;
  errors: Array<{ path: string; message: string }>;
}

export interface AssetQuery {
  text?: string;
  sourceRootId?: string;
  filter?: 'all' | 'missing-location' | 'has-location' | 'edited' | 'conflicts';
  sortBy?: AssetSortBy;
  sortDirection?: SortDirection;
  rating?: number;
  tag?: string;
  extension?: string;
  limit?: number;
}

export interface ImportFilesResult {
  sourceRoots: SourceRoot[];
  assets: PhotoAsset[];
  imported: number;
  skipped: number;
  errors: Array<{ path: string; message: string }>;
}

export interface RemoveAssetsResult {
  removed: number;
}

export interface ExportResult {
  id: string;
  destination: string;
  exportedAssets: number;
  hardlinked: number;
  copied: number;
  sidecarsWritten: number;
  errors: Array<{ path: string; message: string }>;
  createdAt: string;
}

export interface SaveMetadataResult {
  assets: PhotoAsset[];
  sidecarsWritten: number;
}

export interface LocalPlace {
  id: string;
  name: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export interface PhotoMetadataApi {
  healthCheck(): Promise<HealthStatus>;
  getInitialState(): Promise<InitialState>;
  choosePhotoFolders(): Promise<string[]>;
  choosePhotoFiles(): Promise<string[]>;
  chooseDirectory(title?: string): Promise<string | undefined>;
  chooseMapPack(): Promise<string | undefined>;
  updateSettings(settings: Partial<AppSettings>): Promise<AppSettings>;
  addSourceRoots(paths: string[]): Promise<SourceRoot[]>;
  addImportedFiles(paths: string[]): Promise<ImportFilesResult>;
  removeAssetsFromLibrary(assetIds: string[]): Promise<RemoveAssetsResult>;
  scanSourceRoot(sourceRootId: string): Promise<ScanResult>;
  listAssets(query?: AssetQuery): Promise<PhotoAsset[]>;
  saveMetadata(assetIds: string[], patch: MetadataPatch): Promise<SaveMetadataResult>;
  revertSidecars(assetIds: string[]): Promise<PhotoAsset[]>;
  importMapPack(path: string): Promise<MapPack>;
  getMapDownloadPlan(): Promise<MapDownloadPlan>;
  saveMapDownloadPreferences(preferences: MapDownloadPreferences): Promise<MapDownloadPlan>;
  downloadMapSelection(request: MapDownloadRequest): Promise<MapDownloadResult>;
  removeMapPack(id: string, deleteFile?: boolean): Promise<RemoveMapPackResult>;
  listMapPacks(): Promise<MapPack[]>;
  searchPlaces(query: string): Promise<LocalPlace[]>;
  exportImmich(assetIds: string[] | 'all', destination: string): Promise<ExportResult>;
  revealPath(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  openMapSetup(): Promise<void>;
}

export const photoMetadataCapabilities = [
  'healthCheck',
  'getInitialState',
  'choosePhotoFolders',
  'choosePhotoFiles',
  'chooseDirectory',
  'chooseMapPack',
  'updateSettings',
  'addSourceRoots',
  'addImportedFiles',
  'removeAssetsFromLibrary',
  'scanSourceRoot',
  'listAssets',
  'saveMetadata',
  'revertSidecars',
  'importMapPack',
  'getMapDownloadPlan',
  'saveMapDownloadPreferences',
  'downloadMapSelection',
  'removeMapPack',
  'listMapPacks',
  'searchPlaces',
  'exportImmich',
  'revealPath',
  'openExternal',
  'openMapSetup'
] as const;

export const emptyMetadata = (): MetadataFields => ({
  tags: []
});
