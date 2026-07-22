# HRMS Desktop (Tauri)

Windows desktop shell over the existing Vite React app. Talks to
the cloud-hosted API by default — no bundled Java/JAR.

## One-time prerequisites

Install these **before** running any `npm run tauri:*` command.
Both are free.

### 1. Rust toolchain

```powershell
winget install --id Rustlang.Rustup
# then, in a NEW PowerShell window (rustup needs a fresh PATH):
rustup default stable
```

Verify:

```powershell
rustc --version
cargo --version
```

### 2. Visual Studio Build Tools (C++ workload)

Rust on Windows links through MSVC. Install the free Build Tools —
you don't need the full Visual Studio IDE.

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools ^
    --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.Windows11SDK.22621"
```

The download is ~4 GB. Restart your terminal after it finishes.

### 3. WebView2 runtime

Ships with every Windows 10/11 install since 2022. If missing,
Tauri auto-downloads it on first run.

## Install the JS side

```powershell
npm install
```

`@tauri-apps/cli` gets pulled in as a dev-dependency. No global
install needed.

## Dev loop

```powershell
npm run tauri:dev
```

This runs `vite` on `localhost:5173` under the hood and opens the
Tauri window pointing at it. Hot-reload works as usual — edit
components in `src/`, the window refreshes.

## Production build (MSI installer)

Before the first build, drop icons into `src-tauri/icons/` (see
`src-tauri/icons/README.md`).

The Tauri build runs `npm run build:desktop`, which loads
`.env.desktop`. The desktop shell **requires an absolute
`VITE_API_BASE`** — Tauri has no server-side rewrite, and a
relative path resolves against the custom protocol
(`http://tauri.localhost`), so the WebView hands back the SPA's
own `index.html` and login silently fails with
"Login response was empty or malformed."

Edit `.env.desktop` before shipping to a customer, or export
`VITE_API_BASE` inline:

```powershell
$env:VITE_API_BASE = "https://api.your-hrms.example.com"
npm run tauri:build
```

Output:

- MSI installer: `src-tauri/target/release/bundle/msi/HRMS_0.1.0_x64_en-US.msi`
- Standalone .exe (unsigned): `src-tauri/target/release/HRMS.exe`

## Runtime API-base switch (no rebuild)

The FE reads three sources in this precedence:

1. `localStorage['hrms:apiBaseOverride']` — set from the shipped
   app's Settings screen (or DevTools console). Wins over any
   build-time value.
2. `VITE_API_BASE` — baked at build time.
3. `http://localhost:4000` — dev fallback.

To switch a customer's install to a different server without
shipping a new MSI:

```js
// In the installed app, open DevTools (F12) and run:
localStorage.setItem('hrms:apiBaseOverride', 'https://api.other-tenant.example.com');
location.reload();
```

Or expose a Settings input that calls `setApiBaseOverride(url)`
from `src/app/api/client.ts`.

## Code signing (optional)

An unsigned MSI works but throws a SmartScreen warning on first
run. Tauri supports code-signing via a `.pfx` cert — see the Tauri
Windows signing docs. Skip until the app is ready for customer
distribution.
