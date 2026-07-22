# App icons

Drop the following into this folder before running `npm run tauri:build`:

- `icon.ico`  — Windows executable + installer icon.
- `32x32.png`, `128x128.png`, `128x128@2x.png` — tray / launcher.
- `icon.icns` — macOS (optional, only if you cross-build).

Generate them from a single 1024×1024 PNG:

```bash
# from anywhere in the project, with the CLI installed:
npm run tauri icon path/to/source-1024.png
```

Until real icons are in place, Tauri will refuse to build the MSI.
Copy any placeholder PNG under `32x32.png` / `128x128.png` /
`128x128@2x.png` + a matching `icon.ico` (Windows requires .ico
format, not .png) to unblock a first build.
