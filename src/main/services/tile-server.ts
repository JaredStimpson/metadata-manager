import fs from 'node:fs';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { DatabaseService } from '../db/database';

export class TileServer {
  private server?: http.Server;
  private baseUrl?: string;

  constructor(private readonly db: DatabaseService) {}

  async start(): Promise<string> {
    if (this.baseUrl) return this.baseUrl;

    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    await new Promise<void>((resolve) => {
      this.server?.listen(0, '127.0.0.1', resolve);
    });

    const address = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${address.port}`;
    return this.baseUrl;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => (error ? reject(error) : resolve()));
    });
    this.server = undefined;
    this.baseUrl = undefined;
  }

  private async handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Headers', 'Range');
      response.setHeader('Accept-Ranges', 'bytes');

      if (request.method === 'OPTIONS') {
        response.writeHead(204);
        response.end();
        return;
      }

      const match = url.pathname.match(/^\/pmtiles\/([^/]+)$/);
      if (!match) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      const mapPack = this.db.getMapPack(decodeURIComponent(match[1]));
      if (!mapPack || mapPack.kind !== 'pmtiles') {
        response.writeHead(404);
        response.end('Map pack not found');
        return;
      }

      const stat = await fs.promises.stat(mapPack.path);
      const range = request.headers.range;
      if (!range) {
        response.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size
        });
        if (request.method === 'HEAD') {
          response.end();
          return;
        }
        fs.createReadStream(mapPack.path).pipe(response);
        return;
      }

      const parsed = parseRange(range, stat.size);
      if (!parsed) {
        response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        response.end();
        return;
      }

      response.writeHead(206, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': parsed.end - parsed.start + 1,
        'Content-Range': `bytes ${parsed.start}-${parsed.end}/${stat.size}`
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      fs.createReadStream(mapPack.path, parsed).pipe(response);
    } catch (error) {
      response.writeHead(500);
      response.end(String((error as Error).message ?? error));
    }
  }
}

function parseRange(range: string, size: number): { start: number; end: number } | undefined {
  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return undefined;

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2]);
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || end >= size) return undefined;
  return { start, end };
}

