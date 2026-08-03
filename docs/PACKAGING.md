# Windows Packaging

## Build Both Artifacts

Run `Build.cmd`. It pauses on failure and performs the complete release path:

1. Resolve the project Node/pnpm toolchain.
2. Run TypeScript, Vitest, and `electron-vite build`.
3. Fetch pinned PMTiles CLI `v1.31.2` from the official GitHub release.
4. Require and verify GitHub's published SHA-256 digest before extracting `pmtiles.exe`.
5. Build x64 assisted NSIS and portable targets with electron-builder.

Outputs:

```text
release/Photo-Meta-Setup-<version>-x64.exe
release/Photo-Meta-Portable-<version>-x64.exe
```

## Runtime Layout

- SQL.js WASM is ASAR-unpacked.
- ExifTool's Windows executable tree is ASAR-unpacked.
- PMTiles CLI is copied to `resources/bin/pmtiles.exe`.
- Map downloads spawn the bundled executable directly.

Installed and portable users do not need Node, pnpm, PowerShell, or a PMTiles command on `PATH`.

## Installer Behavior

The NSIS installer is assisted rather than one-click, supports an installation-folder choice, creates Desktop and Start menu shortcuts, and registers an uninstaller. The portable target writes settings and libraries to the user-selected/default locations just like the installed app.

## Signing

Initial artifacts are unsigned. Windows SmartScreen can display an unrecognized-app warning. Confirm the executable came from this project, use **More info**, and choose **Run anyway**. Production distribution should add a Windows code-signing certificate through electron-builder's normal signing environment variables.
