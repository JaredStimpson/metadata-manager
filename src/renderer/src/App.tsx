import { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Camera,
  CheckCircle2,
  FileImage,
  FileText,
  FolderOpen,
  Grid2X2,
  Image,
  Info,
  Layers,
  List,
  LocateFixed,
  Map,
  MapPinned,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Tags,
  Terminal,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { MapPanel } from './components/MapPanel';
import { MapMaintenancePanel } from './components/MapMaintenancePanel';
import { FirstRunSetup } from './components/FirstRunSetup';
import {
  ActivityConsole,
  ActivityEntry,
  RunningActivity
} from './components/ActivityConsole';
import { apiClient, formatError, hasDesktopBridge } from './apiClient';
import {
  buildMetadataPatch,
  DirtyMetadataFields,
  emptyMetadataForm,
  formFromSelection,
  MetadataFieldKey,
  MetadataFormState,
  parseCoordinatePair,
  uniqueTags
} from './metadataForm';
import {
  AppSettings,
  AssetQuery,
  AssetSortBy,
  BackendProgress,
  HealthStatus,
  InitialState,
  FirstRunDefaults,
  FirstRunSetup as FirstRunSetupValue,
  LocalPlace,
  MapDownloadPlan,
  MapDownloadPreferences,
  MapPack,
  PhotoAsset,
  SourceRoot,
  SortDirection
} from '../../shared/types';

type WorkflowStep = 'import' | 'library' | 'edit' | 'export';
type MaintenanceStep = 'maps' | 'settings';
type AppArea = WorkflowStep | MaintenanceStep;
type BrowserView = 'thumbnail' | 'detail';

const defaultQuery: AssetQuery = {
  filter: 'all',
  sortBy: 'filename',
  sortDirection: 'asc',
  limit: 500
};

const workflowSteps: Array<{ id: WorkflowStep; label: string; icon: typeof Upload }> = [
  { id: 'import', label: 'Import', icon: Upload },
  { id: 'library', label: 'Library', icon: Grid2X2 },
  { id: 'edit', label: 'Edit', icon: FileText },
  { id: 'export', label: 'Export', icon: Archive }
];

const maintenanceSteps: Array<{ id: MaintenanceStep; label: string; icon: typeof Upload }> = [
  { id: 'maps', label: 'Maps', icon: Map },
  { id: 'settings', label: 'Settings', icon: Settings }
];

const sortOptions: Array<{ value: AssetSortBy; label: string }> = [
  { value: 'filename', label: 'Filename' },
  { value: 'date', label: 'Date' },
  { value: 'rating', label: 'Rating' },
  { value: 'location', label: 'Location' },
  { value: 'edited', label: 'Edit status' },
  { value: 'fileType', label: 'File type' },
  { value: 'updated', label: 'Updated' }
];

const filterOptions: Array<{ value: NonNullable<AssetQuery['filter']>; label: string }> = [
  { value: 'all', label: 'All photos' },
  { value: 'missing-location', label: 'No GPS' },
  { value: 'has-location', label: 'Has GPS' },
  { value: 'edited', label: 'Edited' },
  { value: 'conflicts', label: 'Conflicts' }
];

export function App(): JSX.Element {
  const bridgeAvailable = hasDesktopBridge();
  const [health, setHealth] = useState<HealthStatus>();
  const [settings, setSettings] = useState<AppSettings>({});
  const [sourceRoots, setSourceRoots] = useState<SourceRoot[]>([]);
  const [mapPacks, setMapPacks] = useState<MapPack[]>([]);
  const [mapPlan, setMapPlan] = useState<MapDownloadPlan>();
  const [mapProgress, setMapProgress] = useState<BackendProgress>();
  const [mapDraft, setMapDraft] = useState<MapDownloadPreferences>({
    regionIds: ['world-overview'],
    detailId: 'travel',
    budgetBytes: 5 * 1024 * 1024 * 1024
  });
  const [tileServerUrl, setTileServerUrl] = useState<string>();
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>();
  const [query, setQuery] = useState<AssetQuery>(defaultQuery);
  const [browserView, setBrowserView] = useState<BrowserView>('thumbnail');
  const [activeStep, setActiveStep] = useState<AppArea>('import');
  const [mapOpen, setMapOpen] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [firstRunDefaults, setFirstRunDefaults] = useState<FirstRunDefaults>();
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [runningActivities, setRunningActivities] = useState<RunningActivity[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [notice, setNotice] = useState('Starting desktop bridge...');
  const [form, setForm] = useState<MetadataFormState>(emptyMetadataForm);
  const [dirtyFields, setDirtyFields] = useState<DirtyMetadataFields>(() => new Set());
  const [mixedFields, setMixedFields] = useState<Set<MetadataFieldKey>>(() => new Set());
  const [tagDraft, setTagDraft] = useState('');

  const selectedAssets = useMemo(() => assets.filter((asset) => selectedIds.includes(asset.id)), [assets, selectedIds]);
  const selectedAsset = selectedAssets[0];
  const currentSource = sourceRoots[0];
  const activeActivity = runningActivities[runningActivities.length - 1];
  const busy = activeActivity?.label;
  const activeMapPack = useMemo(
    () => mapPacks.find((pack) => pack.id === settings.activeMapPackId && pack.kind === 'pmtiles'),
    [mapPacks, settings.activeMapPackId]
  );
  const placePacks = useMemo(() => mapPacks.filter((pack) => pack.kind === 'places-sqlite'), [mapPacks]);
  const availableTags = useMemo(
    () => uniqueTags(assets.flatMap((asset) => asset.effective.tags)).sort((left, right) => left.localeCompare(right)),
    [assets]
  );
  const availableExtensions = useMemo(
    () => [...new Set(assets.map((asset) => asset.extension).filter(Boolean))].sort(),
    [assets]
  );
  const selectedHasDirtySidecars = selectedAssets.some((asset) => asset.sidecarStatus === 'mirror' || asset.sidecarStatus === 'conflict');
  const selectedCanSave = selectedIds.length > 0 && dirtyFields.size > 0;
  const allFilteredSelected = assets.length > 0 && assets.every((asset) => selectedIds.includes(asset.id));

  useEffect(() => {
    if (!bridgeAvailable) {
      setNotice('Desktop bridge unavailable. Open the app with Run.cmd.');
      return;
    }
    void loadInitial();
  }, [bridgeAvailable]);

  useEffect(() => {
    if (!bridgeAvailable) return;
    apiClient.onMapLibraryChanged((result) => {
      setMapPacks(result.mapPacks);
      setSettings(result.settings);
      void apiClient.getMapDownloadPlan().then(applyMapPlan);
      if (result.errors.length) setNotice(`Map library updated with ${result.errors.length} invalid file${result.errors.length === 1 ? '' : 's'} skipped.`);
    });
  }, [bridgeAvailable]);

  useEffect(() => {
    if (!initialized || activeStep !== 'maps') return;
    void rescanMapLibrary(false);
  }, [activeStep, initialized]);

  useEffect(() => {
    if (!bridgeAvailable) return;
    apiClient.onBackendLog((entry) => {
      if (entry.scope === 'maps' && entry.progress) setMapProgress(entry.progress);
      if (entry.scope !== 'maps' && entry.level !== 'error') return;
      setActivityEntries((current) =>
        [
          ...current,
          {
            id: entry.id,
            taskId: entry.operationId ?? entry.id,
            label: `backend:${entry.scope}`,
            message: entry.message,
            status: entry.level === 'error' ? ('error' as const) : ('info' as const),
            timestamp: Date.parse(entry.timestamp) || Date.now()
          }
        ].slice(-250)
      );
      if (entry.level === 'error') setActivityCollapsed(false);
    });
  }, [bridgeAvailable]);

  useEffect(() => {
    if (!initialized) return;
    const timer = window.setTimeout(() => {
      void runTask('Refresh library', async (progress) => {
        progress('Applying the active search, filters, and sort order.');
        await refreshAssets(query);
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [initialized, query]);

  useEffect(() => {
    const next = formFromSelection(selectedAssets);
    setForm(next.form);
    setMixedFields(next.mixed);
    setDirtyFields(new Set());
    setTagDraft('');
  }, [selectedAssets]);

  async function loadInitial(): Promise<void> {
    await runTask('Startup health check', async (progress) => {
      progress('Checking the Electron bridge and local services.');
      const nextHealth = await apiClient.healthCheck();
      progress('Loading persistent sidecar and map settings.');
      const state = await apiClient.getInitialState();
      const nextPlan = await apiClient.getMapDownloadPlan();
      applyInitialState(state);
      applyMapPlan(nextPlan);
      setHealth(nextHealth);
      progress('Confirming the photo session starts empty.');
      await refreshAssets(defaultQuery);
      setInitialized(true);
      setNotice('Ready. Choose a source for this session; previous source folders are not remembered.');
    });
  }

  function applyInitialState(state: InitialState): void {
    setSettings(state.settings);
    setSourceRoots(state.sourceRoots);
    setMapPacks(state.mapPacks);
    setTileServerUrl(state.tileServerUrl);
    setFirstRunDefaults(state.firstRunDefaults);
  }

  async function completeFirstRun(setup: FirstRunSetupValue): Promise<void> {
    await runTask('Create local libraries', async (progress) => {
      progress('Validating that sidecars and maps are separate writable folders.');
      const state = await apiClient.completeFirstRunSetup(setup);
      applyInitialState(state);
      applyMapPlan(await apiClient.getMapDownloadPlan());
      setNotice('Local libraries are ready. Choose a photo source for this session.');
    });
  }

  function applyMapPlan(plan: MapDownloadPlan): void {
    setMapPlan(plan);
    setMapDraft(plan.preferences);
  }

  async function reloadInitialState(): Promise<void> {
    const state = await apiClient.getInitialState();
    applyInitialState(state);
    applyMapPlan(await apiClient.getMapDownloadPlan());
    const nextHealth = await apiClient.healthCheck();
    setHealth(nextHealth);
  }

  async function refreshAssets(nextQuery = query): Promise<void> {
    const nextAssets = await apiClient.listAssets(nextQuery);
    setAssets(nextAssets);
    setSelectedIds((current) => current.filter((id) => nextAssets.some((asset) => asset.id === id)));
  }

  async function importFiles(): Promise<void> {
    if (!currentSource) {
      setNotice('Choose a current source before adding individual photos.');
      setActiveStep('import');
      return;
    }
    const paths = await runTask('Choose photo files', async (progress) => {
      progress(`Showing files inside the current source: ${currentSource.name}.`);
      return apiClient.choosePhotoFiles();
    });
    if (!paths?.length) return;

    await runTask('Add photos', async (progress) => {
      progress(`Reading metadata from ${paths.length} selected file${paths.length === 1 ? '' : 's'}.`);
      const result = await apiClient.addImportedFiles(paths);
      progress('Refreshing the current library view.');
      await refreshAssets(query);
      setSelectedIds(result.assets.map((asset) => asset.id));
      setActiveStep('library');
      setNotice(importSummary(result.imported, result.skipped, result.errors.length, 'file'));
      if (result.errors.length) progress(result.errors[0].message);
    });
  }

  async function chooseNewSource(): Promise<void> {
    const sourcePath = await runTask('Choose current source', async (progress) => {
      progress('Waiting for a photo folder selection.');
      return apiClient.choosePhotoFolder();
    });
    if (!sourcePath) return;

    const root = await runTask('Switch current source', async (progress) => {
      progress('Clearing the previous session library without deleting photo or sidecar files.');
      const nextRoot = await apiClient.setSourceRoot(sourcePath);
      setSourceRoots([nextRoot]);
      setAssets([]);
      setSelectedIds([]);
      setLastSelectedIndex(undefined);
      setQuery(defaultQuery);
      progress(`Current source is now ${nextRoot.name}.`);
      return nextRoot;
    });
    if (!root) return;

    await runTask(`Scan ${root.name}`, async (progress) => {
      progress('Discovering supported photos and reading embedded and sidecar metadata.');
      const result = await apiClient.scanSourceRoot(root.id);
      progress(`Found ${result.scanned} supported photo${result.scanned === 1 ? '' : 's'}.`);
      await reloadInitialState();
      await refreshAssets(defaultQuery);
      setActiveStep('library');
      setNotice(
        `Current source: ${root.name}. Scanned ${result.scanned} photo${result.scanned === 1 ? '' : 's'}${
          result.errors.length ? ` with ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}` : ''
        }.`
      );
    });
  }

  async function chooseSidecarRoot(): Promise<void> {
    const path = await runTask('Choose sidecar mirror', () => apiClient.chooseDirectory('Choose Sidecar Mirror Folder'));
    if (!path) return;

    await runTask('Set sidecar mirror', async (progress) => {
      progress('Validating that the sidecar folder is separate from the current source.');
      const next = await apiClient.updateSettings({ sidecarRoot: path });
      setSettings(next);
      await reloadInitialState();
      await refreshAssets(query);
      setNotice('Sidecar mirror folder is ready. Source photos remain unchanged.');
    });
  }

  async function scan(root: SourceRoot): Promise<void> {
    await runTask(`Rescan ${root.name}`, async (progress) => {
      progress('Checking the current source for new or changed photos.');
      const result = await apiClient.scanSourceRoot(root.id);
      progress(`Read ${result.scanned} supported photo${result.scanned === 1 ? '' : 's'}.`);
      await reloadInitialState();
      await refreshAssets(query);
      setNotice(`Scanned ${result.scanned} photo${result.scanned === 1 ? '' : 's'} from ${root.name}; ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}.`);
    });
  }

  async function importMapPack(): Promise<void> {
    const path = await runTask('Choose map pack', () => apiClient.chooseMapPack());
    if (!path) return;

    await runTask('Import map pack', async (progress) => {
      progress('Inspecting the map pack header, tile type, bounds, and zoom levels.');
      const pack = await apiClient.importMapPack(path);
      await reloadInitialState();
      setNotice(`Imported ${pack.name}${pack.metadata?.maxZoom !== undefined ? `, zoom ${pack.metadata.minZoom}-${pack.metadata.maxZoom}` : ''}.`);
    });
  }

  async function rescanMapLibrary(showNotice = true): Promise<void> {
    await runTask('Rescan map library', async (progress) => {
      progress('Checking direct children of the managed maps folder.');
      const result = await apiClient.rescanMapLibrary();
      setMapPacks(result.mapPacks);
      setSettings(result.settings);
      applyMapPlan(await apiClient.getMapDownloadPlan());
      if (showNotice) {
        setNotice(`Map scan complete: ${result.added} added, ${result.missing} missing, ${result.errors.length} invalid.`);
      }
    });
  }

  async function openMapSetup(): Promise<void> {
    await runTask('Open MapSetup.cmd', async () => {
      await apiClient.openMapSetup();
      setNotice('Opened MapSetup.cmd in a terminal window.');
    });
  }

  async function setActiveMapPack(id: string): Promise<void> {
    await runTask('Set active map', async () => {
      const next = await apiClient.updateSettings({ activeMapPackId: id || undefined });
      setSettings(next);
      await reloadInitialState();
      setNotice(id ? 'Offline map pack selected.' : 'Offline map disabled. Manual coordinates still work.');
    });
  }

  async function openMapGuide(): Promise<void> {
    await runTask('Open map downloads', () => apiClient.openExternal('https://docs.protomaps.com/basemaps/downloads'));
  }

  async function chooseMapOutputDirectory(): Promise<void> {
    const path = await runTask('Choose map output folder', () => apiClient.chooseDirectory('Choose Offline Map Download Folder'));
    if (!path) return;
    setMapDraft((current) => ({ ...current, outputDirectory: path }));
  }

  async function chooseManagedMapDirectory(): Promise<void> {
    const selected = await runTask('Choose managed maps folder', () => apiClient.chooseDirectory('Choose Managed Maps Folder'));
    if (!selected) return;
    await runTask('Change managed maps folder', async (progress) => {
      progress('Validating the folder and scanning PMTiles files.');
      const plan = await apiClient.saveMapDownloadPreferences({ ...mapDraft, outputDirectory: selected });
      applyMapPlan(plan);
      await rescanMapLibrary(false);
      setNotice('Managed maps folder changed and rescanned.');
    });
  }

  async function setShowMapLabels(showMapLabels: boolean): Promise<void> {
    const next = await apiClient.updateSettings({ showMapLabels });
    setSettings(next);
  }

  async function saveMapPreferences(): Promise<void> {
    await runTask('Save map setup', async (progress) => {
      progress('Persisting map regions, detail, budget, output folder, and source.');
      const plan = await apiClient.saveMapDownloadPreferences(mapDraft);
      applyMapPlan(plan);
      setNotice('Map setup saved. Installed packs remain available offline.');
    });
  }

  async function downloadMapSelection(): Promise<void> {
    setMapProgress({
      current: 0,
      total: mapDraft.regionIds.length,
      percent: 0,
      phase: 'requesting backend download'
    });
    await runTask('Download offline maps', async (progress) => {
      progress(
        `Preparing ${mapDraft.regionIds.length} region${mapDraft.regionIds.length === 1 ? '' : 's'} at ${mapDraft.detailId} detail.`
      );
      progress('Downloading and extracting PMTiles. Elapsed time will continue here if the process is slow.');
      const result = await apiClient.downloadMapSelection(mapDraft);
      progress('Validating downloaded packs and refreshing the offline map registry.');
      await reloadInitialState();
      const errorPart = result.errors.length
        ? `, ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`
        : '';
      setNotice(`Downloaded ${result.mapPacks.length} map pack${result.mapPacks.length === 1 ? '' : 's'}${errorPart}.`);
    });
  }

  async function removeMapPack(id: string, deleteFile: boolean): Promise<void> {
    await runTask(deleteFile ? 'Delete map pack file' : 'Unregister map pack', async () => {
      const result = await apiClient.removeMapPack(id, deleteFile);
      setSettings(result.settings);
      setMapPacks(result.mapPacks);
      applyMapPlan(await apiClient.getMapDownloadPlan());
      setNotice(result.deletedFile ? 'Map pack removed and file deleted.' : 'Map pack removed from the app registry.');
    });
  }

  async function saveMetadata(): Promise<void> {
    if (selectedIds.length === 0) {
      setNotice('Select one or more photos before saving metadata.');
      return;
    }
    if (dirtyFields.size === 0) {
      setNotice('No metadata changes to save.');
      return;
    }

    await runTask('Save sidecar metadata', async (progress) => {
      const patch = buildMetadataPatch(form, dirtyFields);
      requireCoordinatePair(patch, form);
      progress(
        `Writing ${dirtyFields.size} changed field${dirtyFields.size === 1 ? '' : 's'} for ${selectedIds.length} selected photo${selectedIds.length === 1 ? '' : 's'}.`
      );
      const result = await apiClient.saveMetadata(selectedIds, patch);
      setDirtyFields(new Set());
      await refreshAssets(query);
      setNotice(`Saved ${result.sidecarsWritten} mirrored sidecar${result.sidecarsWritten === 1 ? '' : 's'}.`);
    });
  }

  async function applyLocation(latitude: number, longitude: number): Promise<void> {
    setForm((current) => ({
      ...current,
      latitude: latitude.toFixed(7),
      longitude: longitude.toFixed(7),
      coordinatePaste: ''
    }));
    markDirty('latitude', 'longitude');
    if (selectedIds.length === 0) {
      setNotice('Pin placed. Select photos before applying it.');
      return;
    }

    await runTask('Apply geotag', async () => {
      await apiClient.saveMetadata(selectedIds, { latitude, longitude });
      await refreshAssets(query);
      setNotice(`Applied GPS to ${selectedIds.length} photo${selectedIds.length === 1 ? '' : 's'}.`);
    });
  }

  async function revert(): Promise<void> {
    if (selectedIds.length === 0) return;

    await runTask('Revert mirror sidecars', async () => {
      await apiClient.revertSidecars(selectedIds);
      await refreshAssets(query);
      setNotice(`Reverted mirror sidecar edits for ${selectedIds.length} photo${selectedIds.length === 1 ? '' : 's'}.`);
    });
  }

  async function removeSelectedFromLibrary(): Promise<void> {
    if (selectedIds.length === 0) return;
    await runTask('Remove photos from library', async () => {
      const result = await apiClient.removeAssetsFromLibrary(selectedIds);
      setSelectedIds([]);
      setLastSelectedIndex(undefined);
      await refreshAssets(query);
      setNotice(`Removed ${result.removed} photo${result.removed === 1 ? '' : 's'} from the library. Files were not deleted.`);
    });
  }

  async function exportImmich(all: boolean): Promise<void> {
    if (!all && selectedIds.length === 0) {
      setNotice('Select photos before exporting selected items.');
      return;
    }

    const destination = await runTask('Choose Immich staging folder', () =>
      apiClient.chooseDirectory('Choose Immich Staging Folder')
    );
    if (!destination) return;

    await runTask('Export for Immich', async (progress) => {
      progress('Creating the staging tree and attempting hardlinks before copying media.');
      const result = await apiClient.exportImmich(all ? 'all' : selectedIds, destination);
      progress('Writing Immich-compatible filename.ext.xmp sidecars beside staged media.');
      setNotice(
        `Exported ${result.exportedAssets} asset${result.exportedAssets === 1 ? '' : 's'}, wrote ${result.sidecarsWritten} XMP sidecar${result.sidecarsWritten === 1 ? '' : 's'}, ${result.hardlinked} hardlink${result.hardlinked === 1 ? '' : 's'}, ${result.copied} copied, ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}.`
      );
    });
  }

  async function revealSelected(): Promise<void> {
    if (!selectedAsset) return;
    await runTask('Reveal photo', () => apiClient.revealPath(selectedAsset.absolutePath));
  }

  async function openBackendConsole(): Promise<void> {
    if (!health?.backendUrl) return;
    await runTask('Open backend console', async (progress) => {
      progress(`Opening persistent backend logs on port ${health.backendPort}.`);
      await apiClient.openExternal(health.backendUrl);
    });
  }

  async function revealBackendLog(): Promise<void> {
    if (!health?.backendLogPath) return;
    await runTask('Reveal backend log', async () => {
      await apiClient.revealPath(health.backendLogPath);
    });
  }

  async function searchPlaces(placeQuery: string): Promise<LocalPlace[]> {
    try {
      return await apiClient.searchPlaces(placeQuery);
    } catch (error) {
      setNotice(formatError(error));
      return [];
    }
  }

  async function runTask<T>(
    label: string,
    task: (progress: (message: string) => void) => Promise<T>
  ): Promise<T | undefined> {
    const taskId = crypto.randomUUID();
    const startedAt = Date.now();
    const running: RunningActivity = { id: taskId, label, startedAt };
    const entry: ActivityEntry = {
      id: taskId,
      taskId,
      label,
      message: 'Started.',
      status: 'running',
      timestamp: startedAt
    };
    setRunningActivities((current) => [...current, running]);
    setActivityEntries((current) => [...current, entry].slice(-250));

    const progress = (message: string): void => {
      setActivityEntries((current) =>
        [
          ...current,
          {
            id: crypto.randomUUID(),
            taskId,
            label: 'step',
            message,
            status: 'info' as const,
            timestamp: Date.now()
          }
        ].slice(-250)
      );
    };

    try {
      const result = await task(progress);
      const completedAt = Date.now();
      setActivityEntries((current) =>
        current.map((currentEntry) =>
          currentEntry.id === taskId
            ? { ...currentEntry, status: 'success', message: 'Completed.', completedAt }
            : currentEntry
        )
      );
      return result;
    } catch (error) {
      const message = formatError(error);
      const completedAt = Date.now();
      setActivityEntries((current) =>
        current.map((currentEntry) =>
          currentEntry.id === taskId
            ? { ...currentEntry, status: 'error', message, completedAt }
            : currentEntry
        )
      );
      setActivityCollapsed(false);
      setNotice(`${label}: ${message}`);
      return undefined;
    } finally {
      setRunningActivities((current) => current.filter((activity) => activity.id !== taskId));
    }
  }

  function clearCompletedActivity(): void {
    setActivityEntries((current) => current.filter((entry) => entry.status === 'running'));
  }

  function updateQuery(patch: Partial<AssetQuery>): void {
    setQuery((current) => ({ ...current, ...patch, limit: current.limit ?? 500 }));
  }

  function selectAsset(asset: PhotoAsset, index: number, event: ReactMouseEvent): void {
    const additive = event.ctrlKey || event.metaKey;
    const range = event.shiftKey && lastSelectedIndex !== undefined;
    setSelectedIds((current) => {
      if (range) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const rangeIds = assets.slice(start, end + 1).map((rangeAsset) => rangeAsset.id);
        return additive ? uniqueIds([...current, ...rangeIds]) : rangeIds;
      }
      if (!additive) return [asset.id];
      return current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id];
    });
    setLastSelectedIndex(index);
    if (activeStep === 'import') setActiveStep('edit');
  }

  function selectAllFiltered(forceSelect = false): void {
    setSelectedIds(!forceSelect && allFilteredSelected ? [] : assets.map((asset) => asset.id));
    setLastSelectedIndex(assets.length ? 0 : undefined);
  }

  function handleBrowserKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      selectAllFiltered(true);
    }
  }

  function markDirty(...fields: MetadataFieldKey[]): void {
    setDirtyFields((current) => {
      const next = new Set(current);
      fields.forEach((field) => next.add(field));
      return next;
    });
  }

  function updateForm<K extends keyof MetadataFormState>(
    key: K,
    value: MetadataFormState[K],
    dirtyField?: MetadataFieldKey
  ): void {
    setForm((current) => ({ ...current, [key]: value }));
    if (dirtyField) markDirty(dirtyField);
  }

  function pasteCoordinates(): void {
    const parsed = parseCoordinatePair(form.coordinatePaste);
    if (!parsed) {
      setNotice('Use coordinates like 34.0522, -118.2437.');
      return;
    }
    setForm((current) => ({ ...current, latitude: parsed.latitude, longitude: parsed.longitude, coordinatePaste: '' }));
    markDirty('latitude', 'longitude');
    setNotice('Coordinates staged. Save sidecar to write them.');
  }

  function addTag(): void {
    const tag = tagDraft.trim();
    if (!tag) return;
    setForm((current) => ({ ...current, tags: uniqueTags([...current.tags, tag]) }));
    setTagDraft('');
    markDirty('tags');
  }

  function removeTag(tag: string): void {
    setForm((current) => ({ ...current, tags: current.tags.filter((currentTag) => currentTag !== tag) }));
    markDirty('tags');
  }

  function setRating(value: string): void {
    setForm((current) => ({ ...current, rating: value }));
    markDirty('rating');
  }

  if (!bridgeAvailable) {
    return <BridgeUnavailable />;
  }

  if (initialized && !settings.firstRunCompleted && firstRunDefaults) {
    return (
      <FirstRunSetup
        defaults={firstRunDefaults}
        busy={busy}
        onChooseFolder={(title) => apiClient.chooseDirectory(title)}
        onComplete={completeFirstRun}
      />
    );
  }

  return (
    <div
      className={[
        'workflow-shell',
        activeStep === 'edit' ? 'editor-open' : '',
        activeStep === 'edit' && mapOpen ? 'map-open' : '',
        activeStep === 'edit' && mapOpen && mapExpanded ? 'map-expanded' : '',
        activityCollapsed ? 'activity-collapsed' : 'activity-open'
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <aside className="workflow-rail">
        <div className="rail-brand">
          <MapPinned size={24} />
          <span>Photo Meta</span>
        </div>
        <nav className="rail-group">
          <small>Workflow</small>
          {workflowSteps.map((step) => {
            const Icon = step.icon;
            return (
              <button
                key={step.id}
                className={activeStep === step.id ? 'active' : ''}
                onClick={() => {
                  setActiveStep(step.id);
                  if (step.id !== 'edit') setMapOpen(false);
                }}
                title={workflowHelp(step.id)}
              >
                <Icon size={20} />
                <span>{step.label}</span>
              </button>
            );
          })}
        </nav>
        <nav className="rail-group maintenance-group">
          <small>Maintenance</small>
          {maintenanceSteps.map((step) => {
            const Icon = step.icon;
            return (
              <button
                key={step.id}
                className={activeStep === step.id ? 'active' : ''}
                onClick={() => {
                  setActiveStep(step.id);
                  setMapOpen(false);
                }}
                title={maintenanceHelp(step.id)}
              >
                <Icon size={20} />
                <span>{step.label}</span>
              </button>
            );
          })}
        </nav>
        <button
          className={activityCollapsed ? 'rail-tool' : 'rail-tool active'}
          onClick={() => setActivityCollapsed((current) => !current)}
          title="Open the activity console to see every operation, progress step, error, and elapsed time"
        >
          <Terminal size={20} />
          <span>Activity</span>
        </button>
      </aside>

      <main
        className={
          activeStep === 'maps' || activeStep === 'settings'
            ? 'maintenance-stage'
            : `library-stage area-${activeStep}`
        }
      >
        <header className={busy ? 'status-banner working' : 'status-banner'}>
          <div>
            <strong>
              {busy && <RefreshCw className="spin" size={15} />}
              {busy ?? workflowTitle(activeStep)}
            </strong>
            <span>{notice}</span>
          </div>
          <div className="health-pills">
            <StatusPill ok={Boolean(health)} label={health ? `Bridge ${health.appVersion}` : 'Bridge'} title="The secure Electron connection to local files is available" />
            <StatusPill
              ok={Boolean(health?.backendUrl)}
              label={health ? `Backend :${health.backendPort}` : 'Backend'}
              title="The localhost backend runs file processes and keeps persistent diagnostic logs"
            />
            <StatusPill ok label="Source unchanged" title="The app reads source photos but never writes metadata into them" />
            <StatusPill ok={Boolean(settings.sidecarRoot)} label="Sidecar mirror" title="Editable metadata is stored separately in the configured XMP mirror" />
            <StatusPill ok={Boolean(tileServerUrl)} label="Tile server" title="The local-only map tile service is ready for offline maps" />
          </div>
        </header>

        {activeStep === 'maps' ? (
          <MapMaintenancePanel
            plan={mapPlan}
            draft={mapDraft}
            settings={settings}
            busy={busy}
            progress={mapProgress}
            onDraftChange={setMapDraft}
            onChooseOutputDirectory={chooseMapOutputDirectory}
            onSavePreferences={saveMapPreferences}
            onDownloadSelection={downloadMapSelection}
            onImportPack={importMapPack}
            onOpenMapSetup={openMapSetup}
            onOpenDocs={openMapGuide}
            onSetActiveMapPack={setActiveMapPack}
            onRemoveMapPack={removeMapPack}
            onRescan={() => rescanMapLibrary()}
          />
        ) : activeStep === 'settings' ? (
          <SettingsMaintenance
            settings={settings}
            health={health}
            currentSource={currentSource}
            busy={busy}
            onChooseSidecarRoot={chooseSidecarRoot}
            mapDirectory={mapDraft.outputDirectory ?? mapPlan?.defaultOutputDirectory}
            onChooseMapDirectory={chooseManagedMapDirectory}
            onOpenBackendConsole={openBackendConsole}
            onRevealBackendLog={revealBackendLog}
          />
        ) : (
          <>
        {activeStep === 'import' && (
          <section className="import-workspace">
            <div className="import-heading">
              <div>
                <h1>Choose this session's photo source</h1>
                <p>The source is cleared when the app closes. Photos stay in place and original files are never modified.</p>
              </div>
              <div className="button-row wrap">
                <button
                  className="primary"
                  disabled={Boolean(busy)}
                  onClick={chooseNewSource}
                  title="Choose one folder as the current source; switching sources clears the old library view without deleting files"
                >
                  <FolderOpen size={17} /> {currentSource ? 'Choose Different Source' : 'Choose Source'}
                </button>
                <button
                  disabled={Boolean(busy) || !currentSource}
                  onClick={importFiles}
                  title="Add selected photo files that are inside the current source folder"
                >
                  <Upload size={17} /> Add Specific Photos
                </button>
              </div>
            </div>
            <div className="setup-grid">
              <SetupItem
                ok={Boolean(currentSource)}
                title={currentSource ? currentSource.name : 'No current source'}
                detail={currentSource ? compactPath(currentSource.path) : 'Choose one photo folder to begin this session.'}
                help="Only this source is active. Choosing another source replaces it in the session library."
              />
              <SetupItem
                ok={Boolean(settings.sidecarRoot)}
                title="Sidecar mirror"
                detail={settings.sidecarRoot ? compactPath(settings.sidecarRoot) : 'Choose where editable XMP sidecars live.'}
                help="Sidecar settings persist between sessions even though photo sources do not."
              />
              <SetupItem
                ok={mapPacks.some((pack) => pack.kind === 'pmtiles')}
                title="Offline maps"
                detail={activeMapPack ? activeMapPack.name : 'Manual coordinates work without a map pack.'}
                help="Offline map packs persist and are managed under Maintenance, Maps."
              />
            </div>
            <div className="import-session-note">
              <Info size={17} />
              <div>
                <strong>Session-only library</strong>
                <span>Closing the app forgets source paths and scanned thumbnails. Your source photos, mirrored sidecars, map packs, and settings remain on disk.</span>
              </div>
            </div>
          </section>
        )}

        {activeStep === 'export' && (
          <section className="workflow-card export-card">
            <div>
              <h1>Immich staging export</h1>
              <p>Creates a separate folder with media plus `filename.ext.xmp` sidecars beside staged files.</p>
            </div>
            <div className="button-row">
              <button
                disabled={selectedIds.length === 0}
                onClick={() => exportImmich(false)}
                title="Create an Immich-ready staging folder containing only selected photos and filename.ext.xmp sidecars"
              >
                <Archive size={17} /> Export Selected
              </button>
              <button
                disabled={assets.length === 0}
                onClick={() => exportImmich(true)}
                title="Create an Immich-ready staging folder from every photo visible under the current filters"
              >
                <Archive size={17} /> Export All Filtered
              </button>
            </div>
          </section>
        )}

        {activeStep !== 'import' && (
        <section className="browser-panel" tabIndex={0} onKeyDown={handleBrowserKeyDown}>
          <div className="browser-header">
            <div>
              <h1>{assets.length} Photos</h1>
              <span>{selectedIds.length} selected</span>
            </div>
            <div className="browser-header-actions">
              <div
                className={currentSource ? 'current-source-chip active' : 'current-source-chip'}
                title={currentSource ? `Current source: ${currentSource.path}` : 'No source is active for this session'}
              >
                <FolderOpen size={15} />
                <span>
                  <small>Current source</small>
                  <strong>{currentSource?.name ?? 'None'}</strong>
                </span>
              </div>
              <button
                disabled={Boolean(busy) || !currentSource}
                onClick={() => currentSource && scan(currentSource)}
                title="Rescan the current source for new or changed photos"
                aria-label="Rescan current source"
              >
                <RefreshCw size={16} />
              </button>
              <div className="view-toggle" aria-label="Photo browser view">
                <button className={browserView === 'thumbnail' ? 'active' : ''} onClick={() => setBrowserView('thumbnail')} title="Show photos as large thumbnails">
                  <Grid2X2 size={17} />
                </button>
                <button className={browserView === 'detail' ? 'active' : ''} onClick={() => setBrowserView('detail')} title="Show photos in a sortable metadata table">
                  <List size={17} />
                </button>
              </div>
            </div>
          </div>

          <div className="library-toolbar">
            <label className="searchbox">
              <Search size={16} />
              <input
                value={query.text ?? ''}
                placeholder="Search filename, path, tags"
                title="Search the current source by filename, relative path, or metadata tag"
                onChange={(event) => updateQuery({ text: event.target.value || undefined })}
              />
            </label>
            <select
              value={query.filter ?? 'all'}
              title="Filter photos by GPS, sidecar edit, or metadata conflict status"
              onChange={(event) => updateQuery({ filter: event.target.value as AssetQuery['filter'] })}
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={query.sortBy ?? 'filename'}
              title="Choose the metadata field used to order the current library"
              onChange={(event) => updateQuery({ sortBy: event.target.value as AssetSortBy })}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  Sort: {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => updateQuery({ sortDirection: nextSortDirection(query.sortDirection) })}
              title="Reverse the current sort order"
            >
              <SlidersHorizontal size={16} /> {(query.sortDirection ?? 'asc').toUpperCase()}
            </button>
          </div>

          <div className="filter-row">
            <select title="Show only photos with a specific rating" value={query.rating ?? ''} onChange={(event) => updateQuery({ rating: event.target.value ? Number(event.target.value) : undefined })}>
              <option value="">Any rating</option>
              {[0, 1, 2, 3, 4, 5].map((rating) => (
                <option key={rating} value={rating}>
                  {rating} star{rating === 1 ? '' : 's'}
                </option>
              ))}
            </select>
            <select title="Show only one photo file type" value={query.extension ?? ''} onChange={(event) => updateQuery({ extension: event.target.value || undefined })}>
              <option value="">Any type</option>
              {availableExtensions.map((extension) => (
                <option key={extension} value={extension}>
                  {extension}
                </option>
              ))}
            </select>
            <select title="Show only photos containing a selected metadata tag" value={query.tag ?? ''} onChange={(event) => updateQuery({ tag: event.target.value || undefined })}>
              <option value="">Any tag</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            <button disabled={assets.length === 0} onClick={() => selectAllFiltered()} title="Select every photo currently visible after filters; Ctrl+A does the same">
              <Layers size={16} /> {allFilteredSelected ? 'Clear Selection' : 'Select All Filtered'}
            </button>
            <button
              disabled={selectedIds.length === 0 || Boolean(busy)}
              onClick={removeSelectedFromLibrary}
              title="Unregister selected photos from this session view without deleting source files or sidecars"
            >
              <Trash2 size={16} /> Remove From Library
            </button>
          </div>

          {assets.length === 0 ? (
            <div className="empty-library">
              <Image size={34} />
              <strong>No photos in this view</strong>
              <span>Import files or folders, or loosen the active filters.</span>
            </div>
          ) : browserView === 'thumbnail' ? (
            <div className="photo-grid">
              {assets.map((asset, index) => (
                <button
                  key={asset.id}
                  className={selectedIds.includes(asset.id) ? 'asset-tile selected' : 'asset-tile'}
                  onClick={(event) => selectAsset(asset, index, event)}
                  title={asset.relativePath}
                >
                  <AssetThumbnail asset={asset} backendUrl={health?.backendUrl} />
                  <span>{asset.filename}</span>
                  <small>{assetSummary(asset)}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="detail-view">
              <table className="asset-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Date</th>
                    <th>Rating</th>
                    <th>GPS</th>
                    <th>Sidecar</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset, index) => (
                    <tr
                      key={asset.id}
                      className={selectedIds.includes(asset.id) ? 'selected' : ''}
                      onClick={(event) => selectAsset(asset, index, event)}
                    >
                      <td title={asset.relativePath}>{asset.filename}</td>
                      <td>{asset.effective.dateTimeOriginal ?? '-'}</td>
                      <td>{asset.effective.rating ?? '-'}</td>
                      <td>{locationLabel(asset)}</td>
                      <td>
                        <span className={`inline-badge ${asset.sidecarStatus}`}>{badgeLabel(asset.sidecarStatus)}</span>
                      </td>
                      <td>{asset.extension}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}
          </>
        )}
      </main>

      {activeStep === 'edit' && (
      <aside className="metadata-inspector">
        <section className="inspector-section">
          <div className="panel-title">
            <div>
              <h2>{selectedIds.length > 1 ? 'Batch Metadata' : 'Metadata'}</h2>
              <span>{selectedIds.length ? `${selectedIds.length} selected` : 'Select photos to edit'}</span>
            </div>
            <div className="panel-title-actions">
              <button
                className={mapOpen ? 'active' : ''}
                onClick={() => setMapOpen((current) => !current)}
                title="Open the geotag map beside the metadata editor"
                aria-label="Toggle geotag map"
              >
                <Map size={16} />
              </button>
              <button disabled={!selectedAsset} onClick={revealSelected} title="Reveal the first selected photo in File Explorer">
                <FolderOpen size={16} />
              </button>
            </div>
          </div>

          <label title="Write a caption or description into the mirrored XMP sidecar">
            <span>Description {fieldState('description', mixedFields, dirtyFields)}</span>
            <textarea
              value={form.description}
              disabled={selectedIds.length === 0}
              placeholder={mixedPlaceholder('description', mixedFields, dirtyFields)}
              onChange={(event) => updateForm('description', event.target.value, 'description')}
            />
          </label>

          <label title="Set a zero-to-five-star XMP rating for every selected photo">
            <span>Rating {fieldState('rating', mixedFields, dirtyFields)}</span>
            <div className="rating-control">
              <button
                className={form.rating === '' ? 'active' : ''}
                disabled={selectedIds.length === 0}
                onClick={() => setRating('')}
                title="Stage removal of the rating from selected photos"
              >
                Clear
              </button>
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  className={form.rating === String(rating) ? 'active' : ''}
                  disabled={selectedIds.length === 0}
                  onClick={() => setRating(String(rating))}
                  title={`Stage a ${rating}-star rating for selected photos`}
                >
                  {rating}
                </button>
              ))}
            </div>
          </label>

          <div className="date-fields">
            <label title="Choose a local date and time with the Windows date picker">
              <span>Date/time picker {fieldState('dateTimeOriginal', mixedFields, dirtyFields)}</span>
              <input
                type="datetime-local"
                value={dateTimeLocalValue(form.dateTimeOriginal)}
                disabled={selectedIds.length === 0}
                onChange={(event) => updateForm('dateTimeOriginal', event.target.value, 'dateTimeOriginal')}
              />
            </label>
            <label title="Enter an exact XMP date, including timezone text when needed">
              <span>Freeform date/time</span>
              <input
                value={form.dateTimeOriginal}
                disabled={selectedIds.length === 0}
                placeholder={mixedPlaceholder('dateTimeOriginal', mixedFields, dirtyFields) || 'YYYY:MM:DD HH:mm:ss or timezone text'}
                onChange={(event) => updateForm('dateTimeOriginal', event.target.value, 'dateTimeOriginal')}
              />
            </label>
          </div>

          <div className="coordinate-block">
            <div className="two-col">
              <label title="GPS latitude from -90 to 90 degrees">
                <span>Latitude {fieldState('latitude', mixedFields, dirtyFields)}</span>
                <input
                  value={form.latitude}
                  disabled={selectedIds.length === 0}
                  placeholder={mixedPlaceholder('latitude', mixedFields, dirtyFields)}
                  onChange={(event) => updateForm('latitude', event.target.value, 'latitude')}
                />
              </label>
              <label title="GPS longitude from -180 to 180 degrees">
                <span>Longitude {fieldState('longitude', mixedFields, dirtyFields)}</span>
                <input
                  value={form.longitude}
                  disabled={selectedIds.length === 0}
                  placeholder={mixedPlaceholder('longitude', mixedFields, dirtyFields)}
                  onChange={(event) => updateForm('longitude', event.target.value, 'longitude')}
                />
              </label>
            </div>
            <div className="paste-row">
              <input
                value={form.coordinatePaste}
                disabled={selectedIds.length === 0}
                placeholder="Paste lat, lon"
                title="Paste a coordinate pair such as 34.0522, -118.2437"
                onChange={(event) => updateForm('coordinatePaste', event.target.value)}
              />
              <button disabled={selectedIds.length === 0 || !form.coordinatePaste.trim()} onClick={pasteCoordinates} title="Parse the pasted coordinates and stage them for the next sidecar save">
                <LocateFixed size={16} /> Use
              </button>
            </div>
          </div>

          <label title="Add searchable XMP subject tags; batch editing changes tags only after this field is touched">
            <span>Tags {fieldState('tags', mixedFields, dirtyFields)}</span>
            <div className="tag-editor">
              <div className="tag-chips">
                {form.tags.length === 0 ? (
                  <span className="empty-tags">{mixedPlaceholder('tags', mixedFields, dirtyFields) || 'No tags'}</span>
                ) : (
                  form.tags.map((tag) => (
                    <button key={tag} disabled={selectedIds.length === 0} onClick={() => removeTag(tag)} title={`Remove the "${tag}" tag from the staged metadata`}>
                      {tag}
                      <X size={13} />
                    </button>
                  ))
                )}
              </div>
              <div className="tag-entry">
                <Tags size={16} />
                <input
                  list="tag-suggestions"
                  value={tagDraft}
                  disabled={selectedIds.length === 0}
                  placeholder="Add tag"
                  title="Type a tag, choose an existing suggestion, and press Enter"
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                />
                <button disabled={selectedIds.length === 0 || !tagDraft.trim()} onClick={addTag} title="Add this tag to the staged metadata">
                  Add
                </button>
              </div>
              <datalist id="tag-suggestions">
                {availableTags.map((tag) => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>
            </div>
          </label>

          <div className="button-row">
            <button disabled={!selectedCanSave || !settings.sidecarRoot} onClick={saveMetadata} title="Write only the changed fields into mirrored XMP sidecars; source photos stay untouched">
              <Save size={16} /> Save Sidecar
            </button>
            <button disabled={selectedIds.length === 0 || !selectedHasDirtySidecars} onClick={revert} title="Delete the app's mirrored sidecar edits for the selection and fall back to adjacent or embedded metadata">
              <RotateCcw size={16} /> Revert
            </button>
          </div>

          {!settings.sidecarRoot && (
            <div className="soft-warning">
              <Info size={16} />
              <span>Choose a sidecar mirror under Maintenance, Settings before saving edits.</span>
            </div>
          )}

          {selectedAsset && (
            <dl className="meta-list">
              <dt>Effective</dt>
              <dd>{sourceLabel(selectedAsset.effectiveSource)}</dd>
              <dt>Sidecar</dt>
              <dd>{selectedAsset.mirrorSidecarPath ? compactPath(selectedAsset.mirrorSidecarPath) : badgeLabel(selectedAsset.sidecarStatus)}</dd>
              <dt>Original</dt>
              <dd>{compactPath(selectedAsset.absolutePath)}</dd>
            </dl>
          )}
        </section>
      </aside>
      )}

      {activeStep === 'edit' && mapOpen && (
        <aside className="tools-drawer">
          <section className="inspector-section">
            <div className="panel-title">
              <div>
                <h2>Geotag Map</h2>
                <span>{activeMapPack ? activeMapPack.name : 'Manual coordinates available'}</span>
              </div>
              <div className="panel-title-actions">
                <button onClick={() => setMapExpanded((current) => !current)} title={mapExpanded ? 'Restore the metadata editor' : 'Expand map to half the workspace'}>
                  {mapExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button onClick={() => { setMapOpen(false); setMapExpanded(false); }} title="Close the geotag map">
                  <X size={16} />
                </button>
              </div>
            </div>

            {!activeMapPack && (
              <div className="no-map-panel">
                <Map size={24} />
                <strong>No offline map selected</strong>
                <span>Manual coordinates still work. Use Maps maintenance to install or change packs.</span>
              </div>
            )}

            <div className="button-row wrap">
              <button onClick={() => setActiveStep('maps')} title="Open map maintenance to download, import, activate, or remove offline packs">
                <Map size={16} /> Manage Maps
              </button>
            </div>

            <label>
              Active map pack
              <select
                value={settings.activeMapPackId ?? ''}
                title="Choose which installed PMTiles pack appears in the geotag editor"
                onChange={(event) => setActiveMapPack(event.target.value)}
              >
                <option value="">No map pack</option>
                {mapPacks
                  .filter((pack) => pack.kind === 'pmtiles' && pack.availability === 'available')
                  .map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name}
                    </option>
                  ))}
              </select>
            </label>

            {activeMapPack && <div className="map-pack-summary">{mapPackSummary(activeMapPack)}</div>}

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.showMapLabels !== false}
                disabled={!activeMapPack || activeMapPack.metadata?.labelMode === 'none'}
                onChange={(event) => setShowMapLabels(event.target.checked)}
              />
              <span>Labels</span>
              {activeMapPack?.metadata?.labelMode === 'none' && <small>Labels unavailable for this pack</small>}
            </label>

            <div className="map-status-grid">
              <SetupItem ok={Boolean(tileServerUrl)} title="Tile server" detail={tileServerUrl ?? 'Not running'} />
              <SetupItem ok={placePacks.length > 0} title="Place search" detail={placePacks.length ? `${placePacks.length} place pack${placePacks.length === 1 ? '' : 's'}` : 'Optional SQLite pack not installed.'} />
            </div>

            <MapPanel
              activeMapPackId={settings.activeMapPackId}
              mapPacks={mapPacks}
              tileServerUrl={tileServerUrl}
              selectedAsset={selectedAsset}
              expanded={mapExpanded}
              showLabels={settings.showMapLabels !== false}
              onSearchPlaces={searchPlaces}
              onApplyLocation={applyLocation}
            />
          </section>
        </aside>
      )}

      <ActivityConsole
        entries={activityEntries}
        running={runningActivities}
        collapsed={activityCollapsed}
        onToggle={() => setActivityCollapsed((current) => !current)}
        onClear={clearCompletedActivity}
      />
    </div>
  );
}

function BridgeUnavailable(): JSX.Element {
  return (
    <div className="bridge-missing">
      <MapPinned size={42} />
      <h1>Desktop bridge unavailable</h1>
      <p>Start the app with `Run.cmd`. Opening the built HTML in a browser disables file dialogs, scanning, sidecar writes, maps, and export.</p>
      <code>.\Run.cmd</code>
    </div>
  );
}

function SettingsMaintenance({
  settings,
  health,
  currentSource,
  busy,
  onChooseSidecarRoot,
  mapDirectory,
  onChooseMapDirectory,
  onOpenBackendConsole,
  onRevealBackendLog
}: {
  settings: AppSettings;
  health?: HealthStatus;
  currentSource?: SourceRoot;
  busy?: string;
  onChooseSidecarRoot(): void;
  mapDirectory?: string;
  onChooseMapDirectory(): void;
  onOpenBackendConsole(): void;
  onRevealBackendLog(): void;
}): JSX.Element {
  return (
    <section className="settings-maintenance">
      <div className="maintenance-header">
        <div>
          <h1>Settings & Diagnostics</h1>
          <span>Maintenance / persistent storage, session behavior, desktop health</span>
        </div>
      </div>

      <div className="settings-grid">
        <section className="maintenance-panel">
          <div className="panel-title">
            <div>
              <h2>Backend Console</h2>
              <span>Persistent process and crash history</span>
            </div>
            <Terminal size={17} />
          </div>
          <p className="panel-copy">
            The local backend records IPC, map downloads, thumbnail work, and crashes. Its web page stays available if the frontend renderer fails, and its log survives a full restart.
          </p>
          <dl className="health-list">
            <dt>Port</dt>
            <dd>{health ? `127.0.0.1:${health.backendPort}` : 'Starting...'}</dd>
            <dt>Console</dt>
            <dd title={health?.backendUrl}>{health?.backendUrl ?? '-'}</dd>
            <dt>Log file</dt>
            <dd title={health?.backendLogPath}>{health ? compactPath(health.backendLogPath) : '-'}</dd>
          </dl>
          <div className="button-row wrap">
            <button
              className="primary"
              disabled={!health?.backendUrl}
              onClick={onOpenBackendConsole}
              title="Open the localhost backend web console with live and historical logs"
            >
              <Terminal size={16} /> Open Console
            </button>
            <button
              disabled={!health?.backendLogPath}
              onClick={onRevealBackendLog}
              title="Reveal the persistent NDJSON backend log in File Explorer"
            >
              <FolderOpen size={16} /> Reveal Log
            </button>
          </div>
        </section>

        <section className="maintenance-panel">
          <div className="panel-title">
            <div>
              <h2>Managed Maps</h2>
              <span>Watched offline PMTiles library</span>
            </div>
            <Map size={17} />
          </div>
          <p className="panel-copy">
            Vector PMTiles copied directly into this folder are validated and registered automatically.
          </p>
          <label>
            Current managed maps folder
            <input value={mapDirectory ?? ''} readOnly />
          </label>
          <div className="button-row">
            <button className="primary" disabled={Boolean(busy)} onClick={onChooseMapDirectory}>
              <FolderOpen size={16} /> Choose Maps Folder
            </button>
          </div>
        </section>

        <section className="maintenance-panel">
          <div className="panel-title">
            <div>
              <h2>Sidecar Library</h2>
              <span>Persistent mirrored XMP storage</span>
            </div>
            <Save size={17} />
          </div>
          <p className="panel-copy">
            Metadata edits are written here in a mirrored folder tree. Changing this folder never writes into your photo source.
          </p>
          <label title="The separate folder where this app writes editable XMP sidecars">
            Current sidecar mirror
            <input value={settings.sidecarRoot ?? ''} readOnly />
          </label>
          <div className="button-row">
            <button
              className="primary"
              disabled={Boolean(busy)}
              onClick={onChooseSidecarRoot}
              title="Choose a separate folder for mirrored XMP sidecars; it cannot be inside the current photo source"
            >
              <FolderOpen size={16} /> Choose Sidecar Folder
            </button>
          </div>
        </section>

        <section className="maintenance-panel">
          <div className="panel-title">
            <div>
              <h2>Photo Session</h2>
              <span>One current source, forgotten at close</span>
            </div>
            <Image size={17} />
          </div>
          <p className="panel-copy">
            Source paths and scanned assets are session-only. Choose or switch sources under Import; closing the app clears the source registry.
          </p>
          <dl className="health-list">
            <dt>Current source</dt>
            <dd title={currentSource?.path}>{currentSource?.name ?? 'None selected'}</dd>
            <dt>On switch</dt>
            <dd>Clear the old library view, then scan the new source.</dd>
            <dt>On close</dt>
            <dd>Forget source paths and cached photo records.</dd>
            <dt>Preserved</dt>
            <dd>Photos, sidecars, map packs, and app settings.</dd>
          </dl>
        </section>

        <section className="maintenance-panel">
          <div className="panel-title">
            <div>
              <h2>Desktop Health</h2>
              <span>Local services and secure bridge</span>
            </div>
            <CheckCircle2 size={17} />
          </div>
          <dl className="health-list">
            <dt>App version</dt>
            <dd>{health?.appVersion ?? 'Checking...'}</dd>
            <dt>User data</dt>
            <dd title={health?.userDataPath}>{health ? compactPath(health.userDataPath) : '-'}</dd>
            <dt>Bridge</dt>
            <dd>{health ? `${health.capabilities.length} IPC actions available` : 'Not connected'}</dd>
            <dt>Backend</dt>
            <dd>{health ? `Listening on port ${health.backendPort}` : 'Not running'}</dd>
            <dt>Tile server</dt>
            <dd>{health?.tileServerRunning ? health.tileServerUrl : 'Not running'}</dd>
            <dt>Source safety</dt>
            <dd>Original media folders are read-only to this app.</dd>
          </dl>
        </section>
      </div>
    </section>
  );
}

function StatusPill({ ok, label, title }: { ok: boolean; label: string; title: string }): JSX.Element {
  return (
    <span className={ok ? 'status-pill ok' : 'status-pill'} title={title}>
      <CheckCircle2 size={14} />
      {label}
    </span>
  );
}

function SetupItem({ ok, title, detail, help }: { ok: boolean; title: string; detail: string; help?: string }): JSX.Element {
  return (
    <div className={ok ? 'setup-item ok' : 'setup-item'} title={help ?? detail}>
      <CheckCircle2 size={17} />
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function fieldState(field: MetadataFieldKey, mixedFields: Set<MetadataFieldKey>, dirtyFields: DirtyMetadataFields): JSX.Element | null {
  if (dirtyFields.has(field)) return <small className="field-state changed">Changed</small>;
  if (mixedFields.has(field)) return <small className="field-state">Mixed</small>;
  return null;
}

function mixedPlaceholder(
  field: MetadataFieldKey,
  mixedFields: Set<MetadataFieldKey>,
  dirtyFields: DirtyMetadataFields
): string {
  return mixedFields.has(field) && !dirtyFields.has(field) ? 'Mixed values' : '';
}

function requireCoordinatePair(patch: ReturnType<typeof buildMetadataPatch>, form: MetadataFormState): void {
  const coordinateChanged = patch.latitude !== undefined || patch.longitude !== undefined;
  if (!coordinateChanged) return;
  const hasLatitude = form.latitude.trim().length > 0;
  const hasLongitude = form.longitude.trim().length > 0;
  if (hasLatitude !== hasLongitude) throw new Error('Latitude and longitude must be saved together.');
}

function workflowTitle(step: AppArea): string {
  return {
    import: 'Import',
    library: 'Library',
    edit: 'Metadata editor',
    export: 'Immich export',
    maps: 'Maps maintenance',
    settings: 'Settings and diagnostics'
  }[step];
}

function workflowHelp(step: WorkflowStep): string {
  return {
    import: 'Choose or replace the one photo source used for this session',
    library: 'Browse, filter, sort, select, rescan, or unregister photos from the current source',
    edit: 'Edit metadata for one or many selected photos and save mirrored XMP sidecars',
    export: 'Build an Immich-ready staging folder from selected or filtered photos'
  }[step];
}

function maintenanceHelp(step: MaintenanceStep): string {
  return {
    maps: 'Download, import, activate, and remove offline map packs',
    settings: 'Configure the sidecar library and inspect desktop health and session behavior'
  }[step];
}

function nextSortDirection(direction: SortDirection | undefined): SortDirection {
  return (direction ?? 'asc') === 'asc' ? 'desc' : 'asc';
}

function importSummary(imported: number, skipped: number, errors: number, unit: string): string {
  return `Imported ${imported} ${unit}${imported === 1 ? '' : 's'}${skipped ? `, skipped ${skipped}` : ''}${errors ? `, ${errors} error${errors === 1 ? '' : 's'}` : ''}.`;
}

function badgeLabel(status: PhotoAsset['sidecarStatus']): string {
  return {
    none: 'EXIF',
    adjacent: 'XMP',
    mirror: 'Mirror',
    conflict: 'Conflict'
  }[status];
}

function sourceLabel(source: PhotoAsset['effectiveSource']): string {
  return {
    embedded: 'Embedded file metadata',
    'adjacent-sidecar': 'Adjacent sidecar',
    'mirror-sidecar': 'Mirror sidecar',
    manual: 'Manual'
  }[source];
}

function compactPath(value: string): string {
  if (value.length <= 42) return value;
  return `${value.slice(0, 20)}...${value.slice(-19)}`;
}

function assetSummary(asset: PhotoAsset): string {
  const parts = [asset.extension.replace('.', '').toUpperCase()];
  if (asset.effective.rating !== undefined) parts.push(`${asset.effective.rating} star`);
  if (asset.effective.latitude !== undefined && asset.effective.longitude !== undefined) parts.push('GPS');
  return parts.join(' / ');
}

function locationLabel(asset: PhotoAsset): string {
  if (asset.effective.latitude === undefined || asset.effective.longitude === undefined) return '-';
  return `${asset.effective.latitude.toFixed(5)}, ${asset.effective.longitude.toFixed(5)}`;
}

function mapPackSummary(pack: MapPack): string {
  const parts = [pack.kind === 'pmtiles' ? 'PMTiles' : 'Places'];
  if (pack.metadata?.tileType) parts.push(pack.metadata.tileType.toUpperCase());
  if (pack.metadata?.minZoom !== undefined && pack.metadata?.maxZoom !== undefined) {
    parts.push(`z${pack.metadata.minZoom}-${pack.metadata.maxZoom}`);
  }
  if (pack.metadata?.bounds) {
    const [minLon, minLat, maxLon, maxLat] = pack.metadata.bounds;
    parts.push(`${minLat.toFixed(2)}, ${minLon.toFixed(2)} to ${maxLat.toFixed(2)}, ${maxLon.toFixed(2)}`);
  }
  if (pack.metadata?.placesCount !== undefined) parts.push(`${pack.metadata.placesCount} places`);
  return parts.join(' / ');
}

function dateTimeLocalValue(value: string): string {
  const trimmed = value.trim();
  const xmpMatch = trimmed.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/);
  if (xmpMatch) return `${xmpMatch[1]}-${xmpMatch[2]}-${xmpMatch[3]}T${xmpMatch[4]}:${xmpMatch[5]}`;
  const inputMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return inputMatch?.[1] ?? '';
}

function AssetThumbnail({
  asset,
  backendUrl
}: {
  asset: PhotoAsset;
  backendUrl?: string;
}): JSX.Element {
  const [failed, setFailed] = useState(false);
  const thumbnailUrl = backendUrl
    ? `${backendUrl}/thumbnails/${encodeURIComponent(asset.id)}?v=${Math.trunc(asset.mtimeMs)}-${asset.size}`
    : undefined;

  useEffect(() => {
    setFailed(false);
  }, [asset.id, asset.mtimeMs, asset.size, backendUrl]);

  if (thumbnailUrl && !failed) {
    return (
      <div className="thumb">
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
        <span className={`badge ${asset.sidecarStatus}`}>{badgeLabel(asset.sidecarStatus)}</span>
      </div>
    );
  }

  const Icon = rawExtensions.has(asset.extension) ? Camera : FileImage;
  return (
    <div className={`thumb file-thumb ${rawExtensions.has(asset.extension) ? 'raw' : 'standard'}`}>
      <Icon size={28} />
      <strong>{asset.extension.replace('.', '').toUpperCase() || 'IMG'}</strong>
      <span className={`badge ${asset.sidecarStatus}`}>{badgeLabel(asset.sidecarStatus)}</span>
    </div>
  );
}

function uniqueIds(values: string[]): string[] {
  return [...new Set(values)];
}

const rawExtensions = new Set(['.arw', '.cr2', '.cr3', '.dng', '.nef', '.orf', '.raf', '.raw', '.rw2']);
