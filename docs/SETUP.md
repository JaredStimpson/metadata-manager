# Setup

This app is Windows-first and runs as an Electron desktop app.

## One-command setup

```powershell
.\Setup.cmd
```

`Setup.cmd` runs `scripts/setup.ps1`, which:

- Finds Node.js.
- Finds pnpm or uses the bundled Codex pnpm when available.
- Installs dependencies.
- Rebuilds Electron and esbuild native binaries.
- Runs TypeScript and unit tests unless `-SkipVerify` is passed.

## Launch

```powershell
.\Launch.cmd
```

This starts the Electron development app with hot reload.

## Build

```powershell
.\Build.cmd
```

Build output is written to `out/`.

## Verify

```powershell
.\Verify.cmd
```

This runs:

- `tsc --noEmit`
- `vitest run --root .`
- `electron-vite build`

## Runtime Selection

The scripts choose tools in this order:

1. `PHOTO_METADATA_NODE` or `PHOTO_METADATA_NODE_HOME`, if set.
2. Codex bundled Node runtime, if this project is running inside Codex.
3. `node` from `PATH`.

pnpm is chosen in this order:

1. `PHOTO_METADATA_PNPM_CJS`, if set.
2. Codex bundled `pnpm.cjs`, if available.
3. `pnpm` from `PATH`.
4. `corepack pnpm`.

## Clean Reinstall

Delete `node_modules` and run:

```powershell
.\Setup.cmd
```

The generated app bundles in `out/` can also be deleted safely.

