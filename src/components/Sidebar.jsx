import React, { useState, useEffect, useRef } from 'react';
import {
  Gamepad2, Settings, Users, Play, Loader2, Home, Server, Terminal,
  Download, XCircle, CheckCircle2,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from './ToastProvider';
import { useTranslation } from '../i18n';
import { useDownloads } from './DownloadNotifications';
import { recordLaunchStart, recordLaunchStop } from '../utils/stats';
import ConfettiCanvas from './ConfettiCanvas';

export default function Sidebar({
  page, setPage,
  activeAccount, activeInstance, onAccountClick,
  runningCount = 0, onOpenConsole,
}) {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const { startDownload, activeDownloads, waitForDownload, startPmcInstall } = useDownloads();
  const [launching, setLaunching]         = useState(false);
  const [launchPhase, setLaunchPhase]     = useState('');
  const [launchProgress, setLaunchProgress] = useState(0);
  const [confetti, setConfetti]           = useState(false);
  const [mcVersions, setMcVersions]       = useState([]);
  const [downloadedVersions, setDownloadedVersions] = useState([]);
  const playBtnRef = useRef(null);

  // PMC install modal
  const [showPmcModal, setShowPmcModal] = useState(false);
  const [pmcModalInstalling, setPmcModalInstalling] = useState(false);

  useEffect(() => {
    loadMcVersions();
    loadDownloaded();
  }, []);

  async function loadMcVersions() {
    try { setMcVersions(await invoke('get_minecraft_versions', { includeSnapshots: false })); } catch {}
  }
  async function loadDownloaded() {
    try { setDownloadedVersions(await invoke('get_downloaded_versions')); } catch {}
  }

  async function checkPmcReady() {
    try {
      return await invoke('check_portablemc');
    } catch {
      return false;
    }
  }

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

    // Check if PortableMC is installed
    const pmcOk = await checkPmcReady();
    if (!pmcOk) {
      setShowPmcModal(true);
      return;
    }

    setLaunching(true);
    setLaunchPhase(t('launchPhaseChecking'));
    setLaunchProgress(20);

    // If version not yet downloaded, download first
    if (!downloadedVersions.includes(inst.minecraft_version)) {
      setLaunchPhase('Checking files\u2026');
      await loadDownloaded();
      if (!downloadedVersions.includes(inst.minecraft_version)) {
        const existing = activeDownloads[inst.id];
        if (existing && !existing.done) {
          setLaunchPhase('Waiting for download\u2026');
          setLaunchProgress(15);
          const result = await waitForDownload(inst.id);
          if (result && result.error) {
            addToast('Download failed: ' + result.error, 'error');
            setLaunching(false);
            setLaunchPhase('');
            setLaunchProgress(0);
            return;
          }
        } else {
          setLaunchPhase('Downloading Minecraft\u2026');
          setLaunchProgress(10);
          try {
            const result = await startDownload(inst, mcVersions, true);
            if (result && result.error) {
              addToast('Download failed: ' + result.error, 'error');
              setLaunching(false);
              setLaunchPhase('');
              setLaunchProgress(0);
              return;
            }
          } catch (e) {
            addToast('Download error: ' + e, 'error');
            setLaunching(false);
            setLaunchPhase('');
            setLaunchProgress(0);
            return;
          }
        }
        await loadDownloaded();
      }
    }

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
      addToast(`${t('launching')} ${inst.name}\u2026`, 'success');
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

  async function handlePmcInstall() {
    setPmcModalInstalling(true);
    try {
      await startPmcInstall();
      setShowPmcModal(false);
    } catch (e) {
      addToast(String(e), 'error');
    } finally {
      setPmcModalInstalling(false);
    }
  }

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

      {/* Console shortcut button */}
      {runningCount > 0 && (
        <div style={{ padding: '0 8px 8px 8px' }}>
          <button
            onClick={onOpenConsole}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
              background: 'color-mix(in srgb, var(--accent-secondary-dim) 20%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-secondary-dim) 45%, transparent)',
              color: 'var(--accent-secondary-bright)', fontSize: 12, fontWeight: 600,
              transition: 'all .15s',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent-secondary-dim) 35%, transparent)'}
            onMouseOut={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent-secondary-dim) 20%, transparent)'}
          >
            <Terminal size={14} />
            {'\u041A\u043E\u043D\u0441\u043E\u043B\u044C'}
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
          (() => {
            const activeDl = activeDownloads[activeInstance.id];
            const isDownloading = activeDl && !activeDl.done && !launching;
            return (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{
              background: isDownloading ? 'var(--yellow-dim)' : 'var(--accent-secondary-dim)',
              color: isDownloading ? 'var(--yellow)' : 'white',
              fontSize: 11, fontWeight: 700,
              padding: '5px 14px', alignSelf: 'center',
              borderTopLeftRadius: 8, borderTopRightRadius: 8,
              zIndex: 1, boxShadow: '0 -2px 10px rgba(0,0,0,0.3)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {isDownloading && <Loader2 size={10} className="download-icon-spin" />}
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
                opacity: isDownloading ? 0.85 : 1,
              }}
              onClick={() => handleLaunch()}
              disabled={launching || isDownloading}
            >
              {(launching || isDownloading) && (
                <div className="play-btn-progress" style={{
                  width: isDownloading ? `${Math.min(activeDl.percent, 95)}%` : `${launchProgress}%`,
                  background: isDownloading ? 'linear-gradient(90deg, var(--yellow-dim), var(--yellow))' : undefined,
                }} />
              )}
              <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                {launching ? (
                  <Loader2 className="download-icon" size={20} />
                ) : isDownloading ? (
                  <Loader2 className="download-icon-spin" size={20} color="var(--yellow)" />
                ) : (
                  <Play size={20} fill="currentColor" />
                )}
                {launching ? launchPhase || t('launching') :
                 isDownloading ? `${(t('installing') || 'Downloading')} ${activeDl.percent.toFixed(0)}%` :
                 t('play')}
              </span>
            </button>
          </div>
            );
          })()
        ) : (
          <button className="btn btn-secondary" style={{ width: '100%', padding: '14px', opacity: 0.5, cursor: 'not-allowed' }}>
            <Play size={20} /> {t('play')}
          </button>
        )}
      </div>

      {/* ─── PMC Install Modal ─────────────────────────────────────── */}
      {showPmcModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !pmcModalInstalling) setShowPmcModal(false); }}>
          <div className="modal" style={{ width: 420, textAlign: 'center' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'linear-gradient(135deg, var(--accent-secondary-dim), var(--accent-secondary))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', color: 'white',
              }}>
                <Download size={28} />
              </div>
              <div className="modal-title" style={{ marginBottom: 8 }}>{t('pmcInstallTitle')}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '0 8px' }}>
                {t('pmcInstallDesc')}
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowPmcModal(false)}
                disabled={pmcModalInstalling}
              >
                {t('cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handlePmcInstall}
                disabled={pmcModalInstalling}
                style={{ gap: 8 }}
              >
                {pmcModalInstalling ? (
                  <Loader2 size={16} className="download-icon-spin" />
                ) : (
                  <Download size={16} />
                )}
                {pmcModalInstalling ? t('pmcInstallProgress') : t('pmcInstallBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
