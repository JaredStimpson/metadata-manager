import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { DatabaseService } from './db/database';
import { ExifToolService } from './metadata/exiftool';
import { LibraryService } from './services/library-service';
import { TileServer } from './services/tile-server';
import { AppSettings, AssetQuery, MetadataPatch } from '../shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | undefined;
let database: DatabaseService;
let library: LibraryService;
let tileServer: TileServer;
let exiftool: ExifToolService;

async function bootstrap(): Promise<void> {
  await app.whenReady();

  database = new DatabaseService(app.getPath('userData'));
  await database.init();
  exiftool = new ExifToolService();
  library = new LibraryService(database, exiftool);
  tileServer = new TileServer(database);
  await tileServer.start();

  registerIpc();
  createWindow();

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
    backgroundColor: '#f5f4ef',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function registerIpc(): void {
  ipcMain.handle('app:getInitialState', async () => ({
    settings: database.getSettings(),
    sourceRoots: database.listSourceRoots(),
    mapPacks: database.listMapPacks(),
    tileServerUrl: await tileServer.start()
  }));

  ipcMain.handle('dialog:choosePhotoFolders', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose Photo Folders',
      properties: ['openDirectory', 'multiSelections', 'createDirectory']
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('dialog:chooseDirectory', async (_event, title?: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: title || 'Choose Folder',
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? undefined : result.filePaths[0];
  });

  ipcMain.handle('dialog:chooseMapPack', async () => {
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

  ipcMain.handle('settings:update', (_event, settings: Partial<AppSettings>) => library.updateSettings(settings));
  ipcMain.handle('library:addSourceRoots', (_event, paths: string[]) => library.addSourceRoots(paths));
  ipcMain.handle('library:scan', (_event, sourceRootId: string) => library.scanSourceRoot(sourceRootId));
  ipcMain.handle('assets:list', (_event, query?: AssetQuery) => library.listAssets(query));
  ipcMain.handle('metadata:save', (_event, assetIds: string[], patch: MetadataPatch) => library.saveMetadata(assetIds, patch));
  ipcMain.handle('metadata:revert', (_event, assetIds: string[]) => library.revertSidecars(assetIds));
  ipcMain.handle('maps:import', (_event, filePath: string) => library.importMapPack(filePath));
  ipcMain.handle('maps:list', () => library.listMapPacks());
  ipcMain.handle('places:search', (_event, query: string) => library.searchPlaces(query));
  ipcMain.handle('export:immich', (_event, assetIds: string[] | 'all', destination: string) =>
    library.exportImmich(assetIds, destination)
  );
  ipcMain.handle('path:reveal', (_event, filePath: string) => library.revealPath(filePath));
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  void tileServer?.stop();
  void exiftool?.end();
});

bootstrap().catch((error) => {
  dialog.showErrorBox('Startup failed', String((error as Error).stack ?? error));
  app.quit();
});
