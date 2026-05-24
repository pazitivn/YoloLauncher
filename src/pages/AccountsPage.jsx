import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../components/ToastProvider';
import { useTranslation } from '../i18n';
import {
  Plus, Lock, Key, Trash2, Users, ChevronDown, ChevronUp,
  Maximize2, Play, Pause, RefreshCw, Check, AlertCircle,
  Download, Shield, User, Loader, Globe, Crown, Sparkles
} from 'lucide-react';
import { SkinViewer3D } from '../components/SkinViewer3D';


// ─── Add Account Modal ───────────────────────────────────────────────────────
function AddAccountModal({ onClose, onCreated }) {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const acc = await invoke('add_offline_account', { username: username.trim() });
      addToast(t('accountAdded'), 'success');
      onCreated(acc);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog">
        <div className="modal-title">{t('addOfflineAccount')}</div>
        <div className="modal-subtitle">{t('addOfflineAccountDesc')}</div>
        <form onSubmit={handleAdd}>
          <div className="form-group">
            <label className="form-label" htmlFor="acc-username">{t('nickname')}</label>
            <input
              id="acc-username"
              className="form-input"
              placeholder="Steve"
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={16}
              autoFocus
              autoComplete="off"
              spellCheck="false"
              data-form-type="other"
            />
            <div className="form-hint">{t('nicknameHint')}</div>
            {error && <div className="form-error">{error}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
            <button
              id="add-account-submit"
              type="submit"
              className="btn btn-primary"
              disabled={loading || username.trim().length < 3}
            >
              {loading ? t('adding') : t('add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Skin Integrations Panel ───────────────────────────────────────────────────
function SkinIntegrationsPanel({ account, onRefresh }) {
  const { addToast } = useToast();
  const [checkedServices, setCheckedServices] = useState([]);
  const [mainService, setMainService] = useState(null);
  const [customUrl, setCustomUrl] = useState('');
  const [elyUser, setElyUser] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (account) {
      setCheckedServices(account.skin_services || []);
      setMainService(account.main_skin_service || null);
      setCustomUrl(account.custom_skin_url || '');
      setElyUser(account.ely_username || '');
    }
  }, [account?.id, account?.skin_services, account?.main_skin_service, account?.custom_skin_url, account?.ely_username]);

  async function saveSettings(services, main, custom, ely) {
    if (!account) return;
    setSaving(true);
    try {
      await invoke('update_account_skin_settings', {
        accountId: account.id,
        skinServices: services,
        mainSkinService: main,
        customSkinUrl: custom || null,
        elyUsername: ely || null,
      });
      onRefresh();
    } catch (err) {
      addToast(String(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleToggleService(service) {
    let nextServices = [...checkedServices];
    if (nextServices.includes(service)) {
      nextServices = nextServices.filter(s => s !== service);
      let nextMain = mainService;
      if (mainService === service) {
        nextMain = nextServices.length > 0 ? nextServices[0] : null;
      }
      setCheckedServices(nextServices);
      setMainService(nextMain);
      saveSettings(nextServices, nextMain, customUrl, elyUser);
      addToast(`${service.toUpperCase()} ${t('skinServicePrimary').toLowerCase()}`, 'success');
    } else {
      nextServices.push(service);
      let nextMain = mainService || service;
      setCheckedServices(nextServices);
      setMainService(nextMain);
      saveSettings(nextServices, nextMain, customUrl, elyUser);
      addToast(`${service.toUpperCase()} connected`, 'success');
    }
  }

  function handleSetMain(service) {
    let nextServices = [...checkedServices];
    if (!nextServices.includes(service)) { nextServices.push(service); }
    setMainService(service);
    setCheckedServices(nextServices);
    saveSettings(nextServices, service, customUrl, elyUser);
    addToast(`${service.toUpperCase()} — ${t('skinServicePrimary')}`, 'success');
  }

  function handleBlurText() {
    saveSettings(checkedServices, mainService, customUrl, elyUser);
  }

  const servicesList = [
    {
      id: 'tls',
      name: 'TLSkins (TLauncher)',
      desc: t('tlsDesc'),
      icon: <Shield size={16} />,
      config: null
    },
    {
      id: 'ely',
      name: 'Ely.by',
      desc: t('elyDesc'),
      icon: <Sparkles size={16} />,
      config: (
        <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 11 }}>{t('elyUsernameLabel')}</label>
          <input
            className="form-input"
            value={elyUser}
            placeholder={account?.username}
            onChange={e => setElyUser(e.target.value)}
            onBlur={handleBlurText}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
            autoComplete="off"
            spellCheck="false"
            data-form-type="other"
          />
        </div>
      )
    },
    {
      id: 'microsoft',
      name: 'Microsoft / Mojang',
      desc: t('microsoftDesc'),
      icon: <Key size={16} />,
      config: null
    },
    {
      id: 'custom',
      name: 'Custom URL',
      desc: t('customDesc'),
      icon: <Globe size={16} />,
      config: (
        <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 11 }}>{t('customUrlLabel')}</label>
          <input
            className="form-input"
            value={customUrl}
            placeholder="https://example.com/skin.png"
            onChange={e => setCustomUrl(e.target.value)}
            onBlur={handleBlurText}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
            autoComplete="off"
            spellCheck="false"
            data-form-type="other"
          />
          {customUrl && !customUrl.toLowerCase().endsWith('.png') && !customUrl.toLowerCase().startsWith('http') && (
            <div className="form-hint" style={{ color: 'var(--red)', marginTop: 4 }}>
              {t('customUrlHint')}
            </div>
          )}
        </div>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="accounts-right-title font-bold text-[14px]">{t('skinSystems')}</div>
          <div className="accounts-right-desc">{t('skinSystemsDesc')}</div>
        </div>
        {saving && <Loader size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-bright)' }} />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {servicesList.map(srv => {
          const isChecked = checkedServices.includes(srv.id);
          const isMain = mainService === srv.id;

          return (
            <div
              key={srv.id}
              className={`skin-integration-card ${isMain ? 'selected-main' : ''}`}
              style={{
                border: isMain ? '1px solid var(--accent-bright)' : '1px solid var(--border)',
                boxShadow: isMain ? '0 0 12px rgba(124,106,247,0.15)' : 'none',
                background: isMain ? 'linear-gradient(160deg, color-mix(in srgb, var(--accent) 3%, var(--bg-elevated)), var(--bg-elevated))' : 'var(--bg-elevated)',
                transition: 'all 0.2s ease',
                borderRadius: 'var(--radius-lg)'
              }}
            >
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', gap: 8, justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleService(srv.id)}
                      style={{
                        width: 16,
                        height: 16,
                        cursor: 'pointer',
                        accentColor: 'var(--accent)'
                      }}
                    />
                    
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                      {srv.icon}
                      {srv.name}
                    </span>
                  </div>

                    <button
                      className={`btn btn-sm ${isMain ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '4px 8px', fontSize: 10, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={() => handleSetMain(srv.id)}
                    >
                      <Crown size={10} style={{ fill: isMain ? 'currentColor' : 'none' }} />
                      {isMain ? t('skinServicePrimary') : t('skinServiceSetPrimary')}
                    </button>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginLeft: 26 }}>
                  {srv.desc}
                </div>

                {isChecked && srv.config && (
                  <div style={{ marginLeft: 26, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                    {srv.config}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── Main Accounts Page ──────────────────────────────────────────────────────
export default function AccountsPage({ accounts, activeAccount, onRefresh }) {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [showAdd, setShowAdd] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [listExpanded, setListExpanded] = useState(false);
  const [skinUrl, setSkinUrl] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  const active = activeAccount || accounts[0] || null;

  useEffect(() => {
    let activeEffect = true;
    async function loadSkin() {
      if (!active) {
        setSkinUrl(null);
        return;
      }
      const service = active.main_skin_service;
      let url = '';
      if (service === 'tls') {
        url = `https://tlauncher.org/catalog/nickname/download/tlauncher_${encodeURIComponent(active.username)}.png`;
      } else if (service === 'ely') {
        const name = active.ely_username?.trim() || active.username;
        url = `https://skinsystem.ely.by/skins/${encodeURIComponent(name)}.png`;
      } else if (service === 'microsoft') {
        url = `https://mc-heads.net/skin/${encodeURIComponent(active.username)}`;
      } else if (service === 'custom') {
        url = active.custom_skin_url || '';
      } else {
        const services = active.skin_services || [];
        if (services.includes('tls')) {
          url = `https://tlauncher.org/catalog/nickname/download/tlauncher_${encodeURIComponent(active.username)}.png`;
        } else if (services.includes('ely')) {
          const name = active.ely_username?.trim() || active.username;
          url = `https://skinsystem.ely.by/skins/${encodeURIComponent(name)}.png`;
        } else if (services.includes('microsoft')) {
          url = `https://mc-heads.net/skin/${encodeURIComponent(active.username)}`;
        } else if (services.includes('custom') && active.custom_skin_url) {
          url = active.custom_skin_url;
        }
      }

      if (!url) {
        setSkinUrl(null);
        return;
      }

      try {
        const dataUri = await invoke('fetch_skin_bytes', { url });
        if (activeEffect) {
          setSkinUrl(dataUri);
        }
      } catch (err) {
        console.warn('Failed to load skin:', err);
        if (activeEffect) {
          setSkinUrl(null);
        }
      }
    }
    loadSkin();
    return () => {
      activeEffect = false;
    };
  }, [
    active?.id,
    active?.main_skin_service,
    active?.custom_skin_url,
    active?.ely_username,
    active?.username,
    active?.skin_services
  ]);

  const otherAccounts = accounts.filter(a => a.id !== active?.id);
  const visibleOthers = listExpanded ? otherAccounts : otherAccounts.slice(0, 3);

  async function handleSetActive(id) {
    try {
      await invoke('set_active_account', { accountId: id });
      onRefresh();
      addToast(t('activeAccountUpdated'), 'success');
    } catch (err) {
      addToast(String(err), 'error');
    }
  }

  async function handleRemove(id, name) {
    setRemoving(id);
    try {
      await invoke('remove_account', { accountId: id });
      onRefresh();
      addToast(t('accountRemoved'), 'success');
    } catch (err) {
      addToast(String(err), 'error');
    } finally {
      setRemoving(null);
    }
  }

  if (accounts.length === 0) {
    return (
      <div className="page">
        <div className="page-header fade-in-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="page-title">{t('accounts')}</div>
            <div className="page-subtitle">{t('accountsSubtitle')}</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={16} /> {t('addAccount')}
          </button>
        </div>
        <div className="empty-state fade-in-up" style={{ animationDelay: '60ms' }}>
          <div className="empty-icon"><Users size={48} opacity={0.5} /></div>
          <div className="empty-title">{t('noAccounts')}</div>
          <div className="empty-desc">{t('noAccountsDesc')}</div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={16} /> {t('addFirstAccount')}
          </button>
        </div>
        {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); onRefresh(); }} />}
      </div>
    );
  }

  return (
    <div className="page accounts-page-layout">
      {/* ── LEFT COLUMN ── */}
      <div className="accounts-left-col">

        {/* Main active account card */}
        <div className="accounts-main-card fade-in-up" style={{ animationDelay: '0ms' }}>
          <div className="accounts-main-card-header">
            <div className="accounts-active-badge">
              <div className="status-dot online" style={{ width: 6, height: 6 }} />
              {t('activeAccount')}
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
              <Plus size={13} /> {t('addAccount')}
            </button>
          </div>

          {/* 3D Skin Viewer */}
          <div className="accounts-skin-wrap">
            <SkinViewer3D
              skinUrl={skinUrl}
              username={active?.username}
              fullscreen={fullscreen}
              onCloseFullscreen={() => setFullscreen(false)}
            />
            <button
              className="skin-fullscreen-btn"
              onClick={() => setFullscreen(true)}
              title={t('fullscreen')}
            >
              <Maximize2 size={14} />
            </button>
          </div>

          {/* Account info */}
          <div className="accounts-main-info">
            <div className="accounts-main-name">{active?.username ?? '—'}</div>
            <div className="accounts-main-type">
              {active?.account_type === 'offline'
                ? <><Lock size={12} /> {t('accountTypeOffline')}</>
                : <><Key size={12} /> {t('accountTypeMicrosoft')}</>}
            </div>
            <div className="accounts-main-uuid">
              <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>UUID</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>
                {active?.uuid ?? '—'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => active && handleRemove(active.id, active.username)}
                disabled={removing === active?.id}
              >
                {removing === active?.id ? '…' : <><Trash2 size={13} /> {t('deleteAccount')}</>}
              </button>
            </div>
          </div>
        </div>

        {/* Other accounts list */}
        {otherAccounts.length > 0 && (
          <div className="accounts-others-block fade-in-up" style={{ animationDelay: '80ms' }}>
            <div className="accounts-others-title">{t('otherAccounts')}</div>
            <div className="accounts-others-list">
              {visibleOthers.map((acc, idx) => (
                <div
                  key={acc.id}
                  className="account-other-row fade-in-up"
                  style={{ animationDelay: `${idx * 40 + 100}ms` }}
                  onClick={() => handleSetActive(acc.id)}
                >
                  <div className="account-other-avatar">{acc.username[0].toUpperCase()}</div>
                  <div className="account-other-info">
                    <div className="account-other-name">{acc.username}</div>
                    <div className="account-other-meta">
                      {acc.account_type === 'offline' ? <Lock size={10} /> : <Key size={10} />}
                      {acc.account_type === 'offline' ? 'Offline' : 'Microsoft'}
                    </div>
                  </div>
                  <div className="account-other-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className="btn btn-danger btn-sm btn-icon"
                      style={{ width: 28, height: 28 }}
                      disabled={removing === acc.id}
                      onClick={() => handleRemove(acc.id, acc.username)}
                      title={t('deleteAccount')}
                    >
                      {removing === acc.id ? '…' : <Trash2 size={12} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {otherAccounts.length > 3 && (
              <button className="accounts-expand-btn" onClick={() => setListExpanded(e => !e)}>
                {listExpanded
                  ? <><ChevronUp size={14} /> {t('hideList')}</>
                  : <><ChevronDown size={14} /> {t('showMore').replace('{n}', otherAccounts.length - 3)}</>}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div className="accounts-right-col fade-in-up" style={{ animationDelay: '60ms' }}>
        <SkinIntegrationsPanel account={active} onRefresh={onRefresh} />
      </div>


      {showAdd && (
        <AddAccountModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); onRefresh(); }}
        />
      )}
    </div>
  );
}
