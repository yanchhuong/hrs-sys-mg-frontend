# HRMS Mobile (Android APK)

Capacitor-based Android shell wrapping the same Vite bundle the web
+ Tauri desktop paths ship. Talks to the hosted API — no bundled
Java, no on-device server.

## One-time prerequisites

Install these **before** running any `apk:*` script. All free.

### 1. JDK 21

Same JDK used by the API. If you already built `hrs-sys-mg-api`
(see `../hrs-sys-mg-api/README.md`), you have it. Otherwise:

```powershell
winget install --id Microsoft.OpenJDK.21
```

### 2. Android SDK (command-line tools are enough)

You do NOT need the full Android Studio IDE to build an APK — the
Gradle wrapper (`android/gradlew.bat`) drives everything. But you
DO need the SDK image at these platform levels:

- **Platform 35**  (compileSdk + targetSdk pinned here — see `android/variables.gradle`)
- **Build-tools 35.0.0**  (matching)
- **Platform-tools**  (adb)

Easiest path: install Android Studio once, let it pull the SDK,
then never open Studio again — the CLI reads the SDK from
`%LOCALAPPDATA%\Android\Sdk` (or `C:\Program Files (x86)\Android\android-sdk`
on legacy installs).

If Gradle can't find the SDK, set `ANDROID_HOME`:

```powershell
[Environment]::SetEnvironmentVariable('ANDROID_HOME', 'C:\Program Files (x86)\Android\android-sdk', 'User')
```

Then open a new terminal.

### 3. Accept SDK licences

One-time, from an elevated shell (Run as Administrator):

```powershell
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --licenses
```

Press `y` for each prompt.

## Point at the right API host

`.env.mobile` bakes `VITE_API_BASE` into the APK. Edit before building
if you're pointing at a different server:

```env
VITE_API_BASE=http://198.211.108.211:4000
```

Local dev tip — put your API dev machine's LAN IP (e.g.
`http://192.168.1.42:4000`) and phones on the same Wi-Fi can reach
it without any tunnel setup.

## Build a debug APK

```powershell
npm run apk:debug
```

This runs three things in sequence:

1. `vite build --mode mobile` — bundles the FE with the mobile env
2. `cap sync android` — copies `dist/` into `android/app/src/main/assets/public`
3. `gradlew.bat assembleDebug` — compiles the APK

Output: `android/app/build/outputs/apk/debug/app-debug.apk` (~6 MB).

## Install on a device

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Or drag the `.apk` onto the phone via USB / cloud storage and tap
to install (needs "Install from unknown sources" enabled in
device settings).

## Release APK (signed)

```powershell
npm run apk:release
```

Produces `app-release-unsigned.apk`. To sign for distribution:

1. Generate a keystore (once):

    ```powershell
    keytool -genkey -v -keystore smrt-hrms.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
    ```

2. Add signing config to `android/app/build.gradle` — see the
   [Android signing docs](https://developer.android.com/studio/publish/app-signing#gradle-config).

3. `npm run apk:release` again — Gradle picks up the signing block.

## Update the app after a code change

```powershell
npm run apk:debug
```

Same command as first build — Capacitor's `cap sync` step notices
the new `dist/` and copies over. The Android project keeps its own
config (`android/app/build.gradle`, `AndroidManifest.xml`) untouched
across syncs.

## Troubleshooting

**"SDK is read-only" warnings during build**
Non-fatal. Happens because the SDK sits under `C:\Program Files (x86)\`
which needs admin write access. Gradle prints noise but the build
succeeds. To silence: move the SDK to `%LOCALAPPDATA%\Android\Sdk`.

**"Android SDK Platform 36 not accepted"**
The project is pinned to SDK 35 in `android/variables.gradle`. If
Gradle asks for 36, either accept the licences (see prerequisites)
or verify `variables.gradle` still says `compileSdkVersion = 35`.
Capacitor's `cap sync` respects these numbers — it doesn't force
an upgrade.

**"Duplicate class kotlin.jvm.jdk8.*"**
The `android/app/build.gradle` has a `configurations.all` block that
excludes `kotlin-stdlib-jdk8` — a transitive from downgraded AndroidX
libraries clashing with the newer merged `kotlin-stdlib`. If you see
this reappear after a Capacitor upgrade, keep the exclusion or bump
the AndroidX pins to a matching train.
