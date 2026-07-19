import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ToastProvider } from './components/ToastProvider';
import { DialogProvider } from './components/DialogProvider';
import { DownloadProvider } from './components/DownloadNotifications';
import DownloadNotificationsDrawer from './components/DownloadNotificationsDrawer';
import Titlebar from './components/Titlebar';
import Sidebar from './components/Sidebar';
import HomePage from './pages/HomePage';
import InstancesPage from './pages/InstancesPage';
import VersionsPage from './pages/VersionsPage';
import AccountsPage from './pages/AccountsPage';
import SettingsPage from './pages/SettingsPage';
import ServersPage from './pages/ServersPage';
import InstanceViewPage from './pages/InstanceViewPage';
import { LanguageProvider } from './i18n';
import { initStats, recordLaunchStop } from './utils/stats';
import { loadAllSettings, getSetting } from './utils/settings';
import { openConsoleWindow } from './utils/consoleWindow';
import MigrationModal from './components/MigrationModal';
import LanguageModal from './components/LanguageModal';
import UpdateModal from './components/UpdateModal';
import './index.css';

function darkenHex(hex, amount = 40) {
  const r = Math.max(0, parseInt(hex.slice(1,3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3,5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5,7), 16) - amount);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

export function applyAccent(primary, secondary = null) {
  const s = secondary || primary;
  // Primary accent
  const dimP = darkenHex(primary, 40);
  const r1 = parseInt(primary.slice(1,3), 16);
  const g1 = parseInt(primary.slice(3,5), 16);
  const b1 = parseInt(primary.slice(5,7), 16);
  document.documentElement.style.setProperty('--accent', primary);
  document.documentElement.style.setProperty('--accent-bright', primary);
  document.documentElement.style.setProperty('--accent-dim', dimP);
  document.documentElement.style.setProperty('--accent-glow', `rgba(${r1},${g1},${b1},0.35)`);
  document.documentElement.style.setProperty('--border-accent', `rgba(${r1},${g1},${b1},0.4)`);
  document.documentElement.style.setProperty('--shadow-accent', `0 0 30px rgba(${r1},${g1},${b1},0.2)`);
  // Secondary accent
  const dimS = darkenHex(s, 40);
  const r2 = parseInt(s.slice(1,3), 16);
  const g2 = parseInt(s.slice(3,5), 16);
  const b2 = parseInt(s.slice(5,7), 16);
  document.documentElement.style.setProperty('--accent-secondary', s);
  document.documentElement.style.setProperty('--accent-secondary-bright', s);
  document.documentElement.style.setProperty('--accent-secondary-dim', dimS);
  document.documentElement.style.setProperty('--accent-secondary-glow', `rgba(${r2},${g2},${b2},0.35)`);
  document.documentElement.style.setProperty('--border-accent-secondary', `rgba(${r2},${g2},${b2},0.4)`);
  document.documentElement.style.setProperty('--shadow-accent-secondary', `0 0 30px rgba(${r2},${g2},${b2},0.2)`);
}

export function applyTheme(theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

// Apply UI scale as a zoom factor (50-200%)
export function applyUiScale(percent) {
  const factor = Math.max(0.5, Math.min(2, percent / 100));
  document.documentElement.style.zoom = factor;
  
  // Принудительно меняем vw/vh на 100%, чтобы масштаб применялся к 
  // логическому размеру документа, а не ломался об физический размер окна
  document.documentElement.style.width = '100%';
  document.documentElement.style.height = '100%';
  document.body.style.width = '100%';
  document.body.style.height = '100%';
  
  const root = document.getElementById('root');
  if (root) {
    root.style.width = '100%';
    root.style.height = '100%';
  }
}

// Track system color scheme so 'system' theme stays reactive
let systemThemeListener = null;
export function listenSystemTheme(themeSetting, applyFn) {
  if (systemThemeListener) {
    systemThemeListener();
    systemThemeListener = null;
  }
  if (themeSetting === 'system') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyFn('system');
    mq.addEventListener('change', handler);
    systemThemeListener = () => mq.removeEventListener('change', handler);
  }
}

function AppInner() {
  const [page, setPage]                   = useState('home');
  const [accounts, setAccounts]           = useState([]);
  const [activeAccount, setActiveAccount] = useState(null);
  const [activeInstance, setActiveInstance] = useState(null);
  const [viewingInstance, setViewingInstance] = useState(null);
  const [viewingVersions, setViewingVersions] = useState(false);
  const [instances, setInstances]         = useState([]);
  const [runningIds, setRunningIds]       = useState(new Set());
  const [showLanguageModal, setShowLanguageModal] = useState(true);
  const [showMigration, setShowMigration] = useState(true);
  const [updateDone, setUpdateDone] = useState(false);

  const historyRef    = useRef(['home']);
  const historyPosRef = useRef(0);

  const navigateTo = useCallback((newPage, clearViewing = true) => {
    if (clearViewing) { setViewingInstance(null); setViewingVersions(false); }
    setPage(newPage);
    historyRef.current = historyRef.current.slice(0, historyPosRef.current + 1);
    historyRef.current.push(newPage);
    historyPosRef.current = historyRef.current.length - 1;
  }, []);

  const navigateBack = useCallback(() => {
    if (historyPosRef.current > 0) {
      historyPosRef.current--;
      setPage(historyRef.current[historyPosRef.current]);
      setViewingInstance(null);
    }
  }, []);

  const navigateForward = useCallback(() => {
    if (historyPosRef.current < historyRef.current.length - 1) {
      historyPosRef.current++;
      setPage(historyRef.current[historyPosRef.current]);
      setViewingInstance(null);
    }
  }, []);

  const refreshAccounts = useCallback(async () => {
    try {
      const [accs, active] = await Promise.all([
        invoke('get_accounts'),
        invoke('get_active_account'),
      ]);
      setAccounts(accs);
      setActiveAccount(active);
    } catch {}
  }, []);

  const refreshInstances = useCallback(async () => {
    try {
      const insts = await invoke('get_instances');
      setInstances(insts);
      if (insts.length > 0) {
        const savedId = await invoke('get_last_selected_instance');
        if (savedId) {
          const found = insts.find(i => i.id === savedId);
          if (found) setActiveInstance(found);
          else setActiveInstance(insts[0]);
        } else {
          setActiveInstance(insts[0]);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    initStats();
    refreshAccounts();
    refreshInstances();

    const handleContextMenu = (e) => e.preventDefault();
    document.addEventListener('contextmenu', handleContextMenu);

    loadAllSettings().then(({ accent, theme, uiScale }) => {
      // Parse stored accent: single hex or 'pair:primary:secondary'
      let primary = accent, secondary = accent;
      if (typeof accent === 'string' && accent.startsWith('pair:')) {
        const parts = accent.split(':');
        primary = parts[1];
        secondary = parts[2];
      }
      applyAccent(primary, secondary);
      applyTheme(theme);
      applyUiScale(uiScale || 100);
      listenSystemTheme(theme, applyTheme);
    });

    const handleMouseButton = async (e) => {
      const navEnabled = await getSetting('mouse_nav', true);
      if (!navEnabled) return;
      if (e.button === 3) { e.preventDefault(); navigateBack(); }
      if (e.button === 4) { e.preventDefault(); navigateForward(); }
    };
    window.addEventListener('mousedown', handleMouseButton);

    // Track running instances for sidebar badge
    const unlistenStart = listen('instance-started', ({ payload }) =>
      setRunningIds(s => new Set([...s, payload.launch_id]))
    );
    const unlistenStop = listen('instance-stopped', ({ payload }) => {
      recordLaunchStop(payload.instance_id); // async, fire-and-forget intentionally
      setRunningIds(s => { const n = new Set(s); n.delete(payload.launch_id); return n; });
    });
    // Open native console window on request or crash
    const unlistenOpen  = listen('open-console',     () => openConsoleWindow());
    const unlistenCrash = listen('instance-crashed', () => openConsoleWindow());

    const handleRefresh = () => refreshInstances();
    window.addEventListener('yolo-refresh-instances', handleRefresh);

    // Re-read active instance when the window gains focus
    // (handles multi-window scenarios)
    const handleFocus = () => refreshInstances();
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mousedown', handleMouseButton);
      window.removeEventListener('yolo-refresh-instances', handleRefresh);
      window.removeEventListener('focus', handleFocus);
      [unlistenStart, unlistenStop, unlistenOpen, unlistenCrash]
        .forEach(p => p.then(f => f()));
    };
  }, [refreshAccounts, navigateBack, navigateForward]);

  // Persist active instance id whenever it changes
  useEffect(() => {
    if (activeInstance) {
      invoke('set_last_selected_instance', { instanceId: activeInstance.id });
    }
  }, [activeInstance]);

  function handleLaunchFromHome(inst) {
    if (inst) setActiveInstance(inst);
    window.dispatchEvent(new CustomEvent('yolo-launch', { detail: { instance: inst } }));
  }

  return (
    <div className="app-shell" style={{ width: '100%', height: '100%' }}>
      {!updateDone && <UpdateModal onComplete={() => setUpdateDone(true)} />}

      <Titlebar />
      <div className="main-layout">
        <Sidebar
          page={viewingInstance ? 'instances' : page}
          setPage={p => navigateTo(p)}
          activeAccount={activeAccount}
          activeInstance={activeInstance}
          onAccountClick={() => navigateTo('accounts')}
          runningCount={runningIds.size}
          onOpenConsole={openConsoleWindow}
        />
        <main className="content-area">
          {page === 'home' && !viewingInstance && (
            <HomePage
              instances={instances}
              activeInstance={activeInstance}
              setActiveInstance={setActiveInstance}
              onLaunch={handleLaunchFromHome}
              setPage={navigateTo}
            />
          )}
          {page === 'instances' && !viewingInstance && !viewingVersions && (
            <InstancesPage
              activeAccount={activeAccount}
              activeInstance={activeInstance}
              setActiveInstance={setActiveInstance}
              onEditInstance={setViewingInstance}
              onManageVersions={() => setViewingVersions(true)}
              runningIds={runningIds}
              onOpenConsole={openConsoleWindow}
            />
          )}
          {page === 'instances' && viewingVersions && (
            <VersionsPage onBack={() => setViewingVersions(false)} />
          )}
          {viewingInstance && (
            <InstanceViewPage
              instance={viewingInstance}
              onBack={() => setViewingInstance(null)}
              onInstanceUpdate={(inst) => {
                setViewingInstance(inst);
                if (activeInstance?.id === inst.id) setActiveInstance(inst);
              }}
            />
          )}
          {page === 'accounts' && !viewingInstance && (
            <AccountsPage accounts={accounts} activeAccount={activeAccount} onRefresh={refreshAccounts} />
          )}
          {page === 'servers'  && !viewingInstance && (
            <ServersPage instances={instances} activeInstance={activeInstance} />
          )}
          {page === 'settings' && !viewingInstance && <SettingsPage />}
        </main>
      </div>

      {showLanguageModal && (
        <LanguageModal onComplete={() => setShowLanguageModal(false)} />
      )}

      {!showLanguageModal && showMigration && (
        <MigrationModal onComplete={(migrated) => {
          setShowMigration(false);
          if (migrated) {
            refreshAccounts();
            refreshInstances();
          }
        }} />
      )}

      <DownloadNotificationsDrawer />
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <DialogProvider>
          <DownloadProvider>
            <AppInner />
          </DownloadProvider>
        </DialogProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}