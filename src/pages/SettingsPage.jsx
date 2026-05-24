import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../i18n';
import { applyAccent, applyTheme } from '../App';
import { getSetting, setSetting } from '../utils/settings';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { CheckCircle2, XCircle, Download, Loader2 } from 'lucide-react';

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

export default function SettingsPage() {
  const { lang, setLang, t } = useTranslation();
  const [accent, setAccent] = useState('#7c6af7');
  const [theme, setTheme] = useState('dark');
  const [mouseNav, setMouseNav] = useState(true);
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
      getSetting('theme', 'dark'),
      getSetting('mouse_nav', true),
    ]).then(([a, th, mn]) => {
      setAccent(a);
      setTheme(th);
      setMouseNav(mn === true || mn === 'true' || mn === undefined);
      setLoaded(true);
    });

    // Check PortableMC status
    invoke('check_portablemc').then(ready => setPmcReady(ready)).catch(() => setPmcReady(false));

    return () => {
      if (unlistenRef.current) unlistenRef.current();
    };
  }, []);

  async function handleSetupPmc() {
    setPmcInstalling(true);
    setPmcError('');
    setPmcStage('Starting…');
    setPmcPercent(0);

    // Listen to progress events
    const unlisten = await listen('pmc-setup-progress', ({ payload }) => {
      setPmcStage(payload.stage);
      setPmcPercent(payload.percent);
      if (payload.done && !payload.error) {
        setPmcReady(true);
        setPmcInstalling(false);
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

  async function handleAccentChange(color) {
    setAccent(color);
    await setSetting('accent', color);
    applyAccent(color);
  }

  async function handleThemeChange(th) {
    setTheme(th);
    await setSetting('theme', th);
    applyTheme(th);
  }

  async function handleMouseNavChange(enabled) {
    setMouseNav(enabled);
    await setSetting('mouse_nav', enabled);
    window.dispatchEvent(new CustomEvent('yolo-mouse-nav', { detail: enabled }));
  }

  if (!loaded) return null;

  return (
    <div className="page">
      <div className="page-header fade-in-up" style={{ animationDelay: '0ms' }}>
        <div className="page-title">{t('settingsTitle')}</div>
        <div className="page-subtitle">{t('settingsSubtitle')}</div>
      </div>

      {/* Language */}
      <div className="settings-section fade-in-up" style={{ animationDelay: '60ms' }}>
        <div className="settings-section-title">{t('language')}</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('languageLabel')}</div>
            <div className="settings-row-desc">{t('languageDesc')}</div>
          </div>
          <select className="form-select" style={{ width: 'auto' }} value={lang} onChange={e => setLang(e.target.value)}>
            <option value="en">{t('english')}</option>
            <option value="ru">{t('russian')}</option>
          </select>
        </div>
      </div>

      {/* Appearance */}
      <div className="settings-section fade-in-up" style={{ animationDelay: '100ms' }}>
        <div className="settings-section-title">{t('appearanceSection')}</div>

        {/* Theme */}
        <div className="settings-row" style={{ marginBottom: 12 }}>
          <div>
            <div className="settings-row-label">{t('themeLabel')}</div>
            <div className="settings-row-desc">{t('themeDesc')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['dark', 'light'].map(th => (
              <button
                key={th}
                className={`btn ${theme === th ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 16px', fontSize: 12 }}
                onClick={() => handleThemeChange(th)}
              >
                {th === 'dark' ? t('themeDark') : t('themeLight')}
              </button>
            ))}
          </div>
        </div>

        {/* Accent color */}
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
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
          {/* Preview button */}
          <div style={{
            width: '100%', padding: '12px 16px', borderRadius: 10,
            background: `linear-gradient(135deg, ${accent}, ${darkenHex(accent, 40)})`,
            color: 'white', fontWeight: 700, fontSize: 13,
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none',
          }}>
            <span>▶</span>
            {lang === 'ru' ? 'Превью кнопки' : 'Preview button'}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="settings-section fade-in-up" style={{ animationDelay: '140ms' }}>
        <div className="settings-section-title">{lang === 'ru' ? 'Управление' : 'Controls'}</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">
              {lang === 'ru' ? 'Навигация кнопками мыши 4 и 5' : 'Mouse buttons 4 & 5 navigation'}
            </div>
            <div className="settings-row-desc">
              {lang === 'ru'
                ? 'Боковые кнопки мыши переключают разделы (назад / вперёд)'
                : 'Side mouse buttons navigate between sections (back / forward)'}
            </div>
          </div>
          <button
            onClick={() => handleMouseNavChange(!mouseNav)}
            style={{
              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: mouseNav ? 'var(--accent)' : 'var(--bg-overlay)',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 2, left: mouseNav ? 22 : 2,
              width: 20, height: 20, borderRadius: '50%', background: 'white',
              transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              display: 'block',
            }} />
          </button>
        </div>
      </div>

      {/* PortableMC Engine */}
      <div className="settings-section fade-in-up" style={{ animationDelay: '180ms' }}>
        <div className="settings-section-title">
          {lang === 'ru' ? 'Движок запуска' : 'Launch Engine'}
        </div>
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
            <div style={{ flex: 1 }}>
              <div className="settings-row-label">PortableMC</div>
              <div className="settings-row-desc">
                {lang === 'ru'
                  ? 'Надёжный Python-инструмент для запуска Minecraft. Правильно обрабатывает ники, ресурсы, Fabric и т.д.'
                  : 'Reliable Python-based Minecraft launcher. Properly handles usernames, assets, Fabric, etc.'}
              </div>
            </div>
            {/* Status badge */}
            {pmcReady === null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12 }}>
                <Loader2 size={14} className="download-icon" />
                {lang === 'ru' ? 'Проверка…' : 'Checking…'}
              </div>
            )}
            {pmcReady === true && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#22c55e', fontSize: 12, fontWeight: 700 }}>
                <CheckCircle2 size={16} />
                {lang === 'ru' ? 'Готово' : 'Ready'}
              </div>
            )}
            {pmcReady === false && !pmcInstalling && (
              <button
                className="btn btn-primary"
                style={{ fontSize: 12, padding: '8px 14px', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}
                onClick={handleSetupPmc}
              >
                <Download size={14} />
                {lang === 'ru' ? 'Установить' : 'Install'}
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
                <XCircle size={14} /> {lang === 'ru' ? 'Ошибка установки' : 'Install error'}
              </div>
              <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: 11 }}>{pmcError}</div>
              <button
                className="btn btn-secondary"
                style={{ marginTop: 10, fontSize: 11, padding: '4px 10px' }}
                onClick={handleSetupPmc}
              >
                {lang === 'ru' ? 'Повторить' : 'Retry'}
              </button>
            </div>
          )}

          {pmcReady === true && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {lang === 'ru'
                ? '✓ Python + PortableMC установлены. Запуск игры будет работать корректно.'
                : '✓ Python + PortableMC installed. Game launch will work correctly.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
