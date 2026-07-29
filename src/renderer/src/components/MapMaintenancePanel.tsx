import {
  Archive,
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  Map,
  Settings,
  Trash2
} from 'lucide-react';
import { estimateMapDownloadBytes, formatBytes, getMapDetail } from '../../../shared/mapCatalog';
import {
  AppSettings,
  MapDownloadPlan,
  MapDownloadPreferences,
  MapPack
} from '../../../shared/types';

interface MapMaintenancePanelProps {
  plan?: MapDownloadPlan;
  draft: MapDownloadPreferences;
  settings: AppSettings;
  busy?: string;
  onDraftChange(preferences: MapDownloadPreferences): void;
  onChooseOutputDirectory(): void;
  onSavePreferences(): void;
  onDownloadSelection(): void;
  onImportPack(): void;
  onOpenMapSetup(): void;
  onOpenDocs(): void;
  onSetActiveMapPack(id: string): void;
  onRemoveMapPack(id: string, deleteFile: boolean): void;
}

export function MapMaintenancePanel({
  plan,
  draft,
  settings,
  busy,
  onDraftChange,
  onChooseOutputDirectory,
  onSavePreferences,
  onDownloadSelection,
  onImportPack,
  onOpenMapSetup,
  onOpenDocs,
  onSetActiveMapPack,
  onRemoveMapPack
}: MapMaintenancePanelProps): JSX.Element {
  const detail = getMapDetail(draft.detailId);
  const estimateBytes = estimateMapDownloadBytes(draft.regionIds, draft.detailId);
  const budgetBytes = draft.budgetBytes;
  const overBudget = estimateBytes > budgetBytes;
  const outputDirectory = draft.outputDirectory || plan?.defaultOutputDirectory || '';
  const installedPacks = plan?.installedPacks ?? [];

  function toggleRegion(regionId: string): void {
    const regionIds = draft.regionIds.includes(regionId)
      ? draft.regionIds.filter((id) => id !== regionId)
      : [...draft.regionIds, regionId];
    onDraftChange({ ...draft, regionIds });
  }

  return (
    <section className="maps-maintenance">
      <div className="maintenance-header">
        <div>
          <h1>Maps</h1>
          <span>Maintenance / Maps / regions, detail, installed packs</span>
        </div>
        <div className="button-row wrap">
          <button onClick={onOpenMapSetup}>
            <Settings size={16} /> MapSetup.cmd
          </button>
          <button onClick={onImportPack}>
            <Map size={16} /> Import Pack
          </button>
          <button onClick={onOpenDocs}>
            <ExternalLink size={16} /> Get Maps
          </button>
        </div>
      </div>

      <div className="maintenance-grid">
        <section className="maintenance-panel region-panel">
          <div className="panel-title">
            <div>
              <h2>Region Selection</h2>
              <span>{draft.regionIds.length} selected</span>
            </div>
            <Map size={17} />
          </div>
          <div className="region-list">
            {(plan?.regions ?? []).map((region) => {
              const selected = draft.regionIds.includes(region.id);
              const estimated = detail ? region.estimateMbByMaxZoom[detail.maxZoom] ?? 0 : 0;
              return (
                <label key={region.id} className={selected ? 'region-item selected' : 'region-item'}>
                  <input type="checkbox" checked={selected} onChange={() => toggleRegion(region.id)} />
                  <span>
                    <strong>{region.label}</strong>
                    <small>{region.group} / {estimated ? `${estimated} MB est.` : 'estimate unknown'}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="maintenance-panel map-plan-panel">
          <div className="panel-title">
            <div>
              <h2>Depth & Budget</h2>
              <span>{detail ? `${detail.label}, z${detail.maxZoom}` : 'Choose detail'}</span>
            </div>
            <Download size={17} />
          </div>

          <div className="detail-options">
            {(plan?.details ?? []).map((option) => (
              <button
                key={option.id}
                className={draft.detailId === option.id ? 'active' : ''}
                onClick={() => onDraftChange({ ...draft, detailId: option.id })}
              >
                <strong>{option.label}</strong>
                <small>z{option.maxZoom}</small>
              </button>
            ))}
          </div>

          <label>
            Active map budget
            <div className="budget-row">
              <input
                type="number"
                min="0.5"
                max="25"
                step="0.5"
                value={(budgetBytes / 1024 / 1024 / 1024).toString()}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    budgetBytes: Math.max(Number(event.target.value) || 0.5, 0.5) * 1024 * 1024 * 1024
                  })
                }
              />
              <span>GB</span>
            </div>
          </label>

          <div className={overBudget ? 'budget-meter over' : 'budget-meter'}>
            <span style={{ width: `${Math.min((estimateBytes / budgetBytes) * 100, 100)}%` }} />
          </div>
          <div className="budget-summary">
            <strong>{formatBytes(estimateBytes)}</strong>
            <span>estimated of {formatBytes(budgetBytes)} budget</span>
          </div>
          {overBudget && <div className="soft-warning">Choose fewer regions, lower detail, or raise the budget before downloading.</div>}

          <label>
            Output folder
            <div className="path-picker">
              <input value={outputDirectory} readOnly />
              <button onClick={onChooseOutputDirectory}>
                <FolderOpen size={16} />
              </button>
            </div>
          </label>

          <label>
            Source PMTiles URL
            <input
              value={draft.sourceUrl ?? ''}
              placeholder="Blank uses latest Protomaps build"
              onChange={(event) => onDraftChange({ ...draft, sourceUrl: event.target.value || undefined })}
            />
          </label>

          <div className="button-row wrap">
            <button onClick={onSavePreferences}>
              <CheckCircle2 size={16} /> Save Setup
            </button>
            <button className="primary" disabled={Boolean(busy) || draft.regionIds.length === 0 || overBudget} onClick={onDownloadSelection}>
              <Download size={16} /> Download Selected
            </button>
          </div>
        </section>

        <section className="maintenance-panel installed-map-panel">
          <div className="panel-title">
            <div>
              <h2>Installed Packs</h2>
              <span>{installedPacks.length} ready for offline use</span>
            </div>
            <Archive size={17} />
          </div>
          <div className="installed-map-list">
            {installedPacks.length === 0 ? (
              <div className="empty-library compact">
                <Map size={26} />
                <strong>No installed map packs</strong>
                <span>Download a region or import an existing vector PMTiles file.</span>
              </div>
            ) : (
              installedPacks.map((pack) => (
                <div key={pack.id} className={settings.activeMapPackId === pack.id ? 'installed-map active' : 'installed-map'}>
                  <div>
                    <strong>{pack.name}</strong>
                    <span>{mapPackDetail(pack)}</span>
                    <small title={pack.path}>{pack.path}</small>
                  </div>
                  <div className="installed-map-actions">
                    <button disabled={settings.activeMapPackId === pack.id} onClick={() => onSetActiveMapPack(pack.id)}>
                      Use
                    </button>
                    <button onClick={() => onRemoveMapPack(pack.id, false)}>Unregister</button>
                    <button onClick={() => onRemoveMapPack(pack.id, true)} title="Delete app-managed map file">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="maintenance-panel jobs-panel">
          <div className="panel-title">
            <div>
              <h2>Download History</h2>
              <span>{plan?.jobs.length ?? 0} recent jobs</span>
            </div>
            <Download size={17} />
          </div>
          <div className="job-list">
            {(plan?.jobs ?? []).length === 0 ? (
              <div className="empty-library compact">
                <Download size={26} />
                <strong>No map downloads yet</strong>
                <span>Saved downloads will stay listed after restart.</span>
              </div>
            ) : (
              (plan?.jobs ?? []).map((job) => (
                <div key={job.id} className={`job-item ${job.status}`}>
                  <strong>{job.status}</strong>
                  <span>{job.regionIds.join(', ')} / z{job.maxZoom} / {formatBytes(job.estimatedBytes)}</span>
                  <small>{job.message ?? job.createdAt}</small>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function mapPackDetail(pack: MapPack): string {
  const parts: string[] = [];
  if (pack.metadata?.sizeBytes) parts.push(formatBytes(pack.metadata.sizeBytes));
  if (pack.metadata?.minZoom !== undefined && pack.metadata?.maxZoom !== undefined) {
    parts.push(`z${pack.metadata.minZoom}-${pack.metadata.maxZoom}`);
  }
  if (pack.metadata?.bounds) {
    const [minLon, minLat, maxLon, maxLat] = pack.metadata.bounds;
    parts.push(`${minLat.toFixed(1)}, ${minLon.toFixed(1)} to ${maxLat.toFixed(1)}, ${maxLon.toFixed(1)}`);
  }
  return parts.join(' / ') || 'PMTiles';
}
