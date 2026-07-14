import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
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

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    void refreshAssets(query);
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
    setBusy(true);
    try {
      const state: InitialState = await window.photoMeta.getInitialState();
      setSettings(state.settings);
      setSourceRoots(state.sourceRoots);
      setMapPacks(state.mapPacks);
      setTileServerUrl(state.tileServerUrl);
      await refreshAssets(defaultQuery);
    } finally {
      setBusy(false);
    }
  }

  async function refreshAssets(nextQuery = query): Promise<void> {
    const nextAssets = await window.photoMeta.listAssets(nextQuery);
    setAssets(nextAssets);
    setSelectedIds((current) => current.filter((id) => nextAssets.some((asset) => asset.id === id)));
  }

  async function chooseSources(): Promise<void> {
    const paths = await window.photoMeta.choosePhotoFolders();
    if (paths.length === 0) return;
    setBusy(true);
    try {
      const roots = await window.photoMeta.addSourceRoots(paths);
      const state = await window.photoMeta.getInitialState();
      setSourceRoots(state.sourceRoots);
      setNotice(`Added ${roots.length} source folder${roots.length === 1 ? '' : 's'}`);
    } finally {
      setBusy(false);
    }
  }

  async function chooseSidecarRoot(): Promise<void> {
    const path = await window.photoMeta.chooseDirectory('Choose Sidecar Mirror Folder');
    if (!path) return;
    const next = await window.photoMeta.updateSettings({ sidecarRoot: path });
    setSettings(next);
    setNotice('Sidecar mirror folder set');
  }

  async function scan(root: SourceRoot): Promise<void> {
    setBusy(true);
    try {
      const result = await window.photoMeta.scanSourceRoot(root.id);
      const state = await window.photoMeta.getInitialState();
      setSourceRoots(state.sourceRoots);
      await refreshAssets(query);
      setNotice(`Scanned ${result.scanned} photos, ${result.errors.length} errors`);
    } finally {
      setBusy(false);
    }
  }

  async function importMapPack(): Promise<void> {
    const path = await window.photoMeta.chooseMapPack();
    if (!path) return;
    const pack = await window.photoMeta.importMapPack(path);
    const state = await window.photoMeta.getInitialState();
    setSettings(state.settings);
    setMapPacks(state.mapPacks);
    setNotice(`Imported ${pack.name}`);
  }

  async function setActiveMapPack(id: string): Promise<void> {
    const next = await window.photoMeta.updateSettings({ activeMapPackId: id || undefined });
    setSettings(next);
  }

  async function saveForm(extraPatch: MetadataPatch = {}): Promise<void> {
    if (selectedIds.length === 0) return;
    const single = selectedAssets.length === 1;
    const patch: MetadataPatch = { ...extraPatch };
    if (single || form.description.trim()) patch.description = form.description.trim() || null;
    if (single || form.rating.trim()) patch.rating = form.rating.trim() === '' ? null : Number(form.rating);
    if (single || form.dateTimeOriginal.trim()) patch.dateTimeOriginal = form.dateTimeOriginal.trim() || null;
    if (single || form.latitude.trim()) patch.latitude = form.latitude.trim() === '' ? null : Number(form.latitude);
    if (single || form.longitude.trim()) patch.longitude = form.longitude.trim() === '' ? null : Number(form.longitude);
    if (single || form.tags.trim()) {
      patch.tags = form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    }

    setBusy(true);
    try {
      const result = await window.photoMeta.saveMetadata(selectedIds, patch);
      await refreshAssets(query);
      setNotice(`Saved ${result.sidecarsWritten} sidecar${result.sidecarsWritten === 1 ? '' : 's'}`);
    } finally {
      setBusy(false);
    }
  }

  async function applyLocation(latitude: number, longitude: number): Promise<void> {
    setForm((current) => ({ ...current, latitude: latitude.toFixed(7), longitude: longitude.toFixed(7) }));
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      await window.photoMeta.saveMetadata(selectedIds, { latitude, longitude });
      await refreshAssets(query);
      setNotice(`Applied location to ${selectedIds.length} photo${selectedIds.length === 1 ? '' : 's'}`);
    } finally {
      setBusy(false);
    }
  }

  async function revert(): Promise<void> {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      await window.photoMeta.revertSidecars(selectedIds);
      await refreshAssets(query);
      setNotice(`Reverted ${selectedIds.length} mirror sidecar${selectedIds.length === 1 ? '' : 's'}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportImmich(all: boolean): Promise<void> {
    const destination = await window.photoMeta.chooseDirectory('Choose Immich Staging Folder');
    if (!destination) return;
    setBusy(true);
    try {
      const result = await window.photoMeta.exportImmich(all ? 'all' : selectedIds, destination);
      setNotice(
        `Exported ${result.exportedAssets} assets, ${result.sidecarsWritten} sidecars, ${result.errors.length} errors`
      );
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
          <h2>Folders</h2>
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
