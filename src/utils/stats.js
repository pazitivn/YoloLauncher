// stats.js — Persistent launcher statistics via tauri-plugin-store
// Falls back to localStorage if not in Tauri environment

const STATS_KEY = 'yolo_stats';
let _storeInstance = null;

async function getStore() {
  if (_storeInstance) return _storeInstance;
  try {
    const { Store } = await import('@tauri-apps/plugin-store');
    _storeInstance = await Store.load('settings.json', { autoSave: true });
    return _storeInstance;
  } catch {
    return null;
  }
}

async function loadStats() {
  try {
    const store = await getStore();
    if (store) {
      const val = await store.get(STATS_KEY);
      return val || {};
    }
  } catch {}
  // Fallback to localStorage
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY)) || {};
  } catch {
    return {};
  }
}

async function saveStats(stats) {
  try {
    const store = await getStore();
    if (store) {
      await store.set(STATS_KEY, stats);
      return;
    }
  } catch {}
  // Fallback
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

/** Initialize stats on first launch */
export async function initStats() {
  const stats = await loadStats();
  if (!stats.firstLaunch) {
    stats.firstLaunch = new Date().toISOString();
    stats.instances = {};
    await saveStats(stats);
  }
  return stats;
}

/** Call when a game instance starts */
export async function recordLaunchStart(instanceId, instanceName) {
  const stats = await loadStats();
  if (!stats.instances) stats.instances = {};
  if (!stats.instances[instanceId]) {
    stats.instances[instanceId] = {
      name: instanceName,
      launches: 0,
      totalMs: 0,
      lastPlayed: null,
      sessionStart: null,
    };
  }
  const inst = stats.instances[instanceId];
  inst.name = instanceName; // keep updated
  inst.launches += 1;
  inst.lastPlayed = new Date().toISOString();
  inst.sessionStart = Date.now();
  stats.lastPlayedId = instanceId;
  await saveStats(stats);
}

/** Call when a game instance stops */
export async function recordLaunchStop(instanceId) {
  const stats = await loadStats();
  if (!stats.instances?.[instanceId]) return;
  const inst = stats.instances[instanceId];
  if (inst.sessionStart) {
    inst.totalMs += Date.now() - inst.sessionStart;
    inst.sessionStart = null;
  }
  await saveStats(stats);
}

/** Returns total play time in hours across all instances */
export async function getTotalHours() {
  const stats = await loadStats();
  let total = 0;
  for (const inst of Object.values(stats.instances || {})) {
    total += inst.totalMs || 0;
  }
  return (total / 3_600_000).toFixed(1);
}

/** Returns the instance with most play time { id, name, hours } */
export async function getMostPlayedInstance() {
  const stats = await loadStats();
  let best = null;
  let bestMs = 0;
  for (const [id, inst] of Object.entries(stats.instances || {})) {
    if ((inst.totalMs || 0) > bestMs) {
      bestMs = inst.totalMs;
      best = { id, name: inst.name, hours: (bestMs / 3_600_000).toFixed(1) };
    }
  }
  return best;
}

/** Returns the last played instance id */
export async function getLastPlayedId() {
  return (await loadStats()).lastPlayedId || null;
}

/** Returns per-instance stats object */
export async function getInstanceStats(instanceId) {
  const stats = await loadStats();
  return stats.instances?.[instanceId] || null;
}

/** Returns first launch date */
export async function getFirstLaunch() {
  return (await loadStats()).firstLaunch || null;
}

export async function getAllStats() {
  return loadStats();
}

