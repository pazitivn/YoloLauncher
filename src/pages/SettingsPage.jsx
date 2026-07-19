import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../i18n';
import { applyAccent, applyTheme, listenSystemTheme } from '../App';
import { getSetting, setSetting } from '../utils/settings';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { CheckCircle2, XCircle, Download, Loader2, Info } from 'lucide-react';

function darkenHex(hex, amount = 40) {
  const r = Math.max(0, parseInt(hex.slice(1,3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3,5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5,7), 16) - amount);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

const PRESET_COLORS = [
  '#ef4444','#f97316','#eab308',
  '#22c55e','#3b82f6','#6366f1',
  '#a855f7','#7c6af7',
];

// Color pairs for the second row: [primary (same as first row), complementary]
const COLOR_PAIRS = [
  ['#ef4444', '#00ffa3'],  // Red + Mint
  ['#f97316', '#1a237e'],  // Orange + Deep Blue
  ['#eab308', '#311b92'],  // Yellow + Dark Purple
  ['#22c55e', '#ff00ff'],  // Green + Magenta
  ['#3b82f6', '#ffd700'],  // Blue + Bright Yellow
  ['#6366f1', '#39ff14'],  // Purple + Neon Lime
  ['#a855f7', '#d4a017'],  // Lilac + Mustard
  ['#7c6af7', '#ff6b6b'],  // Dark Indigo + Coral
];

export default function SettingsPage() {
  const { lang, setLang, t } = useTranslation();
  const [accent, setAccent] = useState('#7c6af7');
  const [theme, setTheme] = useState('system');
  const [mouseNav, setMouseNav] = useState(true);
  const [closeAction, setCloseAction] = useState('tray');
  const [gpuAccel, setGpuAccel] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [bgUpdate, setBgUpdate] = useState(true);
  const [sysNotify, setSysNotify] = useState(true);
  const [uiScale, setUiScale] = useState(100);
  const [speedMode, setSpeedMode] = useState('normal');
  const [discordRpc, setDiscordRpc] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // PortableMC state
  const [pmcReady, setPmcReady] = useState(null); // null = checking, true/false
  const [pmcInstalling, setPmcInstalling] = useState(false);
  const [pmcStage, setPmcStage] = useState('');
  const [pmcPercent, setPmcPercent] = useState(0);
  const [pmcError, setPmcError] = useState('');
  const unlistenRef = useRef(null);

  // Load settings from persistent store on mount
  useEffect(() => {
    Promise.all([
      getSetting('accent', '#7c6af7'),
      getSetting('theme', 'system'),
      getSetting('mouse_nav', true),
      getSetting('close_action', 'tray'),
      getSetting('gpu_accel', false),
      getSetting('auto_update', true),
      getSetting('bg_update', true),
      getSetting('sys_notify', true),
      getSetting('ui_scale', 100),
      getSetting('speed_mode', 'normal'),
      getSetting('discord_rpc', false),
    ]).then(([a, th, mn, ca, ga, au, bu, sn, us, sm, dr]) => {
      setAccent(a);
      setTheme(th);
      setMouseNav(mn === true || mn === 'true' || mn === undefined);
      setCloseAction(ca);
      setGpuAccel(ga === true || ga === 'true');
      setAutoUpdate(au === true || au === 'true');
      setBgUpdate(bu === true || bu === 'true');
      setSysNotify(sn === true || sn === 'true');
      setUiScale(Number(us));
      setSpeedMode(sm);
      setDiscordRpc(dr === true || dr === 'true');
      setLoaded(true);
    });

    // Check PortableMC status
    invoke('check_portablemc').then(ready => setPmcReady(ready)).catch(() => setPmcReady(false));

    // Listen for system theme changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      getSetting('theme', 'system').then(th => {
        if (th === 'system') applyTheme('system');
      });
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  async function handleSetupPmc() {
    setPmcInstalling(true);
    setPmcError('');
    setPmcStage('');
    setPmcPercent(0);
    const unlisten = await listen('pmc-install-progress', ({ payload }) => {
      if (payload.stage) setPmcStage(payload.stage);
      if (payload.percent !== undefined) setPmcPercent(payload.percent);
      if (payload.done) {
        setPmcInstalling(false);
        setPmcReady(true);
      }
      if (payload.error) {
        setPmcError(payload.error);
        setPmcInstalling(false);
      }
    });
    unlistenRef.current = unlisten;

    try {
      await invoke('setup_portablemc');
    } catch (err) {
      setPmcError(String(err));
      setPmcInstalling(false);
    }
  }

  // Cleanup PortableMC listener on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current.then(fn => fn());
      }
    };
  }, []);

  // Extract primary hex from stored accent value (single hex or 'pair:hex1:hex2')
  function accentPrimary(value) {
    if (typeof value === 'string' && value.startsWith('pair:')) {
      return value.split(':')[1];
    }
    return value;
  }

  async function handleAccentChange(color) {
    setAccent(color);
    await setSetting('accent', color);
    applyAccent(color, color);
  }

  async function handlePairAccentChange(c1, c2) {
    const id = `pair:${c1}:${c2}`;
    setAccent(id);
    await setSetting('accent', id);
    applyAccent(c1, c2);
  }

  async function handleThemeChange(th) {
    setTheme(th);
    await setSetting('theme', th);
    applyTheme(th);
    listenSystemTheme(th, applyTheme);
  }

  async function handleMouseNavChange(enabled) {
    setMouseNav(enabled);
    await setSetting('mouse_nav', enabled);
    window.dispatchEvent(new CustomEvent('yolo-mouse-nav', { detail: enabled }));
  }

  async function handleCloseActionChange(value) {
    setCloseAction(value);
    await setSetting('close_action', value);
  }

  async function handleToggle(key, setter, current) {
    const next = !current;
    setter(next);
    await setSetting(key, next);
  }

  async function handleUiScaleChange(value) {
    const v = Number(value);
    setUiScale(v);
    await setSetting('ui_scale', v);
  }

  async function handleSpeedModeChange(value) {
    setSpeedMode(value);
    await setSetting('speed_mode', value);
  }

  if (!loaded) return null;

  function Toggle({ value, onChange }) {
    return (
      <button
        onClick={onChange}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: value ? 'var(--accent)' : 'var(--bg-overlay)',
          position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        }}
        aria-checked={value}
        role="switch"
      >
        <span style={{
          position: 'absolute', top: 2, left: value ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%', background: 'white',
          transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          display: 'block',
        }} />
      </button>
    );
  }

  function SpeedOption({ value, label, hint, warning }) {
    const isActive = speedMode === value;
    return (
      <button
        onClick={() => handleSpeedModeChange(value)}
        style={{
          flex: 1, padding: '12px 14px', borderRadius: 10,
          border: isActive ? '2px solid var(--accent)' : '2px solid var(--border)',
          background: isActive ? 'var(--bg-glass-hover)' : 'transparent',
          cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
          display: 'flex', flexDirection: 'column', gap: 4, position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>
          <div
            title={hint}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'help', opacity: 0.6,
            }}
          >
            <Info size={13} />
          </div>
        </div>
        {isActive && warning && (
          <div style={{ fontSize: 10, color: 'var(--yellow)', marginTop: 2 }}>
            {warning}
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="page">
      <div className="page-header fade-in-up" style={{ animationDelay: '0ms' }}>
        <div className="page-title">{t('settingsTitle')}</div>
        <div className="page-subtitle">{t('settingsSubtitle')}</div>
      </div>

      {/* ─── Language ───────────────────────────────────────────────── */}
      <div className="settings-section fade-in-up" style={{ animationDelay: '60ms' }}>
        <div className="settings-section-title">{t('language')}</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('languageLabel')}</div>
            <div className="settings-row-desc">{t('languageDesc')}</div>
          </div>
          <select className="form-select" style={{ width: 'auto' }} value={lang} onChange={e => setLang(e.target.value)}>
            <option value="en">English</option>
            <option value="ru">Русский</option>
          </select>
        </div>
      </div>

      {/* ─── Launcher Behavior ──────────────────────────────────────── */}
      <div className="settings-section fade-in-up" style={{ animationDelay: '100ms' }}>
        <div className="settings-section-title">{t('settingsSectionLauncher')}</div>

        {/* Close action */}
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('closeActionLabel')}</div>
            <div className="settings-row-desc">{t('closeActionDesc')}</div>
          </div>
          <select
            className="form-select"
            style={{ width: 'auto' }}
            value={closeAction}
            onChange={e => handleCloseActionChange(e.target.value)}
          >
            <option value="tray">{t('closeActionTray')}</option>
            <option value="exit">{t('closeActionExit')}</option>
          </select>
        </div>

        {/* GPU acceleration */}
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('gpuAccelLabel')}</div>
            <div className="settings-row-desc">{t('gpuAccelDesc')}</div>
          </div>
          <Toggle value={gpuAccel} onChange={() => handleToggle('gpu_accel', setGpuAccel, gpuAccel)} />
        </div>

        {/* Auto update check */}
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('autoUpdateLabel')}</div>
            <div className="settings-row-desc">{t('autoUpdateDesc')}</div>
          </div>
          <Toggle value={autoUpdate} onChange={() => handleToggle('auto_update', setAutoUpdate, autoUpdate)} />
        </div>

        {/* Background update */}
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('bgUpdateLabel')}</div>
            <div className="settings-row-desc">{t('bgUpdateDesc')}</div>
          </div>
          <Toggle value={bgUpdate} onChange={() => handleToggle('bg_update', setBgUpdate, bgUpdate)} />
        </div>

        {/* System notifications */}
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('sysNotifyLabel')}</div>
            <div className="settings-row-desc">{t('sysNotifyDesc')}</div>
          </div>
          <Toggle value={sysNotify} onChange={() => handleToggle('sys_notify', setSysNotify, sysNotify)} />
        </div>
      </div>

      {/* ─── Appearance ──────────────────────────────────────────── */}
      <div className="settings-section fade-in-up" style={{ animationDelay: '140ms' }}>
        <div className="settings-section-title">{t('appearanceSection')}</div>

        {/* Theme */}
        <div className="settings-row" style={{ marginBottom: 12 }}>
          <div>
            <div className="settings-row-label">{t('themeLabel')}</div>
            <div className="settings-row-desc">{t('themeDesc')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['dark', 'light', 'system'].map(th => (
              <button
                key={th}
                className={`btn ${theme === th ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 16px', fontSize: 12 }}
                onClick={() => handleThemeChange(th)}
              >
                {th === 'dark' ? t('themeDark') : th === 'light' ? t('themeLight') : t('themeSystem')}
              </button>
            ))}
          </div>
        </div>

        {/* UI Scale */}
        <div className="settings-row" style={{ marginBottom: 16 }}>
          <div>
            <div className="settings-row-label">{t('uiScaleLabel')}</div>
            <div className="settings-row-desc">{t('uiScaleDesc')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 200 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>50%</span>
            <input
              type="range"
              min="50"
              max="200"
              step="10"
              value={uiScale}
              onChange={e => handleUiScaleChange(e.target.value)}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 36 }}>200%</span>
            <span style={{
              fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
              minWidth: 44, textAlign: 'center',
            }}>
              {uiScale}%
            </span>
          </div>
        </div>

        {/* Accent color — 16 options: 8 single + 8 paired */}
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div className="settings-row-label">{t('accentColor')}</div>
            <div className="settings-row-desc">{t('accentDesc')}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {PRESET_COLORS.map(color => (
              <button
                key={color}
                style={{
                  width: 28, height: 28, borderRadius: '50%', background: color,
                  border: 'none', cursor: 'pointer', flexShrink: 0,
                  boxShadow: accent === color ? `0 0 0 2px var(--bg-surface), 0 0 0 4px ${color}` : 'none',
                  transform: accent === color ? 'scale(1.18)' : 'scale(1)',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => handleAccentChange(color)}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {COLOR_PAIRS.map(([c1, c2]) => {
              const pairId = `pair:${c1}:${c2}`;
              const isSelected = accent === pairId;
              return (
                <button
                  key={pairId}
                  title={`${c1} / ${c2}`}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', border: 'none',
                    cursor: 'pointer', flexShrink: 0, position: 'relative', overflow: 'hidden',
                    boxShadow: isSelected ? `0 0 0 2px var(--bg-surface), 0 0 0 4px ${c1}` : 'none',
                    transform: isSelected ? 'scale(1.18)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => handlePairAccentChange(c1, c2)}
                >
                  <span style={{
                    position: 'absolute', inset: 0,
                    background: `linear-gradient(to bottom right, ${c1} 49.9%, ${c2} 50.1%)`,
                  }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview button */}
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10, marginTop: 8 }}>
          <div style={{
            width: '100%', padding: '12px 16px', borderRadius: 10,
            background: `linear-gradient(135deg, ${accentPrimary(accent)}, ${darkenHex(accentPrimary(accent), 40)})`,
            color: 'white', fontWeight: 700, fontSize: 13,
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none',
          }}>
            <span>▶</span>
            {t('accentPreview')}
          </div>
        </div>
      </div>

      {/* ─── Controls ────────────────────────────────────────────── */}
      <div className="settings-section fade-in-up" style={{ animationDelay: '180ms' }}>
        <div className="settings-section-title">{t('controlsSection')}</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('mouseNavLabel')}</div>
            <div className="settings-row-desc">{t('mouseNavDesc')}</div>
          </div>
          <Toggle value={mouseNav} onChange={() => handleMouseNavChange(!mouseNav)} />
        </div>
      </div>

      {/* ─── Network & Downloads ─────────────────────────────────── */}
      <div className="settings-section fade-in-up" style={{ animationDelay: '200ms' }}>
        <div className="settings-section-title">{t('settingsSectionNetwork')}</div>

        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div className="settings-row-label">{t('speedLabel')}</div>
            <div className="settings-row-desc">{t('speedDesc')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, width: '100%', flexWrap: 'wrap' }}>
            <SpeedOption
              value="economy"
              label={t('speedEconomy')}
              hint={t('speedEconomyHint')}
            />
            <SpeedOption
              value="normal"
              label={t('speedNormal')}
              hint={t('speedNormalHint')}
            />
            <SpeedOption
              value="multithreaded"
              label={t('speedMultithreaded')}
              hint={t('speedMultithreadedHint')}
              warning={speedMode === 'multithreaded' ? t('speedMultithreadedWarning') : ''}
            />
          </div>
        </div>
      </div>

      {/* ─── Integration ─────────────────────────────────────────── */}
      <div className="settings-section fade-in-up" style={{ animationDelay: '220ms' }}>
        <div className="settings-section-title">{t('settingsSectionIntegration')}</div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('discordRPCLabel')}</div>
            <div className="settings-row-desc">{t('discordRPCDesc')}</div>
          </div>
          <Toggle value={discordRpc} onChange={() => handleToggle('discord_rpc', setDiscordRpc, discordRpc)} />
        </div>
      </div>

      {/* ─── PortableMC Engine ───────────────────────────────────── */}
      <div className="settings-section fade-in-up" style={{ animationDelay: '240ms' }}>
        <div className="settings-section-title">{t('launchEngineSection')}</div>
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
            <div style={{ flex: 1 }}>
              <div className="settings-row-label">PortableMC</div>
              <div className="settings-row-desc">{t('pmcDesc')}</div>
            </div>
            {/* Status badge */}
            {pmcReady === null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12 }}>
                <Loader2 size={14} className="download-icon" />
                {t('pmcChecking')}
              </div>
            )}
            {pmcReady === true && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#22c55e', fontSize: 12, fontWeight: 700 }}>
                <CheckCircle2 size={16} />
                {t('pmcReady2')}
              </div>
            )}
            {pmcReady === false && !pmcInstalling && (
              <button
                className="btn btn-primary"
                style={{ fontSize: 12, padding: '8px 14px', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}
                onClick={handleSetupPmc}
              >
                <Download size={14} />
                {t('pmcInstall')}
              </button>
            )}
          </div>

          {/* Progress bar during install */}
          {pmcInstalling && (
            <div style={{ width: '100%' }}>
              <div style={{
                width: '100%', height: 6, borderRadius: 3,
                background: 'var(--bg-overlay)', overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  background: 'linear-gradient(90deg, var(--accent), var(--accent-bright))',
                  width: `${pmcPercent}%`,
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={11} className="download-icon" />
                {pmcStage} ({Math.round(pmcPercent)}%)
              </div>
            </div>
          )}

          {/* Error */}
          {pmcError && (
            <div style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4 }}>
                <XCircle size={14} /> {t('pmcInstallError')}
              </div>
              <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: 11 }}>{pmcError}</div>
              <button
                className="btn btn-secondary"
                style={{ marginTop: 10, fontSize: 11, padding: '4px 10px' }}
                onClick={handleSetupPmc}
              >
                {t('pmcRetry')}
              </button>
            </div>
          )}

          {pmcReady === true && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {t('pmcInstalled')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
