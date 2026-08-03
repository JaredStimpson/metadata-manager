import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import { DatabaseService } from './db/database';
import { ExifToolService } from './metadata/exiftool';
import { BackendLogger } from './services/backend-logger';
import { BackendServer } from './services/backend-server';
import { LibraryService } from './services/library-service';
import { ThumbnailCache } from './services/thumbnail-cache';
import { TileServer } from './services/tile-server';
import { RuntimePaths } from './runtime-paths';
import {
  AppSettings,
  AssetQuery,
  FirstRunSetup,
  MapDownloadPreferences,
  MapLibraryScanResult,
  MapDownloadRequest,
  MetadataPatch,
  photoMetadataCapabilities
} from '../shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | undefined;
let database: DatabaseService;
let library: LibraryService;
let tileServer: TileServer;
let backendServer: BackendServer;
let logger: BackendLogger;
let thumbnailCache: ThumbnailCache;
let exiftool: ExifToolService;
let runtimePaths: RuntimePaths;

async function bootstrap(): Promise<void> {
  await app.whenReady();

  logger = new BackendLogger(app.getPath('userData'));
  await logger.init();
  registerCrashLogging();
  logger.info('system', 'Photo Meta backend startup initiated.', {
    details: { appVersion: app.getVersion(), electron: process.versions.electron, node: process.versions.node }
  });

  runtimePaths = new RuntimePaths();
  database = new DatabaseService(app.getPath('userData'), runtimePaths.sqlWasm);
  await database.init();
  if (!database.getSettings().sidecarRoot) {
    await database.updateSettings({
      sidecarRoot: path.join(app.getPath('documents'), 'Photo Metadata Manager', 'Sidecars')
    });
  }
  if (database.getSettings().showMapLabels === undefined) {
    await database.updateSettings({ showMapLabels: true });
  }

  exiftool = new ExifToolService();
  thumbnailCache = new ThumbnailCache(app.getPath('userData'), exiftool, logger);
  library = new LibraryService(database, exiftool, runtimePaths.appRoot, {
    logger,
    sessionCache: thumbnailCache,
    sqlWasmPath: runtimePaths.sqlWasm,
    pmtilesExecutable: runtimePaths.pmtilesExecutable,
    defaultSidecarRoot: path.join(app.getPath('documents'), 'Photo Metadata Manager', 'Sidecars'),
    defaultMapsDirectory: path.join(app.getPath('documents'), 'Photo Metadata Manager', 'Maps')
  });
  await library.clearPhotoSession();
  if (database.getSettings().firstRunCompleted) await library.rescanMapLibrary();

  backendServer = new BackendServer(logger);
  backendServer.setThumbnailResolver(async (assetId) => {
    const asset = database.getAsset(assetId);
    return asset ? thumbnailCache.get(asset) : undefined;
  });
  await backendServer.start();

  tileServer = new TileServer(database);
  await tileServer.start();

  logger.subscribe((entry) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('backend:log', entry);
  });

  registerIpc();
  createWindow();
  if (database.getSettings().firstRunCompleted) {
    await library.startMapLibraryWatcher(broadcastMapLibraryChange);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: 'Offline Photo Metadata Manager',
    backgroundColor: '#08110e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    logger.info('renderer', 'Frontend loaded and connected to the backend.');
  });
  mainWindow.webContents.on('unresponsive', () => {
    logger.error('crash', 'Renderer became unresponsive.');
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function registerIpc(): void {
  handleIpc('health:check', async () => {
    const tileServerUrl = await tileServer.start();
    return {
      appVersion: app.getVersion(),
      userDataPath: app.getPath('userData'),
      sidecarRoot: database.getSettings().sidecarRoot,
      backendPort: backendServer.activePort,
      backendUrl: backendServer.url,
      backendLogPath: logger.logPath,
      tileServerRunning: Boolean(tileServerUrl),
      tileServerUrl,
      capabilities: [...photoMetadataCapabilities]
    };
  });

  handleIpc('app:getInitialState', async () => ({
    settings: database.getSettings(),
    sourceRoots: database.listSourceRoots(),
    mapPacks: database.listMapPacks(),
    tileServerUrl: await tileServer.start(),
    firstRunDefaults: library.getFirstRunDefaults()
  }));

  handleIpc('app:completeFirstRun', async (_event, setup: FirstRunSetup) => {
    const state = await library.completeFirstRunSetup(setup, await tileServer.start());
    await library.startMapLibraryWatcher(broadcastMapLibraryChange);
    return state;
  });

  handleIpc('dialog:choosePhotoFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose Current Photo Source',
      properties: ['openDirectory']
    });
    return result.canceled ? undefined : result.filePaths[0];
  });

  handleIpc('dialog:choosePhotoFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose Photos',
      filters: [
        {
          name: 'Photo files',
          extensions: [
            'avif',
            'bmp',
            'gif',
            'heic',
            'heif',
            'jpg',
            'jpeg',
            'jxl',
            'png',
            'raw',
            'rw2',
            'svg',
            'tif',
            'tiff',
            'webp',
            'dng',
            'cr2',
            'cr3',
            'nef',
            'arw',
            'raf',
            'orf'
          ]
        },
        { name: 'All files', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    });
    return result.canceled ? [] : result.filePaths;
  });

  handleIpc('dialog:chooseDirectory', async (_event, title?: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: title || 'Choose Folder',
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? undefined : result.filePaths[0];
  });

  handleIpc('dialog:chooseMapPack', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose Offline Map or Place Pack',
      filters: [
        { name: 'Offline map packs', extensions: ['pmtiles', 'sqlite', 'db'] },
        { name: 'All files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    return result.canceled ? undefined : result.filePaths[0];
  });

  handleIpc('settings:update', (_event, settings: Partial<AppSettings>) => library.updateSettings(settings));
  handleIpc('library:setSourceRoot', (_event, sourcePath: string) => library.setSourceRoot(sourcePath));
  handleIpc('library:addImportedFiles', (_event, paths: string[]) => library.addImportedFiles(paths));
  handleIpc('library:removeAssets', (_event, assetIds: string[]) => library.removeAssetsFromLibrary(assetIds));
  handleIpc('library:scan', (_event, sourceRootId: string) => library.scanSourceRoot(sourceRootId));
  handleIpc('assets:list', (_event, query?: AssetQuery) => library.listAssets(query));
  handleIpc('metadata:save', (_event, assetIds: string[], patch: MetadataPatch) =>
    library.saveMetadata(assetIds, patch)
  );
  handleIpc('metadata:revert', (_event, assetIds: string[]) => library.revertSidecars(assetIds));
  handleIpc('maps:import', (_event, filePath: string) => library.importMapPack(filePath));
  handleIpc('maps:rescan', () => library.rescanMapLibrary());
  handleIpc('maps:downloadPlan', () => library.getMapDownloadPlan());
  handleIpc('maps:saveDownloadPreferences', (_event, preferences: MapDownloadPreferences) =>
    library.saveMapDownloadPreferences(preferences)
  );
  handleIpc('maps:downloadSelection', (_event, request: MapDownloadRequest) =>
    library.downloadMapSelection(request)
  );
  handleIpc('maps:remove', (_event, id: string, deleteFile?: boolean) => library.removeMapPack(id, deleteFile));
  handleIpc('maps:list', () => library.listMapPacks());
  handleIpc('places:search', (_event, query: string) => library.searchPlaces(query));
  handleIpc('export:immich', (_event, assetIds: string[] | 'all', destination: string) =>
    library.exportImmich(assetIds, destination)
  );
  handleIpc('path:reveal', (_event, filePath: string) => library.revealPath(filePath));
  handleIpc('external:open', async (_event, url: string) => {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new Error('Only http and https links can be opened.');
    }
    await shell.openExternal(parsed.toString());
  });
  handleIpc('tools:openMapSetup', async () => {
    const scriptPath = findProjectFile('MapSetup.cmd');
    if (!fs.existsSync(scriptPath)) {
      const result = await shell.openPath(library.getMapDownloadPlan().preferences.outputDirectory ?? library.getMapDownloadPlan().defaultOutputDirectory);
      if (result) throw new Error(result);
      return;
    }
    const result = await shell.openPath(scriptPath);
    if (result) throw new Error(result);
  });
}

function handleIpc<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: TArgs) => TResult | Promise<TResult>
): void {
  ipcMain.handle(channel, async (event, ...args: TArgs) => {
    const operationId = crypto.randomUUID();
    const startedAt = Date.now();
    logger.debug('ipc', `${channel} started.`, { operationId });
    try {
      const result = await handler(event, ...args);
      logger.debug('ipc', `${channel} completed.`, {
        operationId,
        details: { durationMs: Date.now() - startedAt }
      });
      return result;
    } catch (error) {
      logger.error('ipc', `${channel} failed: ${error instanceof Error ? error.message : String(error)}`, {
        operationId,
        details: {
          durationMs: Date.now() - startedAt,
          stack: error instanceof Error ? error.stack : undefined
        }
      });
      throw error;
    }
  });
}

function broadcastMapLibraryChange(result: MapLibraryScanResult): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('maps:libraryChanged', result);
}

function registerCrashLogging(): void {
  process.on('uncaughtExceptionMonitor', (error, origin) => {
    logger.crash('crash', error, { origin });
  });
  process.on('unhandledRejection', (reason) => {
    logger.crash('crash', reason, { origin: 'unhandledRejection' });
  });
  app.on('render-process-gone', (_event, _webContents, details) => {
    logger.crash('crash', `Renderer process exited: ${details.reason}.`, details as unknown as Record<string, unknown>);
  });
  app.on('child-process-gone', (_event, details) => {
    logger.crash('crash', `Child process exited: ${details.type}, ${details.reason}.`, details as unknown as Record<string, unknown>);
  });
}

function findProjectFile(fileName: string): string {
  const candidates = [process.cwd(), app.getAppPath(), path.dirname(process.execPath)];
  for (const candidate of candidates) {
    const filePath = path.join(candidate, fileName);
    if (fs.existsSync(filePath)) return filePath;
  }
  return path.join(process.cwd(), fileName);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  logger?.info('system', 'Photo Meta backend shutdown requested.');
  void logger?.flush();
  void backendServer?.stop();
  void tileServer?.stop();
  library?.stopMapLibraryWatcher();
  void exiftool?.end();
});

bootstrap().catch((error) => {
  logger?.crash('startup', error);
  dialog.showErrorBox('Startup failed', String((error as Error).stack ?? error));
  app.quit();
});
