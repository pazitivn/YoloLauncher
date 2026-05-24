import React, { useState, useEffect, useRef } from 'react';
import {
  Gamepad2, Settings, Users, Play, Loader2, Home, Server, Terminal,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from './ToastProvider';
import { useTranslation } from '../i18n';
import { recordLaunchStart, recordLaunchStop } from '../utils/stats';
import ConfettiCanvas from './ConfettiCanvas';

export default function Sidebar({
  page, setPage,
  activeAccount, activeInstance, onAccountClick,
  runningCount = 0, onOpenConsole,
}) {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [launching, setLaunching]         = useState(false);
  const [launchPhase, setLaunchPhase]     = useState('');
  const [launchProgress, setLaunchProgress] = useState(0);
  const [confetti, setConfetti]           = useState(false);
  const playBtnRef = useRef(null);

  // ── Play handler ────────────────────────────────────────────────────────
  async function handleLaunch(instanceOverride) {
    const inst = instanceOverride || activeInstance;
    if (!inst) { addToast(t('instances'), 'error'); return; }

    let account;
    try {
      account = await invoke('get_active_account');
    } catch (e) {
      addToast('Failed to get active account: ' + e, 'error');
      return;
    }
    if (!account) {
      addToast('No active account! Add one in Accounts tab.', 'error');
      return;
    }

    setLaunching(true);
    setLaunchPhase(t('launchPhaseChecking'));
    setLaunchProgress(20);

    setConfetti(false);
    setTimeout(() => setConfetti(true), 30);
    setTimeout(() => setConfetti(false), 2500);

    const phases = [
      { phase: t('launchPhaseChecking'), progress: 30, delay: 200 },
      { phase: t('launchPhaseStarting'), progress: 70, delay: 800 },
      { phase: t('launchPhaseStarting'), progress: 90, delay: 1400 },
    ];
    for (const p of phases) {
      await new Promise(r => setTimeout(r, p.delay));
      setLaunchPhase(p.phase);
      setLaunchProgress(p.progress);
    }

    try {
      await recordLaunchStart(inst.id, inst.name);
      await invoke('launch_instance', {
        instanceId:       inst.id,
        instanceName:     inst.name,
        customPath:       inst.custom_path || null,
        minecraftVersion: inst.minecraft_version,
        loader:           inst.loader || null,
        loaderVersion:    inst.loader_version || null,
        memoryMb:         inst.memory_mb,
        account,
        javaPath:         inst.java_path || null,
        launchBehavior:   inst.launch_behavior || 'hide',
        openConsole:      inst.open_console ?? false,
      });
      addToast(`${t('launching')} ${inst.name}…`, 'success');
      setLaunchPhase(t('launchPhaseRunning'));
      setLaunchProgress(100);
    } catch (err) {
      addToast(String(err), 'error');
    } finally {
      await new Promise(r => setTimeout(r, 600));
      setLaunching(false);
      setLaunchPhase('');
      setLaunchProgress(0);
      window.dispatchEvent(new CustomEvent('yolo-refresh-instances'));
    }
  }

  useEffect(() => {
    const handler = (e) => handleLaunch(e.detail?.instance);
    window.addEventListener('yolo-launch', handler);
    return () => window.removeEventListener('yolo-launch', handler);
  }, [activeAccount, activeInstance]);

  return (
    <div className="sidebar">
      <ConfettiCanvas active={confetti} originRef={playBtnRef} />

      {/* Account Widget */}
      <div className="account-widget" onClick={onAccountClick} title={t('accounts')}>
        <div className="account-avatar">
          {activeAccount ? activeAccount.username.substring(0, 2).toUpperCase() : '?'}
        </div>
        <div className="account-info">
          <div className="account-name">{activeAccount ? activeAccount.username : t('accounts')}</div>
          <div className="account-type">
            {activeAccount
              ? (activeAccount.uuid.includes('-') ? 'Offline' : 'Microsoft')
              : 'No account selected'}
          </div>
        </div>
      </div>

      <div className="sidebar-section-label" style={{ marginTop: 12 }}>MENU</div>

      <button className={`nav-item ${page === 'home'      ? 'active' : ''}`} onClick={() => setPage('home')}>
        <Home className="nav-icon" /> {t('home')}
      </button>
      <button className={`nav-item ${page === 'instances' ? 'active' : ''}`} onClick={() => setPage('instances')}>
        <Gamepad2 className="nav-icon" /> {t('instances')}
      </button>
      <button className={`nav-item ${page === 'accounts'  ? 'active' : ''}`} onClick={() => setPage('accounts')}>
        <Users className="nav-icon" /> {t('accounts')}
      </button>
      <button className={`nav-item ${page === 'servers'   ? 'active' : ''}`} onClick={() => setPage('servers')}>
        <Server className="nav-icon" /> {t('servers')}
      </button>
      <button className={`nav-item ${page === 'settings'  ? 'active' : ''}`} onClick={() => setPage('settings')}>
        <Settings className="nav-icon" /> {t('settings')}
      </button>

      <div className="sidebar-spacer" />

      {/* Console shortcut button — only shown when a game is/was running */}
      {runningCount > 0 && (
        <div style={{ padding: '0 8px 8px 8px' }}>
          <button
            onClick={onOpenConsole}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(124,106,247,.12)',
              border: '1px solid rgba(124,106,247,.25)',
              color: '#9d8fff', fontSize: 12, fontWeight: 600,
              transition: 'all .15s',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(124,106,247,.2)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(124,106,247,.12)'}
          >
            <Terminal size={14} />
            Консоль
            <span style={{
              marginLeft: 'auto', fontSize: 10, fontWeight: 700,
              background: '#4ade80', color: '#000',
              borderRadius: 10, padding: '1px 6px',
              boxShadow: '0 0 6px rgba(74,222,128,.4)',
            }}>
              {runningCount}
            </span>
          </button>
        </div>
      )}

      {/* Play Button */}
      <div style={{ padding: '0 8px 12px 8px' }}>
        {activeInstance ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{
              background: 'var(--accent-dim)', color: 'white',
              fontSize: 11, fontWeight: 700,
              padding: '5px 14px', alignSelf: 'center',
              borderTopLeftRadius: 8, borderTopRightRadius: 8,
              zIndex: 1, boxShadow: '0 -2px 10px rgba(0,0,0,0.3)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {activeInstance.name}
            </div>
            <button
              className="btn play-btn"
              ref={playBtnRef}
              style={{
                position: 'relative', overflow: 'hidden', width: '100%',
                padding: '16px', fontSize: 16,
                borderTopLeftRadius: 6, borderTopRightRadius: 6,
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8,
              }}
              onClick={() => handleLaunch()}
              disabled={launching}
            >
              {launching && (
                <div className="play-btn-progress" style={{ width: `${launchProgress}%` }} />
              )}
              <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                {launching
                  ? <Loader2 className="download-icon" size={20} />
                  : <Play size={20} fill="currentColor" />
                }
                {launching ? launchPhase || t('launching') : t('play')}
              </span>
            </button>
          </div>
        ) : (
          <button className="btn btn-secondary" style={{ width: '100%', padding: '14px', opacity: 0.5, cursor: 'not-allowed' }}>
            <Play size={20} /> {t('play')}
          </button>
        )}
      </div>
    </div>
  );
}
