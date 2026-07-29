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
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Tags,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { MapPanel } from './components/MapPanel';
import { MapMaintenancePanel } from './components/MapMaintenancePanel';
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
  HealthStatus,
  InitialState,
  LocalPlace,
  MapDownloadPlan,
  MapDownloadPreferences,
  MapPack,
  PhotoAsset,
  SourceRoot,
  SortDirection
} from '../../shared/types';

type WorkflowStep = 'import' | 'library' | 'edit' | 'export';
type AppArea = WorkflowStep | 'maps';
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

const maintenanceSteps: Array<{ id: AppArea; label: string; icon: typeof Upload }> = [
  { id: 'maps', label: 'Maps', icon: Map }
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
  const [toolsOpen, setToolsOpen] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState('Starting desktop bridge...');
  const [form, setForm] = useState<MetadataFormState>(emptyMetadataForm);
  const [dirtyFields, setDirtyFields] = useState<DirtyMetadataFields>(() => new Set());
  const [mixedFields, setMixedFields] = useState<Set<MetadataFieldKey>>(() => new Set());
  const [tagDraft, setTagDraft] = useState('');

  const selectedAssets = useMemo(() => assets.filter((asset) => selectedIds.includes(asset.id)), [assets, selectedIds]);
  const selectedAsset = selectedAssets[0];
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
    if (!initialized) return;
    void runTask('Refresh library', () => refreshAssets(query));
  }, [initialized, query]);

  useEffect(() => {
    const next = formFromSelection(selectedAssets);
    setForm(next.form);
    setMixedFields(next.mixed);
    setDirtyFields(new Set());
    setTagDraft('');
  }, [selectedAssets]);

  async function loadInitial(): Promise<void> {
    await runTask('Startup health check', async () => {
      const nextHealth = await apiClient.healthCheck();
      const state = await apiClient.getInitialState();
      const nextPlan = await apiClient.getMapDownloadPlan();
      applyInitialState(state);
      applyMapPlan(nextPlan);
      setHealth(nextHealth);
      await refreshAssets(defaultQuery);
      setInitialized(true);
      setNotice('Desktop bridge connected. Source folders stay unchanged.');
    });
  }

  function applyInitialState(state: InitialState): void {
    setSettings(state.settings);
    setSourceRoots(state.sourceRoots);
    setMapPacks(state.mapPacks);
    setTileServerUrl(state.tileServerUrl);
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
    const paths = await runTask('Choose photo files', () => apiClient.choosePhotoFiles());
    if (!paths?.length) return;

    await runTask('Import files', async () => {
      const result = await apiClient.addImportedFiles(paths);
      await reloadInitialState();
      await refreshAssets(query);
      setSelectedIds(result.assets.map((asset) => asset.id));
      setActiveStep('library');
      setNotice(importSummary(result.imported, result.skipped, result.errors.length, 'file'));
    });
  }

  async function importFolders(): Promise<void> {
    const paths = await runTask('Choose photo folders', () => apiClient.choosePhotoFolders());
    if (!paths?.length) return;

    await runTask('Import folders', async () => {
      const roots = await apiClient.addSourceRoots(paths);
      let scanned = 0;
      let errors = 0;
      for (const root of roots) {
        const result = await apiClient.scanSourceRoot(root.id);
        scanned += result.scanned;
        errors += result.errors.length;
      }
      await reloadInitialState();
      await refreshAssets(query);
      setActiveStep('library');
      setNotice(`Registered ${roots.length} folder${roots.length === 1 ? '' : 's'} and scanned ${scanned} photo${scanned === 1 ? '' : 's'}${errors ? ` with ${errors} error${errors === 1 ? '' : 's'}` : ''}.`);
    });
  }

  async function chooseSidecarRoot(): Promise<void> {
    const path = await runTask('Choose sidecar mirror', () => apiClient.chooseDirectory('Choose Sidecar Mirror Folder'));
    if (!path) return;

    await runTask('Set sidecar mirror', async () => {
      const next = await apiClient.updateSettings({ sidecarRoot: path });
      setSettings(next);
      await reloadInitialState();
      await refreshAssets(query);
      setNotice('Sidecar mirror folder is ready. Source photos remain unchanged.');
    });
  }

  async function scan(root: SourceRoot): Promise<void> {
    await runTask(`Scan ${root.name}`, async () => {
      const result = await apiClient.scanSourceRoot(root.id);
      await reloadInitialState();
      await refreshAssets(query);
      setNotice(`Scanned ${result.scanned} photo${result.scanned === 1 ? '' : 's'} from ${root.name}; ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}.`);
    });
  }

  async function scanAll(): Promise<void> {
    if (sourceRoots.length === 0) {
      setNotice('Add a folder before scanning.');
      return;
    }

    await runTask('Scan folders', async () => {
      let scanned = 0;
      let errors = 0;
      for (const root of sourceRoots) {
        const result = await apiClient.scanSourceRoot(root.id);
        scanned += result.scanned;
        errors += result.errors.length;
      }
      await reloadInitialState();
      await refreshAssets(query);
      setNotice(`Scanned ${scanned} photo${scanned === 1 ? '' : 's'} across ${sourceRoots.length} folder${sourceRoots.length === 1 ? '' : 's'}; ${errors} error${errors === 1 ? '' : 's'}.`);
    });
  }

  async function importMapPack(): Promise<void> {
    const path = await runTask('Choose map pack', () => apiClient.chooseMapPack());
    if (!path) return;

    await runTask('Import map pack', async () => {
      const pack = await apiClient.importMapPack(path);
      await reloadInitialState();
      setNotice(`Imported ${pack.name}${pack.metadata?.maxZoom !== undefined ? `, zoom ${pack.metadata.minZoom}-${pack.metadata.maxZoom}` : ''}.`);
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

  async function saveMapPreferences(): Promise<void> {
    await runTask('Save map setup', async () => {
      const plan = await apiClient.saveMapDownloadPreferences(mapDraft);
      applyMapPlan(plan);
      setNotice('Map setup saved. Installed packs remain available offline.');
    });
  }

  async function downloadMapSelection(): Promise<void> {
    await runTask('Download offline maps', async () => {
      const result = await apiClient.downloadMapSelection(mapDraft);
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

    await runTask('Save sidecar metadata', async () => {
      const patch = buildMetadataPatch(form, dirtyFields);
      requireCoordinatePair(patch, form);
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

    await runTask('Export for Immich', async () => {
      const result = await apiClient.exportImmich(all ? 'all' : selectedIds, destination);
      setNotice(
        `Exported ${result.exportedAssets} asset${result.exportedAssets === 1 ? '' : 's'}, wrote ${result.sidecarsWritten} XMP sidecar${result.sidecarsWritten === 1 ? '' : 's'}, ${result.hardlinked} hardlink${result.hardlinked === 1 ? '' : 's'}, ${result.copied} copied, ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}.`
      );
    });
  }

  async function revealSelected(): Promise<void> {
    if (!selectedAsset) return;
    await runTask('Reveal photo', () => apiClient.revealPath(selectedAsset.absolutePath));
  }

  async function searchPlaces(placeQuery: string): Promise<LocalPlace[]> {
    try {
      return await apiClient.searchPlaces(placeQuery);
    } catch (error) {
      setNotice(formatError(error));
      return [];
    }
  }

  async function runTask<T>(label: string, task: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    try {
      return await task();
    } catch (error) {
      setNotice(`${label}: ${formatError(error)}`);
      return undefined;
    } finally {
      setBusy(undefined);
    }
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

  return (
    <div className={`workflow-shell ${toolsOpen ? 'tools-open' : 'tools-closed'}`}>
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
                onClick={() => setActiveStep(step.id)}
                title={step.label}
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
                  setToolsOpen(false);
                }}
                title={step.label}
              >
                <Icon size={20} />
                <span>{step.label}</span>
              </button>
            );
          })}
        </nav>
        <button className={toolsOpen ? 'rail-tool active' : 'rail-tool'} onClick={() => setToolsOpen(!toolsOpen)} title="Tools">
          <Settings size={20} />
          <span>Tools</span>
        </button>
      </aside>

      <main className={activeStep === 'maps' ? 'maintenance-stage' : 'library-stage'}>
        <header className={busy ? 'status-banner working' : 'status-banner'}>
          <div>
            <strong>
              {busy && <RefreshCw className="spin" size={15} />}
              {busy ?? workflowTitle(activeStep)}
            </strong>
            <span>{notice}</span>
          </div>
          <div className="health-pills">
            <StatusPill ok={Boolean(health)} label={health ? `Bridge ${health.appVersion}` : 'Bridge'} />
            <StatusPill ok label="Source unchanged" />
            <StatusPill ok={Boolean(settings.sidecarRoot)} label="Sidecar mirror" />
            <StatusPill ok={Boolean(tileServerUrl)} label="Tile server" />
          </div>
        </header>

        {activeStep === 'maps' ? (
          <MapMaintenancePanel
            plan={mapPlan}
            draft={mapDraft}
            settings={settings}
            busy={busy}
            onDraftChange={setMapDraft}
            onChooseOutputDirectory={chooseMapOutputDirectory}
            onSavePreferences={saveMapPreferences}
            onDownloadSelection={downloadMapSelection}
            onImportPack={importMapPack}
            onOpenMapSetup={openMapSetup}
            onOpenDocs={openMapGuide}
            onSetActiveMapPack={setActiveMapPack}
            onRemoveMapPack={removeMapPack}
          />
        ) : (
          <>
        <section className="quick-actions">
          <button className="primary" disabled={Boolean(busy)} onClick={importFiles}>
            <Upload size={17} /> Add Photos
          </button>
          <button disabled={Boolean(busy)} onClick={importFolders}>
            <FolderOpen size={17} /> Choose New Source
          </button>
          <button disabled={Boolean(busy) || sourceRoots.length === 0} onClick={scanAll}>
            <RefreshCw size={17} /> Scan
          </button>
          <button disabled={Boolean(busy)} onClick={chooseSidecarRoot}>
            <Settings size={17} /> Sidecar Mirror
          </button>
          <button onClick={() => setActiveStep('maps')}>
            <Map size={17} /> Maps
          </button>
        </section>

        {activeStep === 'import' && (
          <section className="workflow-card">
            <div>
              <h1>Import photos in place</h1>
              <p>Files are registered and scanned from their current folders. Originals are not copied or edited.</p>
            </div>
            <div className="setup-grid">
              <SetupItem
                ok={sourceRoots.length > 0}
                title={`${sourceRoots.length} source${sourceRoots.length === 1 ? '' : 's'}`}
                detail={sourceRoots.length ? sourceRoots.map((root) => root.name).join(', ') : 'Import files or folders to begin.'}
              />
              <SetupItem
                ok={Boolean(settings.sidecarRoot)}
                title="Sidecar mirror"
                detail={settings.sidecarRoot ? compactPath(settings.sidecarRoot) : 'Choose where editable XMP sidecars live.'}
              />
              <SetupItem
                ok={mapPacks.some((pack) => pack.kind === 'pmtiles')}
                title="Offline maps"
                detail={activeMapPack ? activeMapPack.name : 'Manual coordinates work without a map pack.'}
              />
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
              <button disabled={selectedIds.length === 0} onClick={() => exportImmich(false)}>
                <Archive size={17} /> Export Selected
              </button>
              <button disabled={assets.length === 0} onClick={() => exportImmich(true)}>
                <Archive size={17} /> Export All Filtered
              </button>
            </div>
          </section>
        )}

        <section className="browser-panel" tabIndex={0} onKeyDown={handleBrowserKeyDown}>
          <div className="browser-header">
            <div>
              <h1>{assets.length} Photos</h1>
              <span>{selectedIds.length} selected</span>
            </div>
            <div className="view-toggle" aria-label="View">
              <button className={browserView === 'thumbnail' ? 'active' : ''} onClick={() => setBrowserView('thumbnail')} title="Thumbnail view">
                <Grid2X2 size={17} />
              </button>
              <button className={browserView === 'detail' ? 'active' : ''} onClick={() => setBrowserView('detail')} title="Detail view">
                <List size={17} />
              </button>
            </div>
          </div>

          <div className="library-toolbar">
            <label className="searchbox">
              <Search size={16} />
              <input
                value={query.text ?? ''}
                placeholder="Search filename, path, tags"
                onChange={(event) => updateQuery({ text: event.target.value || undefined })}
              />
            </label>
            <select value={query.sourceRootId ?? ''} onChange={(event) => updateQuery({ sourceRootId: event.target.value || undefined })}>
              <option value="">All sources</option>
              {sourceRoots.map((root) => (
                <option key={root.id} value={root.id}>
                  {root.name}
                </option>
              ))}
            </select>
            <select value={query.filter ?? 'all'} onChange={(event) => updateQuery({ filter: event.target.value as AssetQuery['filter'] })}>
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={query.sortBy ?? 'filename'}
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
            >
              <SlidersHorizontal size={16} /> {(query.sortDirection ?? 'asc').toUpperCase()}
            </button>
          </div>

          <div className="filter-row">
            <select value={query.rating ?? ''} onChange={(event) => updateQuery({ rating: event.target.value ? Number(event.target.value) : undefined })}>
              <option value="">Any rating</option>
              {[0, 1, 2, 3, 4, 5].map((rating) => (
                <option key={rating} value={rating}>
                  {rating} star{rating === 1 ? '' : 's'}
                </option>
              ))}
            </select>
            <select value={query.extension ?? ''} onChange={(event) => updateQuery({ extension: event.target.value || undefined })}>
              <option value="">Any type</option>
              {availableExtensions.map((extension) => (
                <option key={extension} value={extension}>
                  {extension}
                </option>
              ))}
            </select>
            <select value={query.tag ?? ''} onChange={(event) => updateQuery({ tag: event.target.value || undefined })}>
              <option value="">Any tag</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            <button disabled={assets.length === 0} onClick={() => selectAllFiltered()}>
              <Layers size={16} /> {allFilteredSelected ? 'Clear Selection' : 'Select All Filtered'}
            </button>
            <button disabled={selectedIds.length === 0 || Boolean(busy)} onClick={removeSelectedFromLibrary}>
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
                  <AssetThumbnail asset={asset} />
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
          </>
        )}
      </main>

      {activeStep !== 'maps' && (
      <aside className="metadata-inspector">
        <section className="inspector-section">
          <div className="panel-title">
            <div>
              <h2>{selectedIds.length > 1 ? 'Batch Metadata' : 'Metadata'}</h2>
              <span>{selectedIds.length ? `${selectedIds.length} selected` : 'Select photos to edit'}</span>
            </div>
            <button disabled={!selectedAsset} onClick={revealSelected} title="Reveal selected photo">
              <FolderOpen size={16} />
            </button>
          </div>

          <label>
            <span>Description {fieldState('description', mixedFields, dirtyFields)}</span>
            <textarea
              value={form.description}
              disabled={selectedIds.length === 0}
              placeholder={mixedPlaceholder('description', mixedFields, dirtyFields)}
              onChange={(event) => updateForm('description', event.target.value, 'description')}
            />
          </label>

          <label>
            <span>Rating {fieldState('rating', mixedFields, dirtyFields)}</span>
            <div className="rating-control">
              <button className={form.rating === '' ? 'active' : ''} disabled={selectedIds.length === 0} onClick={() => setRating('')}>
                Clear
              </button>
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  className={form.rating === String(rating) ? 'active' : ''}
                  disabled={selectedIds.length === 0}
                  onClick={() => setRating(String(rating))}
                >
                  {rating}
                </button>
              ))}
            </div>
          </label>

          <div className="date-fields">
            <label>
              <span>Date/time picker {fieldState('dateTimeOriginal', mixedFields, dirtyFields)}</span>
              <input
                type="datetime-local"
                value={dateTimeLocalValue(form.dateTimeOriginal)}
                disabled={selectedIds.length === 0}
                onChange={(event) => updateForm('dateTimeOriginal', event.target.value, 'dateTimeOriginal')}
              />
            </label>
            <label>
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
              <label>
                <span>Latitude {fieldState('latitude', mixedFields, dirtyFields)}</span>
                <input
                  value={form.latitude}
                  disabled={selectedIds.length === 0}
                  placeholder={mixedPlaceholder('latitude', mixedFields, dirtyFields)}
                  onChange={(event) => updateForm('latitude', event.target.value, 'latitude')}
                />
              </label>
              <label>
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
                onChange={(event) => updateForm('coordinatePaste', event.target.value)}
              />
              <button disabled={selectedIds.length === 0 || !form.coordinatePaste.trim()} onClick={pasteCoordinates}>
                <LocateFixed size={16} /> Use
              </button>
            </div>
          </div>

          <label>
            <span>Tags {fieldState('tags', mixedFields, dirtyFields)}</span>
            <div className="tag-editor">
              <div className="tag-chips">
                {form.tags.length === 0 ? (
                  <span className="empty-tags">{mixedPlaceholder('tags', mixedFields, dirtyFields) || 'No tags'}</span>
                ) : (
                  form.tags.map((tag) => (
                    <button key={tag} disabled={selectedIds.length === 0} onClick={() => removeTag(tag)}>
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
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                />
                <button disabled={selectedIds.length === 0 || !tagDraft.trim()} onClick={addTag}>
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
            <button disabled={!selectedCanSave || !settings.sidecarRoot} onClick={saveMetadata}>
              <Save size={16} /> Save Sidecar
            </button>
            <button disabled={selectedIds.length === 0 || !selectedHasDirtySidecars} onClick={revert}>
              <RotateCcw size={16} /> Revert
            </button>
          </div>

          {!settings.sidecarRoot && (
            <div className="soft-warning">
              <Info size={16} />
              <span>Choose a sidecar mirror before saving edits.</span>
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

      {activeStep !== 'maps' && toolsOpen && (
        <aside className="tools-drawer">
          <section className="inspector-section">
            <div className="panel-title">
              <div>
                <h2>Geotag Map</h2>
                <span>{activeMapPack ? activeMapPack.name : 'Manual coordinates available'}</span>
              </div>
              <button onClick={() => setToolsOpen(false)} title="Close tools">
                <X size={16} />
              </button>
            </div>

            {!activeMapPack && (
              <div className="no-map-panel">
                <Map size={24} />
                <strong>No offline map selected</strong>
                <span>Manual coordinates still work. Use Maps maintenance to install or change packs.</span>
              </div>
            )}

            <div className="button-row wrap">
              <button onClick={() => setActiveStep('maps')}>
                <Map size={16} /> Manage Maps
              </button>
            </div>

            <label>
              Active map pack
              <select value={settings.activeMapPackId ?? ''} onChange={(event) => setActiveMapPack(event.target.value)}>
                <option value="">No map pack</option>
                {mapPacks
                  .filter((pack) => pack.kind === 'pmtiles')
                  .map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name}
                    </option>
                  ))}
              </select>
            </label>

            {activeMapPack && <div className="map-pack-summary">{mapPackSummary(activeMapPack)}</div>}

            <div className="map-status-grid">
              <SetupItem ok={Boolean(tileServerUrl)} title="Tile server" detail={tileServerUrl ?? 'Not running'} />
              <SetupItem ok={placePacks.length > 0} title="Place search" detail={placePacks.length ? `${placePacks.length} place pack${placePacks.length === 1 ? '' : 's'}` : 'Optional SQLite pack not installed.'} />
            </div>

            <MapPanel
              activeMapPackId={settings.activeMapPackId}
              mapPacks={mapPacks}
              tileServerUrl={tileServerUrl}
              selectedAsset={selectedAsset}
              onSearchPlaces={searchPlaces}
              onApplyLocation={applyLocation}
            />
          </section>

          <section className="inspector-section">
            <div className="panel-title">
              <div>
                <h2>Sidecar & Export</h2>
                <span>{settings.sidecarRoot ? compactPath(settings.sidecarRoot) : 'Mirror not chosen'}</span>
              </div>
              <Archive size={17} />
            </div>
            <div className="button-row wrap">
              <button onClick={chooseSidecarRoot}>
                <Settings size={16} /> Sidecar Mirror
              </button>
              <button disabled={selectedIds.length === 0} onClick={() => exportImmich(false)}>
                <Archive size={16} /> Export Selected
              </button>
              <button disabled={assets.length === 0} onClick={() => exportImmich(true)}>
                <Archive size={16} /> Export All
              </button>
            </div>
            <dl className="health-list">
              <dt>User data</dt>
              <dd>{health ? compactPath(health.userDataPath) : '-'}</dd>
              <dt>Capabilities</dt>
              <dd>{health ? `${health.capabilities.length} IPC actions` : '-'}</dd>
              <dt>Source safety</dt>
              <dd>Original media folders are read-only to this app.</dd>
            </dl>
          </section>
        </aside>
      )}
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

function StatusPill({ ok, label }: { ok: boolean; label: string }): JSX.Element {
  return (
    <span className={ok ? 'status-pill ok' : 'status-pill'}>
      <CheckCircle2 size={14} />
      {label}
    </span>
  );
}

function SetupItem({ ok, title, detail }: { ok: boolean; title: string; detail: string }): JSX.Element {
  return (
    <div className={ok ? 'setup-item ok' : 'setup-item'}>
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
    maps: 'Maps maintenance'
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

function AssetThumbnail({ asset }: { asset: PhotoAsset }): JSX.Element {
  const [failed, setFailed] = useState(false);
  if (canPreview(asset.extension) && !failed) {
    return (
      <div className="thumb">
        <img src={fileUrl(asset.absolutePath)} alt="" onError={() => setFailed(true)} />
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

function canPreview(extension: string): boolean {
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif'].includes(extension);
}

const rawExtensions = new Set(['.arw', '.cr2', '.cr3', '.dng', '.nef', '.orf', '.raf', '.raw', '.rw2']);

function fileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.replace(/^\/+/, '').split('/');
  const encoded = parts
    .map((part, index) => (index === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)))
    .join('/');
  return `file:///${encoded}`;
}
