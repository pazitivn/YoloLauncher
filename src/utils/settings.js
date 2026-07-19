// settings.js — Persistent settings storage using tauri-plugin-store
// Falls back to localStorage if not in Tauri environment

let storeInstance = null;
let storeReady = false;
const STORE_PATH = 'settings.json';

async function getStore() {
  if (storeInstance) return storeInstance;
  try {
    const { Store } = await import('@tauri-apps/plugin-store');
    storeInstance = await Store.load(STORE_PATH, { autoSave: true });
    storeReady = true;
    return storeInstance;
  } catch (e) {
    console.warn('[settings] tauri-plugin-store not available, using localStorage:', e);
    return null;
  }
}

export async function getSetting(key, defaultValue = null) {
  try {
    const store = await getStore();
    if (store) {
      const val = await store.get(key);
      return val !== null && val !== undefined ? val : defaultValue;
    }
  } catch {}
  // Fallback to localStorage
  const v = localStorage.getItem(`yolo_${key}`);
  return v !== null ? v : defaultValue;
}

export async function setSetting(key, value) {
  try {
    const store = await getStore();
    if (store) {
      await store.set(key, value);
      return;
    }
  } catch {}
  // Fallback
  localStorage.setItem(`yolo_${key}`, String(value));
}

export async function loadAllSettings() {
  return {
    lang: await getSetting('lang', 'en'),
    accent: await getSetting('accent', '#7c6af7'),
    theme: await getSetting('theme', 'system'),
    mouseNav: await getSetting('mouse_nav', true),
    closeAction: await getSetting('close_action', 'tray'),
    gpuAccel: await getSetting('gpu_accel', false),
    autoUpdate: await getSetting('auto_update', true),
    bgUpdate: await getSetting('bg_update', true),
    sysNotify: await getSetting('sys_notify', true),
    uiScale: await getSetting('ui_scale', 100),
    speedMode: await getSetting('speed_mode', 'normal'),
    discordRpc: await getSetting('discord_rpc', false),
  };
}
