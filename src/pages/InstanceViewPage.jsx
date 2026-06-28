import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from '../i18n';
import { useToast } from '../components/ToastProvider';
import {
  ArrowLeft, Home, Settings as SettingsIcon, Package, Layers,
  Image as ImageIcon, Globe2, Camera, Zap, Leaf, Flame, Gem,
  Globe, Mountain, Sword, Crosshair, Skull, Moon, Save,
  RefreshCw, AlertTriangle, FolderOpen, FileText,
} from 'lucide-react';
import ModsTab from './tabs/ModsTab';
import { ResourcePacksTab, ShadersTab, WorldsTab } from './tabs/ContentTabs';
import ScreenshotsTab from './tabs/ScreenshotsTab';
import LogsTab from './tabs/LogsTab';

const INSTANCE_ICONS_MAP = {
  Zap:<Zap/>, Leaf:<Leaf/>, Flame:<Flame/>, Gem:<Gem/>,
  Globe:<Globe/>, Mountain:<Mountain/>, Sword:<Sword/>,
  Crosshair:<Crosshair/>, Skull:<Skull/>, Moon:<Moon/>,
};

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric'}).format(new Date(iso)); }
  catch { return iso; }
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  try { return new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)); }
  catch { return iso; }
}

export default function InstanceViewPage({ instance, onBack, onInstanceUpdate }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('home');

  const tabs = [
    { id:'home',          icon:<Home size={16}/>,          label:t('tabOverview') },
    { id:'settings',      icon:<SettingsIcon size={16}/>,  label:t('settings') },
    { id:'mods',          icon:<Package size={16}/>,       label:t('tabMods') },
    { id:'resourcepacks', icon:<Layers size={16}/>,        label:t('tabResourcepacks') },
    { id:'shaders',       icon:<ImageIcon size={16}/>,     label:t('tabShaders') },
    { id:'worlds',        icon:<Globe2 size={16}/>,        label:t('tabWorlds') },
    { id:'screenshots',   icon:<Camera size={16}/>,        label:t('tabScreenshots') },
    { id:'logs',          icon:<FileText size={16}/>,      label:t('tabLogs') },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:16, padding:'24px 32px 0 32px' }}>
        <button className="btn btn-secondary btn-icon" onClick={onBack}><ArrowLeft size={16}/></button>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:48, height:48, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,var(--bg-elevated),var(--bg-overlay))', border:'1px solid var(--border)', color:'var(--accent)' }}>
            {INSTANCE_ICONS_MAP[instance.icon]
              ? React.cloneElement(INSTANCE_ICONS_MAP[instance.icon], {size:24})
              : <Zap size={24}/>}
          </div>
          <div>
            <div className="page-title">{instance.name}</div>
            <div className="page-subtitle">{instance.minecraft_version} · {instance.loader?.charAt(0).toUpperCase()+(instance.loader?.slice(1).toLowerCase()??'')}</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display:'flex', flex:1, overflow:'hidden', marginTop:24 }}>
        {/* Sidebar */}
        <div style={{ width:210, borderRight:'1px solid var(--border)', padding:'0 12px', display:'flex', flexDirection:'column', gap:2 }}>
          {tabs.map(tab => (
            <button key={tab.id} className={`nav-item ${activeTab===tab.id?'active':''}`}
              style={{ padding:'9px 12px', fontSize:13, gap:10 }}
              onClick={() => setActiveTab(tab.id)}>
              {React.cloneElement(tab.icon, {className:'nav-icon'})}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, padding:'0 28px 28px 28px', overflowY:'auto' }}>
          {activeTab==='home'         && <InstanceHomeTab instance={instance} onInstanceUpdate={onInstanceUpdate}/>}
          {activeTab==='settings'     && <InstanceSettingsTab instance={instance} onInstanceUpdate={onInstanceUpdate}/>}
          {activeTab==='mods'         && <ModsTab instance={instance}/>}
          {activeTab==='resourcepacks'&& <ResourcePacksTab instance={instance}/>}
          {activeTab==='shaders'      && <ShadersTab instance={instance}/>}
          {activeTab==='worlds'       && <WorldsTab instance={instance}/>}
          {activeTab==='screenshots'  && <ScreenshotsTab instance={instance}/>}
          {activeTab==='logs'         && <LogsTab instance={instance}/>}
        </div>
      </div>
    </div>
  );
}

// ─── Home Tab ────────────────────────────────────────────────────────────────
function InstanceHomeTab({ instance, onInstanceUpdate }) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [latestLoaderVersion, setLatestLoaderVersion] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [description, setDescription] = useState(instance.description || '');
  const [savingDesc, setSavingDesc] = useState(false);

  const loader = instance.loader?.toLowerCase?.() ?? 'vanilla';
  const isVanilla = loader === 'vanilla';

  useEffect(() => {
    setDescription(instance.description || '');
    if (isVanilla) return;
    setCheckingUpdate(true);
    invoke('get_loader_versions', { loader, gameVersion: instance.minecraft_version })
      .then(vs => { if (vs?.length) setLatestLoaderVersion(vs[0]); })
      .catch(() => {}).finally(() => setCheckingUpdate(false));
  }, [instance.id]);

  const hasUpdate = !isVanilla && latestLoaderVersion && instance.loader_version && latestLoaderVersion !== instance.loader_version;

  async function handleUpdateLoader() {
    if (!latestLoaderVersion) return;
    setUpdating(true);
    try {
      const updated = await invoke('edit_instance', {
        instanceId:instance.id, name:instance.name,
        minecraftVersion:instance.minecraft_version, loader,
        loaderVersion:latestLoaderVersion, memoryMb:instance.memory_mb,
        icon:instance.icon, customPath:instance.custom_path||null,
        jvmArgs:instance.jvm_args||null, launchBehavior:instance.launch_behavior,
        openConsole:instance.open_console, description:instance.description||null,
      });
      addToast(t('instanceUpdated'), 'success');
      onInstanceUpdate(updated);
      setLatestLoaderVersion(null);
    } catch (e) { addToast(String(e),'error'); } finally { setUpdating(false); }
  }

  async function saveDescription() {
    setSavingDesc(true);
    try {
      const updated = await invoke('edit_instance', {
        instanceId:instance.id, name:instance.name,
        minecraftVersion:instance.minecraft_version,
        loader:instance.loader?.toLowerCase?.(),
        loaderVersion:instance.loader_version||null, memoryMb:instance.memory_mb,
        icon:instance.icon, customPath:instance.custom_path||null,
        jvmArgs:instance.jvm_args||null, launchBehavior:instance.launch_behavior,
        openConsole:instance.open_console, description:description||null,
      });
      onInstanceUpdate(updated);
      addToast(t('descriptionSaved'), 'success');
    } catch (e) { addToast(String(e),'error'); } finally { setSavingDesc(false); }
  }

  const loaderName = loader.charAt(0).toUpperCase()+loader.slice(1);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18, paddingTop:8 }}>
      {/* Hero card */}
      <div style={{ padding:22, borderRadius:16, border:'1px solid var(--border)', background:'linear-gradient(135deg,color-mix(in srgb,var(--accent) 5%,var(--bg-elevated)),var(--bg-elevated))' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
          <InfoField label={t('createdAt')} value={fmtDate(instance.created_at)} />
          <InfoField label={t('lastPlayed')} value={fmtDateTime(instance.last_played)} />
          <InfoField label={t('version')} value={`${instance.minecraft_version} · ${loaderName}${instance.loader_version ? ' '+instance.loader_version : ''}`} />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="form-label" style={{ marginBottom:8 }}>{t('description')}</label>
        <textarea
          className="form-input"
          placeholder={t('descriptionPlaceholder')}
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          style={{ resize:'vertical', lineHeight:1.5, fontFamily:'inherit', fontSize:13 }}
        />
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
          <button className="btn btn-primary btn-sm" onClick={saveDescription} disabled={savingDesc || description===(instance.description||'')}>
            <Save size={13}/> {t('save')}
          </button>
        </div>
      </div>

      {/* Loader update banner */}
      {!isVanilla && !checkingUpdate && hasUpdate && (
        <div style={{ padding:'13px 16px', borderRadius:12, border:'1px solid rgba(251,191,36,.35)', background:'rgba(251,191,36,.08)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <AlertTriangle size={16} color="var(--yellow)"/>
            <div>
              <div style={{ fontSize:13, fontWeight:700 }}>{t('loaderUpdateAvailable')}</div>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                {t('loaderUpdateDesc').replace('{current}',instance.loader_version).replace('{latest}',latestLoaderVersion)}
              </div>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleUpdateLoader} disabled={updating} style={{ gap:6, flexShrink:0 }}>
            {updating && <RefreshCw size={12} style={{ animation:'spin 1s linear infinite' }}/>}
            {t('loaderUpdateBtn')}
          </button>
        </div>
      )}

      {/* Open folder button */}
      <button className="btn btn-secondary" style={{ alignSelf:'flex-start', gap:6, fontSize:12 }}
        onClick={() => invoke('open_instance_folder', { instanceName:instance.name, customPath:instance.custom_path||null, subFolder:null })}>
        <FolderOpen size={13}/> {t('openInstanceFolder')}
      </button>
    </div>
  );
}

function InfoField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

// ─── Settings Tab ────────────────────────────────────────────────────────────
function InstanceSettingsTab({ instance, onInstanceUpdate }) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [name, setName]                 = useState(instance.name);
  const [loader, setLoader]             = useState(instance.loader?.toLowerCase?.() ?? 'vanilla');
  const [loaderVersion, setLoaderVersion] = useState(instance.loader_version||'latest');
  const [selectedVersion, setSelectedVersion] = useState(instance.minecraft_version);
  const [memory, setMemory]             = useState(instance.memory_mb);
  const [icon, setIcon]                 = useState(instance.icon||'Zap');
  const [customPath, setCustomPath]     = useState(instance.custom_path||'');
  const [jvmArgs, setJvmArgs]           = useState(instance.jvm_args||'');
  const [launchBehavior, setLaunchBehavior] = useState(instance.launch_behavior||'hide');
  const [openConsole, setOpenConsole]   = useState(instance.open_console??false);
  const [mcVersions, setMcVersions]     = useState([]);
  const [loaderVersions, setLoaderVersions] = useState(instance.loader_version ? [instance.loader_version] : []);
  const [snapshots, setSnapshots]       = useState(false);
  const [fetchingVersions, setFetchingVersions] = useState(true);
  const [fetchingLoaders, setFetchingLoaders]   = useState(false);
  const [loading, setLoading]           = useState(false);
  const [showIcons, setShowIcons]       = useState(false);

  useEffect(() => {
    setFetchingVersions(true);
    invoke('get_minecraft_versions', { includeSnapshots: snapshots })
      .then(setMcVersions).catch(() => {}).finally(() => setFetchingVersions(false));
  }, [snapshots]);

  useEffect(() => {
    if (loader === 'vanilla') { setLoaderVersions([]); setLoaderVersion('latest'); return; }
    if (!selectedVersion) return;
    setFetchingLoaders(true);
    invoke('get_loader_versions', { loader, gameVersion: selectedVersion })
      .then(vs => { setLoaderVersions(vs.length ? vs : ['latest']); if (!vs.length) setLoaderVersion('latest'); })
      .catch(() => { setLoaderVersions(['latest']); setLoaderVersion('latest'); })
      .finally(() => setFetchingLoaders(false));
  }, [loader, selectedVersion]);

  async function handleBrowse() {
    const defaultPath = await invoke('get_default_instances_dir').catch(() => null);
    const sel = await open({ directory:true, multiple:false, defaultPath });
    if (sel) setCustomPath(sel);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) return addToast(t('nameRequired'),'error');
    setLoading(true);
    try {
      const updated = await invoke('edit_instance', {
        instanceId:instance.id, name:name.trim(), minecraftVersion:selectedVersion,
        loader, loaderVersion:loaderVersion!=='latest'?loaderVersion:null,
        memoryMb:memory, icon, customPath:customPath.trim()||null,
        jvmArgs:jvmArgs.trim()||null, launchBehavior, openConsole,
        description:instance.description||null,
      });
      addToast(t('instanceUpdated'),'success');
      onInstanceUpdate(updated);
    } catch (e) { addToast(String(e),'error'); } finally { setLoading(false); }
  }

  const BEHAVIORS = [
    { value:'keep_open', label:t('launchBehaviorKeepOpen') },
    { value:'hide',      label:t('launchBehaviorHide')     },
    { value:'close',     label:t('launchBehaviorClose')    },
  ];

  return (
    <form onSubmit={handleSave} style={{ maxWidth:580 }}>
      {/* Icon + Name */}
      <div style={{ display:'flex', gap:14, marginBottom:16, alignItems:'flex-start' }}>
        <div style={{ position:'relative' }}>
          <button type="button" onClick={() => setShowIcons(v=>!v)} style={{
            width:52, height:52, border:'1px solid var(--border)', borderRadius:12,
            background:'linear-gradient(135deg,var(--bg-elevated),var(--bg-overlay))',
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
            color:'var(--text-primary)', boxShadow:showIcons?'0 0 0 2px var(--accent)':'none',
          }}>
            {React.cloneElement(INSTANCE_ICONS_MAP[icon]||<Zap/>, {size:26})}
          </button>
          {showIcons && (
            <div style={{ position:'absolute', top:58, left:0, zIndex:10, background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:12, padding:8, display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6, boxShadow:'var(--shadow-lg)' }}>
              {Object.keys(INSTANCE_ICONS_MAP).map(k => (
                <button key={k} type="button" onClick={() => { setIcon(k); setShowIcons(false); }}
                  style={{ width:34, height:34, border:'none', borderRadius:8, cursor:'pointer', background:icon===k?'var(--accent-dim)':'transparent', color:'var(--text-primary)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {React.cloneElement(INSTANCE_ICONS_MAP[k], {size:16})}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="form-group" style={{ flex:1, marginBottom:0 }}>
          <label className="form-label">{t('editInstance')}</label>
          <input className="form-input" value={name} onChange={e=>setName(e.target.value)} maxLength={32}/>
        </div>
      </div>

      {/* Version grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">{t('loader')}</label>
          <select className="form-select" value={loader} onChange={e=>setLoader(e.target.value)}>
            <option value="vanilla">Vanilla</option>
            <option value="fabric">Fabric</option>
            <option value="forge">Forge</option>
            <option value="quilt">Quilt</option>
            <option value="neoforge">NeoForge</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label" style={{ display:'flex', justifyContent:'space-between' }}>
            {t('gameVersion')}
            <label style={{ fontSize:9, color:'var(--text-muted)', cursor:'pointer', display:'flex', alignItems:'center', gap:3 }}>
              <input type="checkbox" checked={snapshots} onChange={e=>setSnapshots(e.target.checked)} style={{ transform:'scale(0.8)' }}/>
              {t('snapshots')}
            </label>
          </label>
          <select className="form-select" value={selectedVersion} onChange={e=>setSelectedVersion(e.target.value)} disabled={fetchingVersions}>
            {fetchingVersions && mcVersions.length===0 ? <option>{t('loading')}</option>
              : mcVersions.map(v=><option key={v.id} value={v.id}>{v.id}{v.version_type==='snapshot'?' (Sn)':''}</option>)}
            {instance && !mcVersions.find(v=>v.id===selectedVersion) && <option value={selectedVersion}>{selectedVersion}</option>}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">{t('loaderVersion')}</label>
          <select className="form-select" value={loaderVersion} onChange={e=>setLoaderVersion(e.target.value)} disabled={loader==='vanilla'||fetchingLoaders}>
            {loader==='vanilla' ? <option value="latest">N/A</option>
              : loaderVersions.map(v=><option key={v} value={v}>{v==='latest'?'Latest':v}</option>)}
          </select>
        </div>
      </div>

      {/* Memory */}
      <div className="form-group">
        <label className="form-label">{t('memory')}: <strong style={{color:'var(--accent-bright)'}}>{memory} MB</strong></label>
        <input type="range" className="range-slider" min={512} max={16384} step={512} value={memory} onChange={e=>setMemory(Number(e.target.value))}/>
      </div>

      {/* Custom path */}
      <div className="form-group">
        <label className="form-label">{t('customPath')}</label>
        <div style={{ display:'flex', gap:8 }}>
          <input className="form-input" style={{ flex:1 }} placeholder={t('default')} value={customPath} onChange={e=>setCustomPath(e.target.value)}/>
          <button type="button" className="btn btn-secondary" onClick={handleBrowse}>{t('browse')}</button>
        </div>
      </div>

      {/* JVM */}
      <div className="form-group">
        <label className="form-label">JVM Arguments</label>
        <input className="form-input" placeholder="-XX:+UseG1GC..." value={jvmArgs} onChange={e=>setJvmArgs(e.target.value)}/>
      </div>

      {/* Launch behavior */}
      <div className="form-group">
        <label className="form-label">{t('launchBehaviorLabel')}</label>
        <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8 }}>{t('launchBehaviorDesc')}</div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {BEHAVIORS.map(opt => (
            <label key={opt.value} style={{
              display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, cursor:'pointer',
              border:`1px solid ${launchBehavior===opt.value?'var(--accent)':'var(--border)'}`,
              background:launchBehavior===opt.value?'color-mix(in srgb,var(--accent) 10%,transparent)':'var(--bg-overlay)',
              transition:'all .15s',
            }}>
              <input type="radio" name="lb" value={opt.value} checked={launchBehavior===opt.value}
                onChange={()=>setLaunchBehavior(opt.value)} style={{ accentColor:'var(--accent)', width:14, height:14, cursor:'pointer' }}/>
              <span style={{ fontSize:13, color:launchBehavior===opt.value?'var(--accent-bright)':'var(--text-secondary)', fontWeight:launchBehavior===opt.value?600:400 }}>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Open console */}
      <div className="form-group">
        <div onClick={()=>setOpenConsole(v=>!v)} style={{
          display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, cursor:'pointer',
          border:`1px solid ${openConsole?'var(--accent)':'var(--border)'}`,
          background:openConsole?'color-mix(in srgb,var(--accent) 8%,transparent)':'var(--bg-overlay)',
          transition:'all .15s',
        }}>
          <input type="checkbox" checked={openConsole} onChange={e=>setOpenConsole(e.target.checked)}
            onClick={e=>e.stopPropagation()} style={{ accentColor:'var(--accent)', width:14, height:14, cursor:'pointer' }}/>
          <span style={{ fontSize:13, color:openConsole?'var(--accent-bright)':'var(--text-secondary)', fontWeight:openConsole?600:400 }}>
            {t('openConsoleAfterLaunch')}
          </span>
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:24 }}>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          <Save size={16}/> {loading?t('saving'):t('save')}
        </button>
      </div>
    </form>
  );
}
