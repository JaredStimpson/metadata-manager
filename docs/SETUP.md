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

On first launch, Photo Meta offers default folders under `Documents\Photo Metadata Manager` for mirrored sidecars and managed maps. Use **Use Defaults** for the simplest setup, or choose either folder. The app creates and write-tests both folders together and rejects overlapping locations.

After launch, Maintenance -> Settings shows the local backend port and persistent log path. The default backend URL is `http://127.0.0.1:43821`; if that port is occupied, the app chooses an available localhost port and displays it there.

## Windows Packages

```powershell
.\Build.cmd
```

`Build.cmd` verifies the app, fetches pinned PMTiles CLI `v1.31.2`, verifies the release SHA-256 digest, and builds:

- `release\Photo-Meta-Setup-<version>-x64.exe`
- `release\Photo-Meta-Portable-<version>-x64.exe`

The assisted installer allows choosing the installation directory and creates Start menu/Desktop shortcuts plus an uninstaller. Packages are currently unsigned, so SmartScreen may ask for confirmation.

For a developer bundle only, run `Bundle.cmd`. That writes `out/` and does not package an EXE.

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
.\Bundle.cmd     # build developer bundles into out\
.\Build.cmd      # verify and build installer plus portable EXEs
```

`Setup.cmd` and `Launch.cmd` remain as aliases for `Install.cmd` and `Run.cmd`.
