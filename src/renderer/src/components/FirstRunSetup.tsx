import { useState } from 'react';
import { CheckCircle2, FolderOpen, MapPinned, Save } from 'lucide-react';
import { FirstRunDefaults, FirstRunSetup as FirstRunSetupValue } from '../../../shared/types';

interface FirstRunSetupProps {
  defaults: FirstRunDefaults;
  busy?: string;
  onChooseFolder(title: string): Promise<string | undefined>;
  onComplete(setup: FirstRunSetupValue): Promise<void>;
}

export function FirstRunSetup({ defaults, busy, onChooseFolder, onComplete }: FirstRunSetupProps): JSX.Element {
  const [sidecarRoot, setSidecarRoot] = useState(defaults.sidecarRoot);
  const [mapDirectory, setMapDirectory] = useState(defaults.mapDirectory);

  async function choose(kind: 'sidecars' | 'maps'): Promise<void> {
    const selected = await onChooseFolder(kind === 'sidecars' ? 'Choose Sidecar Mirror Folder' : 'Choose Managed Maps Folder');
    if (!selected) return;
    if (kind === 'sidecars') setSidecarRoot(selected);
    else setMapDirectory(selected);
  }

  return (
    <main className="first-run-shell">
      <section className="first-run-panel">
        <header>
          <MapPinned size={36} />
          <div>
            <h1>Set up Photo Meta</h1>
            <p>Choose the two writable libraries. Photo folders remain separate, session-only, and unchanged.</p>
          </div>
        </header>

        <div className="first-run-folders">
          <label>
            <span><Save size={17} /> Sidecar mirror</span>
            <div className="path-picker">
              <input value={sidecarRoot} onChange={(event) => setSidecarRoot(event.target.value)} />
              <button onClick={() => choose('sidecars')} title="Choose the mirrored XMP sidecar folder"><FolderOpen size={17} /></button>
            </div>
          </label>
          <label>
            <span><MapPinned size={17} /> Managed maps</span>
            <div className="path-picker">
              <input value={mapDirectory} onChange={(event) => setMapDirectory(event.target.value)} />
              <button onClick={() => choose('maps')} title="Choose the folder watched for PMTiles archives"><FolderOpen size={17} /></button>
            </div>
          </label>
        </div>

        <div className="first-run-actions">
          <button
            className="primary"
            disabled={Boolean(busy)}
            onClick={() => onComplete(defaults)}
          >
            <CheckCircle2 size={17} /> {busy ?? 'Use Defaults'}
          </button>
          <button
            disabled={Boolean(busy) || !sidecarRoot.trim() || !mapDirectory.trim()}
            onClick={() => onComplete({ sidecarRoot: sidecarRoot.trim(), mapDirectory: mapDirectory.trim() })}
          >
            Use Chosen Folders
          </button>
        </div>
      </section>
    </main>
  );
}
