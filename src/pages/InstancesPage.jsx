import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { useToast } from '../components/ToastProvider';
import { useTranslation } from '../i18n';
import { 
  Plus, Gamepad2, Download, Trash2, HardDrive, 
  PackageOpen, CheckCircle2, Loader2, Settings2, FolderOpen,
  ChevronDown, ChevronUp, Minus, Settings, Check,
  Zap, Leaf, Flame, Gem, Globe, Mountain, Sword, Crosshair, Skull, Moon
} from 'lucide-react';

const LOADER_COLORS = {
  vanilla: 'chip-vanilla',
  fabric:  'chip-fabric',
  forge:   'chip-forge',
  quilt:   'chip-quilt',
  neoforge:'chip-neoforge',
};

const INSTANCE_ICONS_MAP = {
  Zap: <Zap />, Leaf: <Leaf />, Flame: <Flame />, Gem: <Gem />,
  Globe: <Globe />, Mountain: <Mountain />, Sword: <Sword />,
  Crosshair: <Crosshair />, Skull: <Skull />, Moon: <Moon />
};

function CreateInstanceModal({ initialData, onClose, onCreated }) {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [name, setName] = useState(initialData?.name || '');
  const [mcVersions, setMcVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(initialData?.minecraft_version || '');
  
  const [loader, setLoader] = useState(initialData?.loader || 'vanilla');
  const [loaderVersions, setLoaderVersions] = useState(initialData?.loader_version ? [initialData.loader_version] : []);
  const [loaderVersion, setLoaderVersion] = useState(initialData?.loader_version || 'latest');
  const [fetchingLoaders, setFetchingLoaders] = useState(false);
  
  const [memory, setMemory] = useState(initialData?.memory_mb || 2048);
  const [icon, setIcon] = useState(initialData?.icon || 'Zap');
  const [customPath, setCustomPath] = useState(initialData?.custom_path || '');
  const [jvmArgs, setJvmArgs] = useState(initialData?.jvm_args || '');
  const [launchBehavior, setLaunchBehavior] = useState(initialData?.launch_behavior || 'hide');
  const [openConsole, setOpenConsole] = useState(initialData?.open_console ?? false);
  
  const [snapshots, setSnapshots] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingVersions, setFetchingVersions] = useState(true);
  const [error, setError] = useState('');

  const [showIcons, setShowIcons] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => { loadVersions(); }, [snapshots]);

  useEffect(() => {
    if (loader !== 'vanilla' && selectedVersion) {
      loadLoaderVersions(loader, selectedVersion);
    } else {
      setLoaderVersions([]);
      setLoaderVersion('latest');
    }
  }, [loader, selectedVersion]);

  async function loadVersions() {
    setFetchingVersions(true);
    try {
      const versions = await invoke('get_minecraft_versions', { includeSnapshots: snapshots });
      setMcVersions(versions);
      if (versions.length > 0 && !selectedVersion) setSelectedVersion(versions[0].id);
    } catch (e) {
      addToast('Failed to fetch versions: ' + e, 'error');
    } finally {
      setFetchingVersions(false);
    }
  }

  async function loadLoaderVersions(selectedLoader, gameVer) {
    setFetchingLoaders(true);
    try {
      const versions = await invoke('get_loader_versions', { loader: selectedLoader, gameVersion: gameVer });
      if (versions.length > 0) {
        setLoaderVersions(versions);
        if (!initialData || loader !== initialData.loader || selectedVersion !== initialData.minecraft_version) {
           setLoaderVersion(versions[0]);
        }
      } else {
        setLoaderVersions(['latest']);
        setLoaderVersion('latest');
      }
    } catch (e) {
      addToast('Failed to fetch loader versions: ' + e, 'error');
      setLoaderVersions(['latest']);
      setLoaderVersion('latest');
    } finally {
      setFetchingLoaders(false);
    }
  }

  async function handleBrowse() {
    try {
      const defaultPath = await invoke('get_default_instances_dir');
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath,
        title: 'Select custom instance folder'
      });
      if (selected) {
        setCustomPath(selected);
      }
    } catch (e) {
      addToast('Error selecting folder: ' + e, 'error');
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError(t('nameRequired')); return; }
    if (!selectedVersion) { setError(t('selectVersion')); return; }
    setLoading(true);
    try {
      let instance;
      if (initialData) {
        instance = await invoke('edit_instance', {
          instanceId: initialData.id,
          name: name.trim(),
          minecraftVersion: selectedVersion,
          loader: loader,
          loaderVersion: loaderVersion !== 'latest' ? loaderVersion : null,
          memoryMb: memory,
          icon: icon,
          customPath: customPath.trim() !== '' ? customPath.trim() : null,
          jvmArgs: jvmArgs.trim() !== '' ? jvmArgs.trim() : null,
          launchBehavior,
          openConsole,
        });
        addToast(`Instance "${instance.name}" updated!`, 'success');
      } else {
        instance = await invoke('create_instance', {
          name: name.trim(),
          minecraftVersion: selectedVersion,
          loader: loader,
          loaderVersion: loaderVersion !== 'latest' ? loaderVersion : null,
          memoryMb: memory,
          icon: icon,
          customPath: customPath.trim() !== '' ? customPath.trim() : null,
          jvmArgs: jvmArgs.trim() !== '' ? jvmArgs.trim() : null,
          launchBehavior,
          openConsole,
        });
        addToast(`Instance "${instance.name}" created!`, 'success');
      }
      onCreated(instance);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" style={{ width: 540 }}>
        <div className="modal-title">{initialData ? t('editInstance') : t('newInstance')}</div>
        <div className="modal-subtitle">Configure your Minecraft installation</div>
        <form onSubmit={handleCreate}>
          
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'flex-start' }}>
            <div style={{ position: 'relative' }}>
              <button 
                type="button"
                onClick={() => setShowIcons(!showIcons)}
                style={{
                  width: 54, height: 54, border: '1px solid var(--border)', borderRadius: 12,
                  background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-overlay))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  color: 'var(--text-primary)', transition: 'all 0.2s',
                  boxShadow: showIcons ? '0 0 0 2px var(--accent)' : 'none'
                }}
              >
                {React.cloneElement(INSTANCE_ICONS_MAP[icon], { size: 28 })}
              </button>
              
              {showIcons && (
                <div style={{
                  position: 'absolute', top: 60, left: 0, zIndex: 10,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6,
                  boxShadow: 'var(--shadow-lg)'
                }}>
                  {Object.keys(INSTANCE_ICONS_MAP).map(iconKey => (
                    <button
                      key={iconKey} type="button"
                      onClick={() => { setIcon(iconKey); setShowIcons(false); }}
                      style={{
                        width: 36, height: 36, border: 'none', borderRadius: 8,
                        background: icon === iconKey ? 'var(--accent-dim)' : 'transparent', 
                        cursor: 'pointer', color: 'var(--text-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      {React.cloneElement(INSTANCE_ICONS_MAP[iconKey], { size: 18 })}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label" htmlFor="instance-name">Instance Name</label>
              <input
                id="instance-name"
                className="form-input"
                placeholder="My World"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={32}
                autoFocus
                autoComplete="off" spellCheck="false" data-form-type="other"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('loader')}</label>
              <select className="form-select" value={loader} onChange={e => setLoader(e.target.value)}>
                <option value="vanilla">Vanilla</option>
                <option value="fabric">Fabric</option>
                <option value="forge">Forge</option>
                <option value="quilt">Quilt</option>
                <option value="neoforge">NeoForge</option>
              </select>
            </div>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                {t('gameVersion')}
                <label style={{ fontSize: 9, color: 'var(--text-muted)', cursor: 'pointer', float: 'right', marginTop: 3 }}>
                  <input type="checkbox" checked={snapshots} onChange={e => setSnapshots(e.target.checked)} style={{ marginRight: 2, transform: 'scale(0.8)' }} />
                  {t('snaps')}
                </label>
              </label>
              <select className="form-select" value={selectedVersion} onChange={e => setSelectedVersion(e.target.value)} disabled={fetchingVersions}>
                {fetchingVersions && mcVersions.length === 0
                  ? <option>{t('loading')}</option>
                  : mcVersions.map(v => <option key={v.id} value={v.id}>{v.id}{v.version_type === 'snapshot' ? ' (Sn)' : ''}</option>)
                }
                {initialData && !mcVersions.find(v => v.id === selectedVersion) && (
                  <option value={selectedVersion}>{selectedVersion}</option>
                )}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('loaderVersion')}</label>
              <select className="form-select" value={loaderVersion} onChange={e => setLoaderVersion(e.target.value)} disabled={loader === 'vanilla' || fetchingLoaders}>
                {loader === 'vanilla' ? (
                  <option value="latest">N/A</option>
                ) : fetchingLoaders && loaderVersions.length === 0 ? (
                  <option value="latest">{t('loading')}</option>
                ) : loaderVersions.length === 0 ? (
                  <option value="latest">Latest</option>
                ) : (
                  loaderVersions.map(v => <option key={v} value={v}>{v}</option>)
                )}
              </select>
            </div>
          </div>

          <div style={{ 
            border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-overlay)', 
            marginBottom: 20, overflow: 'hidden'
          }}>
            <button 
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer',
                fontWeight: 600, fontSize: 12, letterSpacing: 0.5
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings2 size={16} color="var(--text-muted)" />
                {t('techSettings')}
              </span>
              {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            
            {showAdvanced && (
              <div style={{ padding: '0 16px 16px 16px', borderTop: '1px solid var(--border)' }}>
                <div className="form-group" style={{ marginTop: 16 }}>
                  <label className="form-label">
                    {t('memory')}: <strong style={{ color: 'var(--accent-bright)' }}>{memory} MB</strong> ({(memory / 1024).toFixed(1)} GB)
                  </label>
                  <input
                    type="range" className="range-slider"
                    min={512} max={16384} step={512} value={memory} onChange={e => setMemory(Number(e.target.value))}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }} className="form-hint">
                    <span>512 MB</span><span>16 GB</span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('customPath')}</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="form-input" placeholder={t('default') + ": .minecraft/instances/..."}
                      value={customPath} onChange={e => setCustomPath(e.target.value)}
                      autoComplete="off" spellCheck="false" data-form-type="other"
                    />
                    <button type="button" className="btn btn-secondary btn-icon" title={t('browse')} onClick={handleBrowse}>
                      <FolderOpen size={16} />
                    </button>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{t('customJvm')}</label>
                  <input
                    className="form-input" placeholder="-XX:+UseG1GC ..."
                    value={jvmArgs} onChange={e => setJvmArgs(e.target.value)}
                    autoComplete="off" spellCheck="false" data-form-type="other"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0, marginTop: 16 }}>
                  <label className="form-label">{t('launchBehaviorLabel')}</label>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{t('launchBehaviorDesc')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { value: 'keep_open', label: t('launchBehaviorKeepOpen') },
                      { value: 'hide',      label: t('launchBehaviorHide') },
                      { value: 'close',     label: t('launchBehaviorClose') },
                    ].map(opt => (
                      <label
                        key={opt.value}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                          border: `1px solid ${launchBehavior === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                          background: launchBehavior === opt.value
                            ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                            : 'transparent',
                          transition: 'all 0.15s',
                        }}
                      >
                        <input
                          type="radio"
                          name="launchBehaviorCreate"
                          value={opt.value}
                          checked={launchBehavior === opt.value}
                          onChange={() => setLaunchBehavior(opt.value)}
                          style={{ accentColor: 'var(--accent)', width: 14, height: 14, cursor: 'pointer' }}
                        />
                        <span style={{
                          fontSize: 12,
                          color: launchBehavior === opt.value ? 'var(--accent-bright)' : 'var(--text-secondary)',
                          fontWeight: launchBehavior === opt.value ? 600 : 400,
                        }}>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Open console after launch */}
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 8,
                  border: `1px solid ${openConsole ? 'var(--accent)' : 'var(--border)'}`,
                  background: openConsole ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                  cursor: 'pointer', transition: 'all 0.15s',
                }} onClick={() => setOpenConsole(v => !v)}>
                  <input
                    type="checkbox"
                    checked={openConsole}
                    onChange={e => setOpenConsole(e.target.checked)}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14, cursor: 'pointer' }}
                    onClick={e => e.stopPropagation()}
                  />
                  <span style={{ fontSize: 12, color: openConsole ? 'var(--accent-bright)' : 'var(--text-secondary)', fontWeight: openConsole ? 600 : 400 }}>
                    {t('openConsoleAfterLaunch') || 'Open console log window after launch'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
            <button
              id="create-instance-submit"
              type="submit"
              className="btn btn-primary"
              disabled={loading || fetchingVersions}
            >
              {initialData ? <Check size={16} /> : <Plus size={16} />} {loading ? t('loading') : initialData ? t('edit') : t('create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DownloadModal({ instance, progress, started, onClose, startDownload }) {
  const { t } = useTranslation();
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ textAlign: 'center', position: 'relative' }}>
        
        <button 
          onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          title="Minimize to background"
        >
          <Minus size={20} />
        </button>

        <div className="modal-title">Install {instance.name}</div>
        <div className="modal-subtitle">Download Minecraft {instance.minecraft_version}</div>

        {!started && (
          <>
            <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center', color: 'var(--accent-bright)' }}>
              <PackageOpen size={64} strokeWidth={1} />
            </div>
            <div style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 13 }}>
              This will download the game files, libraries, and assets (~500 MB)
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
              <button id="start-download-btn" className="btn btn-primary" onClick={startDownload}>
                <Download size={16} /> {t('startDownload')}
              </button>
            </div>
          </>
        )}

        {started && progress && (
          <div className="download-stage">
            {progress.done ? (
              <>
                <CheckCircle2 size={64} color="var(--green)" strokeWidth={1.5} />
                <div className="download-label">Installation complete!</div>
              </>
            ) : (
              <>
                <Loader2 size={48} className="download-icon" color="var(--accent)" strokeWidth={1.5} />
                <div className="download-label">{progress.stage}</div>
                <div className="download-sub">{progress.percent.toFixed(1)}%</div>
                <div style={{ width: '100%' }}>
                  <div className="loader-bar">
                    <div className="loader-bar-fill" style={{ width: `${progress.percent}%` }} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        {started && !progress && (
          <div className="download-stage">
            <Loader2 size={48} className="download-icon" color="var(--accent)" strokeWidth={1.5} />
            <div className="download-label">Connecting…</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InstancesPage({ activeAccount, activeInstance, setActiveInstance, onEditInstance }) {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [instances, setInstances] = useState([]);
  const [runningIds, setRunningIds] = useState(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [downloadTarget, setDownloadTarget] = useState(null);
  const [activeDownloads, setActiveDownloads] = useState({});
  const [mcVersions, setMcVersions] = useState([]);
  const [downloadedVersions, setDownloadedVersions] = useState([]);

  useEffect(() => {
    loadInstances();
    loadVersions();
    loadRunning();
    loadDownloadedVersions();
    
    const unlistenStart = listen('instance-started', ({ payload }) => setRunningIds(s => new Set([...s, payload.launch_id])));
    const unlistenStop  = listen('instance-stopped', ({ payload }) => setRunningIds(s => { const n = new Set(s); n.delete(payload.launch_id); return n; }));
    
    const unlistenProgress = listen('download-progress', ({ payload }) => {
      setActiveDownloads(prev => {
        const next = { ...prev };
        next[payload.instance_id] = payload;
        if (payload.done) {
          if (!payload.error) addToast(`Installation complete!`, 'success');
          if (payload.error) addToast('Download failed: ' + payload.error, 'error');
          setTimeout(() => {
            setActiveDownloads(cur => { const cleaned = { ...cur }; delete cleaned[payload.instance_id]; return cleaned; });
            setDownloadTarget(current => { if (current && current.id === payload.instance_id && !payload.error) return null; return current; });
          }, 1500);
        }
        return next;
      });
    });

    return () => { 
      unlistenStart.then(f => f()); 
      unlistenStop.then(f => f()); 
      unlistenProgress.then(f => f());
    };
  }, []);

  async function loadInstances() {
    try { 
      const insts = await invoke('get_instances');
      setInstances(insts); 
      if (insts.length > 0 && !activeInstance) {
        setActiveInstance(insts[0]);
      }
    } catch (e) { addToast('Failed to load instances', 'error'); }
  }
  async function loadVersions() {
    try { setMcVersions(await invoke('get_minecraft_versions', { includeSnapshots: false })); } catch {}
  }
  async function loadRunning() {
    try {
      const running = await invoke('get_running_instances');
      setRunningIds(new Set(running.map(r => r.instance_id)));
    } catch {}
  }

  async function loadDownloadedVersions() {
    try {
      const versions = await invoke('get_downloaded_versions');
      setDownloadedVersions(versions);
    } catch (e) {
      console.error('Failed to load downloaded versions:', e);
    }
  }

  async function handleDelete(e, id, name) {
    e.stopPropagation();
    if (!confirm(`${t('deleteConfirm')} "${name}"?`)) return;
    try {
      await invoke('delete_instance', { instanceId: id });
      setInstances(prev => prev.filter(i => i.id !== id));
      if (activeInstance?.id === id) setActiveInstance(null);
      addToast(`"${name}" deleted`, 'success');
    } catch (err) {
      addToast(String(err), 'error');
    }
  }

  async function startDownload(instance) {
    const versionMeta = mcVersions.find(v => v.id === instance.minecraft_version);
    if (!versionMeta) {
      addToast('Version metadata not found. Check your internet.', 'error');
      return;
    }
    setActiveDownloads(prev => ({ ...prev, [instance.id]: { stage: 'Connecting…', percent: 0, done: false } }));
    try {
      await invoke('download_instance', {
        instanceId: instance.id,
        instanceName: instance.name,
        customPath: instance.custom_path,
        versionId: instance.minecraft_version,
        versionUrl: versionMeta.url,
        loader: instance.loader || null,
        loaderVersion: instance.loader_version || null,
      });
    } catch (err) {
      addToast('Download error: ' + err, 'error');
      setActiveDownloads(prev => { const next = { ...prev }; delete next[instance.id]; return next; });
    }
    // Refresh downloaded versions after a download finishes
    loadDownloadedVersions();
  }

  const formatLoader = (l) => l ? l.charAt(0).toUpperCase() + l.slice(1).toLowerCase() : '';

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">{t('instances')}</div>
          <div className="page-subtitle">{instances.length} {t('configured')}</div>
        </div>
        <button id="new-instance-btn" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> {t('newInstance')}
        </button>
      </div>

      {instances.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Gamepad2 size={48} opacity={0.5} /></div>
          <div className="empty-title">{t('noInstances')}</div>
          <div className="empty-desc">{t('createFirst')}</div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> {t('createFirstBtn')}
          </button>
        </div>
      ) : (
        <div className="instances-grid">          
          <div className="add-instance-card" id="add-instance-shortcut" onClick={() => setShowCreate(true)} style={{ minHeight: 140 }}>
            <div className="add-instance-icon"><Plus size={32} /></div>
            <div className="add-instance-label">{t('newInstance')}</div>
          </div>
          {instances.map((inst, idx) => {
            const downloadProgress = activeDownloads[inst.id];
            const isSelected = activeInstance?.id === inst.id;
            
            return (
              <div
                key={inst.id}
                className={`instance-card ${isSelected ? 'selected' : ''}`}
                id={`instance-card-${inst.id}`}
                onClick={() => setActiveInstance(inst)}
                style={{
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? 'var(--accent)' : 'var(--border)'
                }}
              >

                
                <div className="instance-card-header">
                  <div className="instance-card-icon">
                    {INSTANCE_ICONS_MAP[inst.icon] ? React.cloneElement(INSTANCE_ICONS_MAP[inst.icon], { size: 28 }) : <Gamepad2 size={28} />}
                  </div>
                  <div className="instance-card-info">
                    <div className="instance-card-name" title={inst.name}>{inst.name}</div>
                    <div className="instance-card-badges">
                      <span className={`chip ${LOADER_COLORS[inst.loader?.toLowerCase()] || 'chip-vanilla'}`}>
                        {formatLoader(inst.loader)}
                      </span>
                      <span className="chip" style={{ background: 'var(--bg-overlay)', color: 'var(--text-secondary)' }}>
                        {inst.minecraft_version}
                      </span>
                      <span className="chip" style={{ background: 'var(--bg-overlay)', color: 'var(--text-secondary)' }}>
                        <HardDrive size={10} style={{ marginRight: 2 }} /> {inst.memory_mb} {t('ram')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="instance-card-actions" style={{ position: 'relative', marginTop: 'auto' }}>
                  {downloadProgress && (
                    <div 
                      style={{ flex: 1, background: 'var(--bg-overlay)', borderRadius: 8, padding: '4px 8px', border: '1px solid var(--border-accent)', cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); setDownloadTarget(inst); }}
                      title="Click to open download view"
                    >
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-bright)', marginBottom: 2 }}>
                        {downloadProgress.done ? 'Finishing...' : `${t('installing')} ${downloadProgress.percent.toFixed(0)}%`}
                      </div>
                      <div className="loader-bar" style={{ marginTop: 0, height: 4 }}>
                        <div className="loader-bar-fill" style={{ width: `${downloadProgress.percent}%` }} />
                      </div>
                    </div>
                  )}
                  
                  {!downloadProgress && (
                    <>
                      {!downloadedVersions.includes(inst.minecraft_version) && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ flex: 1 }}
                          id={`download-${inst.id}`}
                          title="Install / Download"
                          onClick={(e) => { e.stopPropagation(); setDownloadTarget(inst); }}
                        >
                          <Download size={14} />
                        </button>
                      )}
                      <button
                        className="btn btn-secondary btn-sm btn-icon"
                        style={downloadedVersions.includes(inst.minecraft_version) ? { flex: 1 } : {}}
                        title="Edit instance"
                        onClick={(e) => { e.stopPropagation(); onEditInstance(inst); }}
                      >
                        <Settings size={14} />
                      </button>
                      <button
                        className="btn btn-danger btn-sm btn-icon"
                        id={`delete-${inst.id}`}
                        title="Delete instance"
                        onClick={(e) => handleDelete(e, inst.id, inst.name)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}


        </div>
      )}

      {showCreate && (
        <CreateInstanceModal
          onClose={() => setShowCreate(false)}
          onCreated={inst => { 
            setShowCreate(false); 
            setInstances(prev => [...prev, inst]); 
            setActiveInstance(inst);
            setDownloadTarget(inst); 
          }}
        />
      )}

      {downloadTarget && (
        <DownloadModal
          instance={downloadTarget}
          progress={activeDownloads[downloadTarget.id]}
          started={!!activeDownloads[downloadTarget.id]}
          onClose={() => setDownloadTarget(null)}
          startDownload={() => startDownload(downloadTarget)}
        />
      )}
    </div>
  );
}
