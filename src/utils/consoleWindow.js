/**
 * openConsoleWindow — creates or focuses the Console Tauri window.
 * The console window loads the same bundle but with hash #console,
 * which switches the renderer to ConsoleApp.
 */
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

let creating = false;

export async function openConsoleWindow() {
  // Prevent concurrent creation attempts
  if (creating) return;

  // Check if the window already exists
  const existing = await WebviewWindow.getByLabel('console').catch(() => null);
  if (existing) {
    try {
      const visible = await existing.isVisible();
      if (!visible) await existing.show();
      await existing.setFocus();
    } catch {
      // Window might be partially closed, fall through to create
    }
    return;
  }

  creating = true;
  try {
    const devUrl = window.__TAURI_INTERNALS__?.config?.build?.devUrl;
    // In dev: use the vite dev URL with #console hash
    // In prod: use the dist index.html with #console hash
    const url = devUrl
      ? `${devUrl}#console`
      : 'index.html#console';

    const win = new WebviewWindow('console', {
      url,
      title: 'YoloLauncher — Console',
      width: 1100,
      height: 660,
      minWidth: 700,
      minHeight: 420,
      decorations: false,
      transparent: true,
      resizable: true,
      center: true,
      skipTaskbar: false,
      focus: true,
    });

    win.once('tauri://error', (e) => {
      console.error('[Console] Failed to create window:', e);
    });
  } finally {
    // Allow re-creation after a short delay
    setTimeout(() => { creating = false; }, 1000);
  }
}
