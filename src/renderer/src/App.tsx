import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Image,
  LocateFixed,
  Map,
  MapPinned,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Tags
} from 'lucide-react';
import { MapPanel } from './components/MapPanel';
import {
  AppSettings,
  AssetQuery,
  InitialState,
  MapPack,
  MetadataPatch,
  PhotoAsset,
  SourceRoot
} from '../../shared/types';

const defaultQuery: AssetQuery = { filter: 'all', limit: 500 };

export function App(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>({});
  const [sourceRoots, setSourceRoots] = useState<SourceRoot[]>([]);
  const [mapPacks, setMapPacks] = useState<MapPack[]>([]);
  const [tileServerUrl, setTileServerUrl] = useState<string>();
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState<AssetQuery>(defaultQuery);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Ready');
  const [form, setForm] = useState({
    description: '',
    rating: '',
    dateTimeOriginal: '',
    latitude: '',
    longitude: '',
    tags: ''
  });

  const selectedAssets = useMemo(() => assets.filter((asset) => selectedIds.includes(asset.id)), [assets, selectedIds]);
  const selectedAsset = selectedAssets[0];
  const activeMapPack = useMemo(
    () => mapPacks.find((pack) => pack.id === settings.activeMapPackId),
    [mapPacks, settings.activeMapPackId]
  );

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    void runTask('Refresh photos', () => refreshAssets(query));
  }, [query.sourceRootId, query.filter, query.text]);

  useEffect(() => {
    if (!selectedAsset || selectedAssets.length !== 1) {
      setForm({ description: '', rating: '', dateTimeOriginal: '', latitude: '', longitude: '', tags: '' });
      return;
    }
    setForm({
      description: selectedAsset.effective.description ?? '',
      rating: selectedAsset.effective.rating?.toString() ?? '',
      dateTimeOriginal: selectedAsset.effective.dateTimeOriginal ?? '',
      latitude: selectedAsset.effective.latitude?.toString() ?? '',
      longitude: selectedAsset.effective.longitude?.toString() ?? '',
      tags: selectedAsset.effective.tags.join(', ')
    });
  }, [selectedAsset?.id, selectedAssets.length]);

  async function loadInitial(): Promise<void> {
    await runTask('Startup', async () => {
      const state: InitialState = await window.photoMeta.getInitialState();
      setSettings(state.settings);
      setSourceRoots(state.sourceRoots);
      setMapPacks(state.mapPacks);
      setTileServerUrl(state.tileServerUrl);
      await refreshAssets(defaultQuery);
    });
  }

  async function refreshAssets(nextQuery = query): Promise<void> {
    const nextAssets = await window.photoMeta.listAssets(nextQuery);
    setAssets(nextAssets);
    setSelectedIds((current) => current.filter((id) => nextAssets.some((asset) => asset.id === id)));
  }

  async function chooseSources(): Promise<void> {
    const paths = await window.photoMeta.choosePhotoFolders();
    if (paths.length === 0) return;
    await runTask('Add sources', async () => {
      const roots = await window.photoMeta.addSourceRoots(paths);
      const state = await window.photoMeta.getInitialState();
      setSourceRoots(state.sourceRoots);
      setNotice(`Added ${roots.length} source folder${roots.length === 1 ? '' : 's'}`);
    });
  }

  async function chooseSidecarRoot(): Promise<void> {
    const path = await window.photoMeta.chooseDirectory('Choose Sidecar Mirror Folder');
    if (!path) return;
    await runTask('Set sidecar mirror', async () => {
      const next = await window.photoMeta.updateSettings({ sidecarRoot: path });
      setSettings(next);
      setNotice('Sidecar mirror folder set');
    });
  }

  async function scan(root: SourceRoot): Promise<void> {
    await runTask('Scan folder', async () => {
      const result = await window.photoMeta.scanSourceRoot(root.id);
      const state = await window.photoMeta.getInitialState();
      setSourceRoots(state.sourceRoots);
      await refreshAssets(query);
      setNotice(`Scanned ${result.scanned} photos, ${result.errors.length} errors`);
    });
  }

  async function scanAll(): Promise<void> {
    if (sourceRoots.length === 0) return;
    await runTask('Scan folders', async () => {
      let scanned = 0;
      let errors = 0;
      for (const root of sourceRoots) {
        const result = await window.photoMeta.scanSourceRoot(root.id);
        scanned += result.scanned;
        errors += result.errors.length;
      }
      const state = await window.photoMeta.getInitialState();
      setSourceRoots(state.sourceRoots);
      await refreshAssets(query);
      setNotice(`Scanned ${scanned} photos, ${errors} errors`);
    });
  }

  async function importMapPack(): Promise<void> {
    const path = await window.photoMeta.chooseMapPack();
    if (!path) return;
    await runTask('Import map pack', async () => {
      const pack = await window.photoMeta.importMapPack(path);
      const state = await window.photoMeta.getInitialState();
      setSettings(state.settings);
      setMapPacks(state.mapPacks);
      setNotice(`Imported ${pack.name}${pack.metadata?.maxZoom !== undefined ? `, z${pack.metadata.minZoom}-${pack.metadata.maxZoom}` : ''}`);
    });
  }

  async function setActiveMapPack(id: string): Promise<void> {
    await runTask('Set active map', async () => {
      const next = await window.photoMeta.updateSettings({ activeMapPackId: id || undefined });
      setSettings(next);
    });
  }

  async function openMapGuide(): Promise<void> {
    await runTask('Open map guide', () => window.photoMeta.openExternal('https://docs.protomaps.com/basemaps/downloads'));
  }

  async function saveForm(extraPatch: MetadataPatch = {}): Promise<void> {
    if (selectedIds.length === 0) return;
    const single = selectedAssets.length === 1;
    const patch: MetadataPatch = { ...extraPatch };
    try {
      if (single || form.description.trim()) patch.description = form.description.trim() || null;
      if (single || form.rating.trim()) patch.rating = parseNumberInput(form.rating, 0, 5, 'Rating', single);
      if (single || form.dateTimeOriginal.trim()) patch.dateTimeOriginal = form.dateTimeOriginal.trim() || null;
      if (single || form.latitude.trim()) patch.latitude = parseNumberInput(form.latitude, -90, 90, 'Latitude', single);
      if (single || form.longitude.trim()) patch.longitude = parseNumberInput(form.longitude, -180, 180, 'Longitude', single);
    } catch (error) {
      setNotice(errorMessage(error));
      return;
    }
    if (single || form.tags.trim()) {
      patch.tags = form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    }

    await runTask('Save metadata', async () => {
      const result = await window.photoMeta.saveMetadata(selectedIds, patch);
      await refreshAssets(query);
      setNotice(`Saved ${result.sidecarsWritten} sidecar${result.sidecarsWritten === 1 ? '' : 's'}`);
    });
  }

  async function applyLocation(latitude: number, longitude: number): Promise<void> {
    setForm((current) => ({ ...current, latitude: latitude.toFixed(7), longitude: longitude.toFixed(7) }));
    if (selectedIds.length === 0) return;
    await runTask('Apply location', async () => {
      await window.photoMeta.saveMetadata(selectedIds, { latitude, longitude });
      await refreshAssets(query);
      setNotice(`Applied location to ${selectedIds.length} photo${selectedIds.length === 1 ? '' : 's'}`);
    });
  }

  async function revert(): Promise<void> {
    if (selectedIds.length === 0) return;
    await runTask('Revert sidecars', async () => {
      await window.photoMeta.revertSidecars(selectedIds);
      await refreshAssets(query);
      setNotice(`Reverted ${selectedIds.length} mirror sidecar${selectedIds.length === 1 ? '' : 's'}`);
    });
  }

  async function exportImmich(all: boolean): Promise<void> {
    const destination = await window.photoMeta.chooseDirectory('Choose Immich Staging Folder');
    if (!destination) return;
    await runTask('Export for Immich', async () => {
      const result = await window.photoMeta.exportImmich(all ? 'all' : selectedIds, destination);
      setNotice(
        `Exported ${result.exportedAssets} assets, ${result.sidecarsWritten} sidecars, ${result.errors.length} errors`
      );
    });
  }

  async function runTask(label: string, task: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      setNotice(`${label} failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function toggleSelection(asset: PhotoAsset, additive: boolean): void {
    setSelectedIds((current) => {
      if (!additive) return [asset.id];
      return current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id];
    });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <MapPinned size={22} />
          <div>
            <strong>Offline Photo Metadata Manager</strong>
            <span>{notice}</span>
          </div>
        </div>
        <div className="top-actions">
          <button onClick={chooseSources}>
            <FolderOpen size={17} /> Sources
          </button>
          <button onClick={chooseSidecarRoot}>
            <Settings size={17} /> Sidecars
          </button>
          <button onClick={importMapPack}>
            <Map size={17} /> Map Pack
          </button>
          <button onClick={openMapGuide}>
            <ExternalLink size={17} /> Get Maps
          </button>
          <button disabled={selectedIds.length === 0} onClick={() => exportImmich(false)}>
            <Archive size={17} /> Export Selected
          </button>
          <button disabled={assets.length === 0} onClick={() => exportImmich(true)}>
            <Archive size={17} /> Export All
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <section className="panel setup-panel">
          <h2>Setup</h2>
          <div className="status-line">
            <CheckCircle2 className={sourceRoots.length ? 'ok' : 'muted'} size={17} />
            <span>{sourceRoots.length ? `${sourceRoots.length} source folder${sourceRoots.length === 1 ? '' : 's'}` : 'No sources'}</span>
          </div>
          <div className="status-line">
            <CheckCircle2 className={settings.sidecarRoot ? 'ok' : 'muted'} size={17} />
            <span>{settings.sidecarRoot ? compactPath(settings.sidecarRoot) : 'No sidecar mirror'}</span>
          </div>
          <div className="status-line">
            <CheckCircle2 className={mapPacks.some((pack) => pack.kind === 'pmtiles') ? 'ok' : 'muted'} size={17} />
            <span>{mapPacks.some((pack) => pack.kind === 'pmtiles') ? 'Offline map ready' : 'No offline map'}</span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Folders</h2>
            <button disabled={sourceRoots.length === 0} onClick={scanAll}>
              <RefreshCw size={15} /> Scan All
            </button>
          </div>
          <div className="source-list">
            {sourceRoots.map((root) => (
              <button
                key={root.id}
                className={query.sourceRootId === root.id ? 'source active' : 'source'}
                onClick={() => setQuery((current) => ({ ...current, sourceRootId: current.sourceRootId === root.id ? undefined : root.id }))}
              >
                <span>{root.name}</span>
                <small>{root.lastScanAt ? new Date(root.lastScanAt).toLocaleString() : 'Not scanned'}</small>
                <RefreshCw
                  size={16}
                  onClick={(event) => {
                    event.stopPropagation();
                    void scan(root);
                  }}
                />
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Filters</h2>
          <label className="searchbox">
            <Search size={16} />
            <input
              value={query.text ?? ''}
              placeholder="Search"
              onChange={(event) => setQuery((current) => ({ ...current, text: event.target.value }))}
            />
          </label>
          <div className="segmented">
            {(['all', 'missing-location', 'edited', 'conflicts'] as const).map((filter) => (
              <button
                key={filter}
                className={query.filter === filter ? 'active' : ''}
                onClick={() => setQuery((current) => ({ ...current, filter }))}
              >
                {filterLabel(filter)}
              </button>
            ))}
          </div>
        </section>
      </aside>

      <main className="workspace">
        <section className="grid-panel">
          <div className="section-header">
            <div>
              <h1>{assets.length} Photos</h1>
              <span>{selectedIds.length} selected</span>
            </div>
            {busy && <span className="busy">Working</span>}
          </div>
          <div className="photo-grid">
            {assets.map((asset) => (
              <button
                key={asset.id}
                className={selectedIds.includes(asset.id) ? 'asset-tile selected' : 'asset-tile'}
                onClick={(event) => toggleSelection(asset, event.ctrlKey || event.metaKey || event.shiftKey)}
              >
                <div className="thumb">
                  {canPreview(asset.extension) ? <img src={fileUrl(asset.absolutePath)} alt="" /> : <Image size={30} />}
                  <span className={`badge ${asset.sidecarStatus}`}>{badgeLabel(asset.sidecarStatus)}</span>
                </div>
                <span title={asset.relativePath}>{asset.filename}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="inspector">
          <section className="panel editor-panel">
            <div className="section-header compact">
              <h2>Metadata</h2>
              <span>{selectedIds.length || 'None'}</span>
            </div>
            <label>
              Description
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
            <div className="two-col">
              <label>
                Rating
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={form.rating}
                  onChange={(event) => setForm({ ...form, rating: event.target.value })}
                />
              </label>
              <label>
                Date
                <input
                  value={form.dateTimeOriginal}
                  placeholder="YYYY:MM:DD HH:mm:ss"
                  onChange={(event) => setForm({ ...form, dateTimeOriginal: event.target.value })}
                />
              </label>
            </div>
            <div className="two-col">
              <label>
                Latitude
                <input value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} />
              </label>
              <label>
                Longitude
                <input value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} />
              </label>
            </div>
            <label>
              Tags
              <div className="input-with-icon">
                <Tags size={16} />
                <input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
              </div>
            </label>
            <div className="button-row">
              <button disabled={selectedIds.length === 0 || !settings.sidecarRoot} onClick={() => saveForm()}>
                <Save size={16} /> Save Sidecar
              </button>
              <button disabled={selectedIds.length === 0} onClick={revert}>
                <RotateCcw size={16} /> Revert
              </button>
            </div>
            {selectedAsset && (
              <dl className="meta-list">
                <dt>Source</dt>
                <dd>{selectedAsset.effectiveSource}</dd>
                <dt>Sidecar</dt>
                <dd>{selectedAsset.mirrorSidecarPath ? compactPath(selectedAsset.mirrorSidecarPath) : badgeLabel(selectedAsset.sidecarStatus)}</dd>
                <dt>Original</dt>
                <dd>{compactPath(selectedAsset.absolutePath)}</dd>
              </dl>
            )}
          </section>

          <section className="panel map-shell">
            <div className="section-header compact">
              <h2>Geotag</h2>
              <LocateFixed size={17} />
            </div>
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
            {activeMapPack && <div className="map-pack-summary">{mapPackSummary(activeMapPack)}</div>}
            <div className="button-row">
              <button onClick={importMapPack}>
                <Map size={16} /> Import
              </button>
              <button onClick={openMapGuide}>
                <ExternalLink size={16} /> Get Maps
              </button>
            </div>
            <MapPanel
              activeMapPackId={settings.activeMapPackId}
              mapPacks={mapPacks}
              tileServerUrl={tileServerUrl}
              selectedAsset={selectedAsset}
              onApplyLocation={applyLocation}
            />
          </section>
        </aside>
      </main>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unexpected error';
}

function parseNumberInput(value: string, min: number, max: number, label: string, clearWhenBlank: boolean): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return clearWhenBlank ? null : undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function filterLabel(filter: NonNullable<AssetQuery['filter']>): string {
  return {
    all: 'All',
    'missing-location': 'No GPS',
    edited: 'Edited',
    conflicts: 'Conflicts'
  }[filter];
}

function badgeLabel(status: PhotoAsset['sidecarStatus']): string {
  return {
    none: 'EXIF',
    adjacent: 'XMP',
    mirror: 'Mirror',
    conflict: 'Both'
  }[status];
}

function compactPath(value: string): string {
  if (value.length <= 34) return value;
  return `${value.slice(0, 16)}...${value.slice(-15)}`;
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

function canPreview(extension: string): boolean {
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif'].includes(extension);
}

function fileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.replace(/^\/+/, '').split('/');
  const encoded = parts
    .map((part, index) => (index === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)))
    .join('/');
  return `file:///${encoded}`;
}
