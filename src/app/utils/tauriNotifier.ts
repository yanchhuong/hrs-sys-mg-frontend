/**
 * V-fcm-3-tauri — thin bridge so the Windows desktop shell (Tauri +
 * WebView2) can raise a real Action-Center toast even when WebView2's
 * Web-Push support silently drops.
 *
 * <p>The plugin is loaded LAZILY (dynamic import) so a browser build
 * that never has {@code @tauri-apps/plugin-notification} available at
 * runtime still tree-shakes cleanly and doesn't crash on import.</p>
 *
 * <p>Callers should:</p>
 * <ol>
 *   <li>Check {@link isTauriHost} to gate calls,</li>
 *   <li>Call {@link showTauriNotification} once per event.</li>
 * </ol>
 */

import { isTauri } from './runtime';

/** True when the app is running inside the Tauri desktop shell. */
export function isTauriHost(): boolean {
  return isTauri();
}

/** Ask the user for OS notification permission the first time we
 *  want to fire one. Cached by Windows itself — subsequent calls
 *  resolve instantly. Returns true when the permission is granted. */
async function ensureTauriPermission(): Promise<boolean> {
  try {
    const mod = await import('@tauri-apps/plugin-notification');
    const already = await mod.isPermissionGranted();
    if (already) return true;
    const next = await mod.requestPermission();
    return next === 'granted';
  } catch (err) {
    console.warn('V-fcm-3-tauri: plugin unavailable', err);
    return false;
  }
}

/** Raise a Windows Action-Center toast. Silent on any failure so a
 *  missing plugin / denied permission never crashes the caller. */
export async function showTauriNotification(title: string, body: string): Promise<void> {
  if (!isTauriHost()) return;
  const ok = await ensureTauriPermission();
  if (!ok) return;
  try {
    const mod = await import('@tauri-apps/plugin-notification');
    mod.sendNotification({ title, body });
  } catch (err) {
    console.warn('V-fcm-3-tauri: sendNotification failed', err);
  }
}
