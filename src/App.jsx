import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ToastProvider } from './components/ToastProvider';
import { DialogProvider } from './components/DialogProvider';
import Titlebar from './components/Titlebar';
import Sidebar from './components/Sidebar';
import HomePage from './pages/HomePage';
import InstancesPage from './pages/InstancesPage';
import AccountsPage from './pages/AccountsPage';
import SettingsPage from './pages/SettingsPage';
import ServersPage from './pages/ServersPage';
import InstanceViewPage from './pages/InstanceViewPage';
import { LanguageProvider } from './i18n';
import { initStats, recordLaunchStop } from './utils/stats';
import { loadAllSettings, getSetting } from './utils/settings';
import { openConsoleWindow } from './utils/consoleWindow';
import MigrationModal from './components/MigrationModal';
import './index.css';

function darkenHex(hex, amount = 40) {
  const r = Math.max(0, parseInt(hex.slice(1,3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3,5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5,7), 16) - amount);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

export function applyAccent(color) {
  const dim = darkenHex(color, 40);
  const r = parseInt(color.slice(1,3), 16);
  const g = parseInt(color.slice(3,5), 16);
  const b = parseInt(color.slice(5,7), 16);
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-bright', color);
  document.documentElement.style.setProperty('--accent-dim', dim);
  document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.35)`);
  document.documentElement.style.setProperty('--border-accent', `rgba(${r},${g},${b},0.4)`);
  document.documentElement.style.setProperty('--shadow-accent', `0 0 30px rgba(${r},${g},${b},0.2)`);
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function AppInner() {
  const [page, setPage]                   = useState('home');
  const [accounts, setAccounts]           = useState([]);
  const [activeAccount, setActiveAccount] = useState(null);
  const [activeInstance, setActiveInstance] = useState(null);
  const [viewingInstance, setViewingInstance] = useState(null);
  const [instances, setInstances]         = useState([]);
  const [runningIds, setRunningIds]       = useState(new Set());
  const [showMigration, setShowMigration] = useState(true);

  const historyRef    = useRef(['home']);
  const historyPosRef = useRef(0);

  const navigateTo = useCallback((newPage, clearViewing = true) => {
    if (clearViewing) setViewingInstance(null);
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
      if (insts.length > 0 && !activeInstance) setActiveInstance(insts[0]);
    } catch {}
  }, [activeInstance]);

  useEffect(() => {
    initStats();
    refreshAccounts();
    refreshInstances();

    const handleContextMenu = (e) => e.preventDefault();
    document.addEventListener('contextmenu', handleContextMenu);

    loadAllSettings().then(({ accent, theme }) => {
      applyAccent(accent);
      applyTheme(theme);
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

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mousedown', handleMouseButton);
      window.removeEventListener('yolo-refresh-instances', handleRefresh);
      [unlistenStart, unlistenStop, unlistenOpen, unlistenCrash]
        .forEach(p => p.then(f => f()));
    };
  }, [refreshAccounts, navigateBack, navigateForward]);

  function handleLaunchFromHome(inst) {
    if (inst) setActiveInstance(inst);
    window.dispatchEvent(new CustomEvent('yolo-launch', { detail: { instance: inst } }));
  }

  return (
    <div className="app-shell">
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
          {page === 'instances' && !viewingInstance && (
            <InstancesPage
              activeAccount={activeAccount}
              activeInstance={activeInstance}
              setActiveInstance={setActiveInstance}
              onEditInstance={setViewingInstance}
              runningIds={runningIds}
              onOpenConsole={openConsoleWindow}
            />
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
          {page === 'servers'  && !viewingInstance && <ServersPage />}
          {page === 'settings' && !viewingInstance && <SettingsPage />}
        </main>
      </div>

      {showMigration && (
        <MigrationModal onComplete={(migrated) => {
          setShowMigration(false);
          if (migrated) {
            refreshAccounts();
            refreshInstances();
          }
        }} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <DialogProvider>
          <AppInner />
        </DialogProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}
