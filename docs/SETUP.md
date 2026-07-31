# Setup

This app is Windows-first and runs as an Electron desktop app.

## One-command setup

```powershell
.\Install.cmd
```

`Install.cmd` runs `scripts/setup.ps1`, which:

- Finds Node.js.
- Finds pnpm or uses the bundled Codex pnpm when available.
- Installs dependencies.
- Rebuilds Electron and esbuild native binaries.
- Runs TypeScript and unit tests unless `-SkipVerify` is passed.

If any `.cmd` wrapper fails, it prints the exit code and waits for a key press before closing. This keeps setup and launch errors visible when the script is double-clicked.

## Launch

```powershell
.\Run.cmd
```

This starts the Electron development app with hot reload.

After launch, Maintenance -> Settings shows the local backend port and persistent log path. The default backend URL is `http://127.0.0.1:43821`; if that port is occupied, the app chooses an available localhost port and displays it there.

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

## Command Reference

```powershell
.\Install.cmd    # install dependencies and run core checks
.\Run.cmd        # start the desktop app
.\MapSetup.cmd   # create an offline PMTiles map file
.\Doctor.cmd     # check common local setup problems
.\Verify.cmd     # typecheck, test, and build
.\Build.cmd      # build production bundles only
```

`Setup.cmd` and `Launch.cmd` remain as aliases for `Install.cmd` and `Run.cmd`.
