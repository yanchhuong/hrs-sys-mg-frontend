# HRMS Mobile (iOS — iPhone + iPad)

Capacitor-based iOS shell wrapping the same Vite bundle the web +
Android + Tauri desktop paths ship. Talks to the hosted API — no
bundled server.

Bundle ID: **`app.smrthrms.mobile`** (see `capacitor.config.json`).
Kept distinct from Android's `kh.kosign.hrms.mobile` on purpose so
each platform lives under its own App Store / Play identity.

## Machine requirements

iOS builds MUST run on macOS. Every step below assumes you're on the
Mac (Windows can't sign, compile, or upload iOS apps).

### 1. macOS 13 Ventura or newer

Xcode 15 (needed by Capacitor 8) requires macOS 13+. If you're on
Monterey (12.x), upgrade the OS before proceeding — this is an Apple
constraint, not a Capacitor one.

### 2. Xcode 15+ from the App Store

Full Xcode.app — the "Command Line Tools" install alone is NOT
enough. After install, once:

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

### 3. Node ≥ 22

Capacitor 8's CLI refuses to run below 22:

```bash
# via nvm
nvm install 22 && nvm use 22
node -v   # v22.x.x
```

### 4. CocoaPods

Capacitor uses CocoaPods to install its native iOS runtime.

```bash
sudo gem install cocoapods
pod --version
```

### 5. Apple Developer account (release only)

Free tier signs debug builds for personal devices. Paid ($99/yr)
needed to sign release IPAs + upload to TestFlight / App Store.

## One-time platform scaffold

The `ios/` folder isn't in the repo yet — Capacitor generates it
from `capacitor.config.json`. From `hrs-sys-mg-frontend/`:

```bash
npm install
npm run build:mobile
npx cap add ios
```

That last step:
1. Creates `ios/App/App.xcodeproj` with bundle ID `app.smrthrms.mobile`
2. Copies the `dist/` bundle into `ios/App/App/public/`
3. Runs `pod install` to pull `Capacitor.pod` + all plugin pods

Commit the resulting `ios/` folder (Capacitor's `.gitignore` already
scopes out the transient bits — `Pods/`, `.xcworkspace/xcuserdata`).

## Point at the right API host

Same file as Android — `.env.mobile` bakes `VITE_API_BASE` into the
iOS bundle:

```env
VITE_API_BASE=http://198.211.108.211:4000
```

## Build & run on a Simulator

```bash
npm run cap:sync:ios     # build:mobile → cap sync ios
npm run cap:open:ios     # opens Xcode workspace
```

In Xcode: pick a **iPad** simulator (e.g. iPad Pro 12.9") from the
scheme dropdown → ▶ Run. First launch takes ~2 min.

Or straight from CLI:

```bash
npm run ipa:debug        # runs on the first available simulator
```

## Build for a physical iPad / iPhone

1. Connect the device via USB, unlock, trust the Mac.
2. In Xcode → project settings → *Signing & Capabilities*:
   - **Team:** pick your Apple ID / paid team.
   - **Bundle Identifier:** `app.smrthrms.mobile` (or the one the
     team's provisioning profile is bound to).
3. Pick the device in the scheme dropdown → ▶ Run.
4. First install: on the iPad, *Settings → General → VPN & Device
   Management* → trust the developer profile.

## Build a signed IPA for TestFlight / distribution

Free tier signing expires every 7 days on the device — for real
distribution you need the paid tier.

1. Xcode → *Product → Archive*. Waits for the release build.
2. In the Organizer that pops up, pick the archive → *Distribute App*.
3. Choose *App Store Connect* → *Upload*. Xcode handles code signing
   with the provisioning profile.
4. Once uploaded, iTunes Connect / App Store Connect shows the build
   in ~10 min → invite it to TestFlight.

## Update after a code change

```bash
npm run cap:sync:ios
```

That's the whole loop — rebuilds the FE, copies `dist/` into
`ios/App/App/public/`. Xcode auto-picks the new assets on next run.
No re-scaffold needed.

## iPad-specific bits

- The app follows the same responsive breakpoints as the web build
  — the `md:` and `lg:` Tailwind classes activate on iPad landscape
  and Pro 12.9" widths, so most tables show more columns than on
  iPhone.
- Support both orientations (`UISupportedInterfaceOrientations~ipad`
  in `Info.plist` — Capacitor defaults to all four).
- If a specific dialog / sheet feels cramped on iPad, prefer
  responsive breakpoints over iPad-only branches — keeps parity with
  the web.

## Troubleshooting

**`pod install` fails with an SSL error**
Update RubyGems + CocoaPods (`sudo gem install --user-install cocoapods`).
Older Ruby installs on macOS ship a stale root cert bundle.

**"No such module 'Capacitor'" in Xcode**
Open `ios/App/App.xcworkspace` (the workspace, NOT the `.xcodeproj`).
Pods live in the workspace only.

**Bundle ID `app.smrthrms.mobile` already taken by another dev**
Change it in *Signing & Capabilities* → Bundle Identifier — Xcode's
change survives future `cap sync` runs (Capacitor doesn't rewrite
project.pbxproj settings after the initial `cap add`).

**iPad layout still hides trailing buttons in the toolbar**
That's a Web-side responsive issue (see `.page-header-strip` in
`src/styles/index.css`). Fix on the web layer — the Capacitor shell
is a thin `WKWebView` and inherits the exact same CSS.
