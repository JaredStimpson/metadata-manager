import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BackendLogEntry, BackendLogLevel, BackendProgress } from '../../shared/types';

const MAX_MEMORY_ENTRIES = 2000;

export class BackendLogger {
  readonly logPath: string;
  private entries: BackendLogEntry[] = [];
  private readonly listeners = new Set<(entry: BackendLogEntry) => void>();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.logPath = path.join(userDataPath, 'logs', 'backend.ndjson');
  }

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.logPath), { recursive: true });
    try {
      const content = await fs.readFile(this.logPath, 'utf8');
      this.entries = content
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-MAX_MEMORY_ENTRIES)
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as BackendLogEntry];
          } catch {
            return [];
          }
        });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  debug(scope: string, message: string, options?: LogOptions): BackendLogEntry {
    return this.log('debug', scope, message, options);
  }

  info(scope: string, message: string, options?: LogOptions): BackendLogEntry {
    return this.log('info', scope, message, options);
  }

  warn(scope: string, message: string, options?: LogOptions): BackendLogEntry {
    return this.log('warn', scope, message, options);
  }

  error(scope: string, message: string, options?: LogOptions): BackendLogEntry {
    return this.log('error', scope, message, options);
  }

  crash(scope: string, error: unknown, details?: Record<string, unknown>): BackendLogEntry {
    const entry = createEntry('error', scope, errorMessage(error), {
      details: {
        ...details,
        stack: error instanceof Error ? error.stack : undefined
      }
    });
    this.record(entry);
    try {
      fsSync.mkdirSync(path.dirname(this.logPath), { recursive: true });
      fsSync.appendFileSync(this.logPath, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch {
      // Crash logging must never hide the original failure.
    }
    return entry;
  }

  getEntries(limit = 500): BackendLogEntry[] {
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 1, 1), MAX_MEMORY_ENTRIES);
    return this.entries.slice(-safeLimit);
  }

  subscribe(listener: (entry: BackendLogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  private log(level: BackendLogLevel, scope: string, message: string, options?: LogOptions): BackendLogEntry {
    const entry = createEntry(level, scope, message, options);
    this.record(entry);
    this.writeQueue = this.writeQueue
      .then(() => fs.appendFile(this.logPath, `${JSON.stringify(entry)}\n`, 'utf8'))
      .catch((error) => {
        console.error('Backend log write failed:', error);
      });
    return entry;
  }

  private record(entry: BackendLogEntry): void {
    this.entries = [...this.entries, entry].slice(-MAX_MEMORY_ENTRIES);
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // A diagnostic listener cannot be allowed to interrupt backend work.
      }
    }
  }
}

interface LogOptions {
  operationId?: string;
  details?: Record<string, unknown>;
  progress?: BackendProgress;
}

function createEntry(
  level: BackendLogLevel,
  scope: string,
  message: string,
  options?: LogOptions
): BackendLogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    operationId: options?.operationId,
    details: compactDetails(options?.details),
    progress: options?.progress
  };
}

function compactDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) return undefined;
  return Object.fromEntries(
    Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .slice(0, 20)
      .map(([key, value]) => [key, compactValue(value)])
  );
}

function compactValue(value: unknown): unknown {
  if (typeof value === 'string') return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map(compactValue);
  if (value && typeof value === 'object') {
    return compactDetails(value as Record<string, unknown>);
  }
  return value;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown backend error';
}
