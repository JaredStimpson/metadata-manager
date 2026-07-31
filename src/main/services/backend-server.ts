import fsSync from 'node:fs';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { BackendLogger } from './backend-logger';

const DEFAULT_BACKEND_PORT = 43821;

export interface ThumbnailResponse {
  path: string;
  contentType: string;
}

export class BackendServer {
  private server?: http.Server;
  private port?: number;
  private readonly eventStreams = new Set<ServerResponse>();
  private thumbnailResolver?: (assetId: string) => Promise<ThumbnailResponse | undefined>;
  private startedAt = new Date().toISOString();

  constructor(private readonly logger: BackendLogger) {}

  setThumbnailResolver(resolver: (assetId: string) => Promise<ThumbnailResponse | undefined>): void {
    this.thumbnailResolver = resolver;
  }

  async start(preferredPort = preferredBackendPort()): Promise<string> {
    if (this.server && this.port) return this.url;
    this.startedAt = new Date().toISOString();

    try {
      await this.listen(preferredPort);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || preferredPort === 0) throw error;
      this.logger.warn('backend', `Port ${preferredPort} is already in use; selecting an available localhost port.`);
      await this.listen(0);
    }

    this.logger.info('backend', `Backend console listening at ${this.url}.`, {
      details: { port: this.port, logPath: this.logger.logPath }
    });
    return this.url;
  }

  get url(): string {
    if (!this.port) throw new Error('Backend server has not started.');
    return `http://127.0.0.1:${this.port}`;
  }

  get activePort(): number {
    if (!this.port) throw new Error('Backend server has not started.');
    return this.port;
  }

  async stop(): Promise<void> {
    for (const response of this.eventStreams) response.end();
    this.eventStreams.clear();
    const server = this.server;
    this.server = undefined;
    this.port = undefined;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async listen(port: number): Promise<void> {
    const server = http.createServer((request, response) => {
      void this.handleRequest(request, response).catch((error) => {
        this.logger.error('backend-http', 'Backend request failed.', {
          details: { message: error instanceof Error ? error.message : String(error) }
        });
        if (!response.headersSent) this.writeText(response, 500, 'Backend request failed.');
        else response.end();
      });
    });
    server.requestTimeout = 30_000;
    server.headersTimeout = 35_000;

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    });

    this.server = server;
    this.port = (server.address() as AddressInfo).port;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', this.url);
    this.setSecurityHeaders(response);

    if (request.method !== 'GET') {
      this.writeText(response, 405, 'Method not allowed.');
      return;
    }

    if (url.pathname === '/') {
      this.writeHtml(response, backendConsoleHtml(this.activePort, this.logger.logPath));
      return;
    }

    if (url.pathname === '/api/health') {
      this.writeJson(response, {
        ok: true,
        port: this.activePort,
        url: this.url,
        startedAt: this.startedAt,
        logPath: this.logger.logPath,
        entriesInMemory: this.logger.getEntries(2000).length
      });
      return;
    }

    if (url.pathname === '/api/logs') {
      const limit = Number(url.searchParams.get('limit') ?? 500);
      this.writeJson(response, this.logger.getEntries(limit));
      return;
    }

    if (url.pathname === '/api/events') {
      this.openEventStream(response);
      return;
    }

    if (url.pathname === '/api/logs/download') {
      if (!fsSync.existsSync(this.logger.logPath)) {
        this.writeText(response, 404, 'No persistent log file exists yet.');
        return;
      }
      response.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': `attachment; filename="${path.basename(this.logger.logPath)}"`,
        'Cache-Control': 'no-store'
      });
      fsSync.createReadStream(this.logger.logPath).pipe(response);
      return;
    }

    const thumbnailMatch = url.pathname.match(/^\/thumbnails\/([a-zA-Z0-9-]+)$/);
    if (thumbnailMatch) {
      await this.serveThumbnail(thumbnailMatch[1], response);
      return;
    }

    this.writeText(response, 404, 'Not found.');
  }

  private openEventStream(response: ServerResponse): void {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    response.write(': connected\n\n');
    this.eventStreams.add(response);
    const unsubscribe = this.logger.subscribe((entry) => {
      response.write(`data: ${JSON.stringify(entry)}\n\n`);
    });
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15_000);
    response.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      this.eventStreams.delete(response);
    });
  }

  private async serveThumbnail(assetId: string, response: ServerResponse): Promise<void> {
    const thumbnail = await this.thumbnailResolver?.(assetId);
    if (!thumbnail || !fsSync.existsSync(thumbnail.path)) {
      this.writeText(response, 404, 'Thumbnail unavailable.');
      return;
    }
    const stat = fsSync.statSync(thumbnail.path);
    response.writeHead(200, {
      'Content-Type': thumbnail.contentType,
      'Content-Length': stat.size,
      'Cache-Control': 'private, max-age=31536000, immutable'
    });
    fsSync.createReadStream(thumbnail.path).pipe(response);
  }

  private setSecurityHeaders(response: ServerResponse): void {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'none';"
    );
  }

  private writeHtml(response: ServerResponse, content: string): void {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(content);
  }

  private writeJson(response: ServerResponse, content: unknown): void {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(content));
  }

  private writeText(response: ServerResponse, status: number, content: string): void {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(content);
  }
}

function preferredBackendPort(): number {
  const configured = Number(process.env.PHOTO_METADATA_BACKEND_PORT);
  if (Number.isInteger(configured) && configured >= 1024 && configured <= 65535) return configured;
  return DEFAULT_BACKEND_PORT;
}

function backendConsoleHtml(port: number, logPath: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Meta Backend :${port}</title>
  <style>
    :root { color-scheme: dark; font-family: "Cascadia Mono", "IBM Plex Mono", Consolas, monospace; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #07100d; color: #b8f7cf; }
    header { min-height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 18px; border-bottom: 1px solid #275542; padding: 10px 16px; background: #0c1814; }
    h1 { margin: 0; color: #d8ffe7; font-size: 15px; letter-spacing: 0; }
    header p { margin: 4px 0 0; color: #6da989; font-size: 11px; }
    .actions { display: flex; align-items: center; gap: 8px; }
    button, a { min-height: 32px; border: 1px solid #36745a; border-radius: 3px; background: #11241c; color: #a9edc3; padding: 7px 10px; font: inherit; font-size: 11px; text-decoration: none; cursor: pointer; }
    button:hover, a:hover { border-color: #7de0a5; color: #e3ffee; }
    #state { color: #f0bf69; font-size: 11px; }
    #log { height: calc(100vh - 64px); overflow: auto; padding: 8px 14px 18px; }
    .line { display: grid; grid-template-columns: 184px 56px 120px minmax(180px, 1fr); gap: 9px; min-height: 24px; align-items: start; border-bottom: 1px solid #12271e; padding: 4px 0; font-size: 11px; line-height: 1.4; }
    time { color: #547f69; }
    .level { color: #72bde6; text-transform: uppercase; }
    .scope { color: #e5b86a; }
    .message { color: #b8f7cf; white-space: pre-wrap; overflow-wrap: anywhere; }
    .error .level, .error .message { color: #ff7fa8; }
    .warn .level, .warn .message { color: #f0bf69; }
    .debug { opacity: .68; }
    .details { grid-column: 4; color: #6da989; white-space: pre-wrap; }
    @media (max-width: 760px) { .line { grid-template-columns: 90px 48px 80px minmax(120px, 1fr); } header { align-items: flex-start; flex-direction: column; } #log { height: calc(100vh - 112px); } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>PHOTO META BACKEND // PORT ${port}</h1>
      <p>Persistent NDJSON: ${escapeHtml(logPath)}</p>
    </div>
    <div class="actions">
      <span id="state">CONNECTING</span>
      <button id="clear" type="button">CLEAR VIEW</button>
      <a href="/api/logs/download">DOWNLOAD LOG</a>
    </div>
  </header>
  <main id="log" aria-live="polite"></main>
  <script>
    const output = document.getElementById('log');
    const state = document.getElementById('state');
    let follow = true;
    output.addEventListener('scroll', () => {
      follow = output.scrollHeight - output.scrollTop - output.clientHeight < 48;
    });
    document.getElementById('clear').addEventListener('click', () => output.replaceChildren());
    function add(entry) {
      const row = document.createElement('div');
      row.className = 'line ' + entry.level;
      const time = document.createElement('time');
      time.textContent = entry.timestamp;
      const level = document.createElement('span');
      level.className = 'level';
      level.textContent = entry.level;
      const scope = document.createElement('span');
      scope.className = 'scope';
      scope.textContent = entry.scope;
      const message = document.createElement('span');
      message.className = 'message';
      message.textContent = entry.message;
      row.append(time, level, scope, message);
      if (entry.details || entry.progress) {
        const details = document.createElement('span');
        details.className = 'details';
        details.textContent = JSON.stringify({ progress: entry.progress, details: entry.details });
        row.append(details);
      }
      output.append(row);
      if (follow) output.scrollTop = output.scrollHeight;
    }
    fetch('/api/logs?limit=1000').then((response) => response.json()).then((entries) => entries.forEach(add));
    const events = new EventSource('/api/events');
    events.onopen = () => { state.textContent = 'LIVE'; };
    events.onerror = () => { state.textContent = 'RECONNECTING'; };
    events.onmessage = (event) => add(JSON.parse(event.data));
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
