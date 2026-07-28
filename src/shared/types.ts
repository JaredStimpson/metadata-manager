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
}

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
  filter?: 'all' | 'missing-location' | 'edited' | 'conflicts';
  limit?: number;
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
  getInitialState(): Promise<InitialState>;
  choosePhotoFolders(): Promise<string[]>;
  chooseDirectory(title?: string): Promise<string | undefined>;
  chooseMapPack(): Promise<string | undefined>;
  updateSettings(settings: Partial<AppSettings>): Promise<AppSettings>;
  addSourceRoots(paths: string[]): Promise<SourceRoot[]>;
  scanSourceRoot(sourceRootId: string): Promise<ScanResult>;
  listAssets(query?: AssetQuery): Promise<PhotoAsset[]>;
  saveMetadata(assetIds: string[], patch: MetadataPatch): Promise<SaveMetadataResult>;
  revertSidecars(assetIds: string[]): Promise<PhotoAsset[]>;
  importMapPack(path: string): Promise<MapPack>;
  listMapPacks(): Promise<MapPack[]>;
  searchPlaces(query: string): Promise<LocalPlace[]>;
  exportImmich(assetIds: string[] | 'all', destination: string): Promise<ExportResult>;
  revealPath(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
}

export const emptyMetadata = (): MetadataFields => ({
  tags: []
});
