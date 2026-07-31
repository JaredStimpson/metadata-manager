import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Circle, LoaderCircle, Terminal, Trash2 } from 'lucide-react';

export type ActivityStatus = 'running' | 'success' | 'error' | 'info';

export interface ActivityEntry {
  id: string;
  taskId: string;
  label: string;
  message: string;
  status: ActivityStatus;
  timestamp: number;
  completedAt?: number;
}

export interface RunningActivity {
  id: string;
  label: string;
  startedAt: number;
}

interface ActivityConsoleProps {
  entries: ActivityEntry[];
  running: RunningActivity[];
  collapsed: boolean;
  onToggle(): void;
  onClear(): void;
}

export function ActivityConsole({
  entries,
  running,
  collapsed,
  onToggle,
  onClear
}: ActivityConsoleProps): JSX.Element {
  const [now, setNow] = useState(Date.now());
  const outputRef = useRef<HTMLDivElement | null>(null);
  const active = running[running.length - 1];

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active?.id]);

  useEffect(() => {
    if (collapsed || !outputRef.current) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [collapsed, entries]);

  return (
    <section className={collapsed ? 'activity-console collapsed' : 'activity-console'} aria-label="Activity console">
      <header>
        <div className="activity-title">
          <Terminal size={16} />
          <strong>Activity</strong>
          <span>
            {active
              ? `${active.label} / ${formatElapsed(now - active.startedAt)} elapsed`
              : `${entries.length} session event${entries.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="activity-actions">
          <button
            disabled={entries.every((entry) => entry.status === 'running')}
            onClick={onClear}
            title="Clear completed activity messages from this session"
            aria-label="Clear completed activity"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={onToggle}
            title={collapsed ? 'Open the activity console' : 'Collapse the activity console'}
            aria-label={collapsed ? 'Open activity console' : 'Collapse activity console'}
          >
            {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="activity-output" ref={outputRef}>
          {entries.length === 0 ? (
            <div className="activity-empty">Ready. File operations and long-running work will appear here.</div>
          ) : (
            entries.map((entry) => {
              const Icon = statusIcon(entry.status);
              const elapsed =
                entry.status === 'running'
                  ? formatElapsed(now - entry.timestamp)
                  : entry.completedAt
                    ? formatElapsed(entry.completedAt - entry.timestamp)
                    : undefined;
              return (
                <div key={entry.id} className={`activity-line ${entry.status}`}>
                  <time>{formatTime(entry.timestamp)}</time>
                  <Icon className={entry.status === 'running' ? 'spin' : ''} size={13} />
                  <strong>{entry.label}</strong>
                  <span>{entry.message}</span>
                  {elapsed && <small>{elapsed}</small>}
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

function statusIcon(status: ActivityStatus): typeof Circle {
  if (status === 'running') return LoaderCircle;
  if (status === 'success') return CheckCircle2;
  if (status === 'error') return AlertCircle;
  return Circle;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder.toString().padStart(2, '0')}s` : `${remainder}s`;
}
