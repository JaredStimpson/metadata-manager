import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BackendLogger } from '../src/main/services/backend-logger';
import { BackendServer } from '../src/main/services/backend-server';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe('diagnostic backend server', () => {
  it('serves the browser console, health, and persistent logs on localhost', async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-meta-backend-'));
    temporaryDirectories.push(userDataPath);
    const logger = new BackendLogger(userDataPath);
    await logger.init();
    logger.info('test', 'Backend test entry.', {
      progress: { current: 1, total: 2, percent: 50, phase: 'Testing' }
    });

    const server = new BackendServer(logger);
    await server.start(0);

    try {
      const health = await fetch(`${server.url}/api/health`).then((response) => response.json());
      expect(health).toMatchObject({
        ok: true,
        port: server.activePort,
        url: server.url
      });

      const entries = await fetch(`${server.url}/api/logs`).then((response) => response.json());
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ scope: 'test', message: 'Backend test entry.' })
        ])
      );

      const consoleHtml = await fetch(server.url).then((response) => response.text());
      expect(consoleHtml).toContain('PHOTO META BACKEND');
      expect(consoleHtml).toContain('EventSource');
    } finally {
      await server.stop();
      await logger.flush();
    }

    const persistentLog = await fs.readFile(logger.logPath, 'utf8');
    expect(persistentLog).toContain('Backend test entry.');
  });
});
