import path from 'node:path';
import { createRequire } from 'node:module';
import { app } from 'electron';

const require = createRequire(import.meta.url);

export class RuntimePaths {
  readonly appRoot = app.getAppPath();
  readonly resources = process.resourcesPath;

  get sqlWasm(): string {
    const resolved = require.resolve('sql.js/dist/sql-wasm.wasm');
    return app.isPackaged ? resolved.replace('app.asar', 'app.asar.unpacked') : resolved;
  }

  get pmtilesExecutable(): string {
    return app.isPackaged
      ? path.join(this.resources, 'bin', 'pmtiles.exe')
      : path.join(this.appRoot, '.tools', 'pmtiles.exe');
  }

  projectFile(...segments: string[]): string {
    return path.join(this.appRoot, ...segments);
  }
}
