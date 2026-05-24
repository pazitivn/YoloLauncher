import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useDialog } from '../../components/DialogProvider';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Loader2, FolderOpen, Upload, Trash2, Package, Search, SortAsc } from 'lucide-react';
import { McText } from '../../utils/minecraftColors';
import { useToast } from '../../components/ToastProvider';
import { useTranslation } from '../../i18n';

const SORT_KEYS = ['alpha','newest','oldest','size'];

function sortMods(mods, sort) {
  const arr = [...mods];
  if (sort === 'alpha')  return arr.sort((a,b) => a.name.localeCompare(b.name));
  if (sort === 'size')   return arr.sort((a,b) => b.size - a.size);
  if (sort === 'newest') return arr.sort((a,b) => (b.modified_at||'').localeCompare(a.modified_at||''));
  if (sort === 'oldest') return arr.sort((a,b) => (a.modified_at||'').localeCompare(b.modified_at||''));
  return arr;
}

export default function ModsTab({ instance }) {
  const { addToast } = useToast();
  const { confirm } = useDialog();
  const { t } = useTranslation();
  const [mods, setMods]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [sort, setSort]       = useState('alpha');
  const [dragOver, setDragOver] = useState(false);
  const [flashGreen, setFlashGreen] = useState(false);
  const dropRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const data = await invoke('list_mods', {
        instanceName: instance.name,
        customPath: instance.custom_path || null,
      });
      setMods(data);
    } catch (e) { addToast(t('errorLoadingMods') + ': ' + e, 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [instance.id]);

  // Tauri drag-drop
  useEffect(() => {
    let unlisten;
    getCurrentWebviewWindow().onDragDropEvent(async (ev) => {
      if (ev.payload.type === 'over') { setDragOver(true); return; }
      if (ev.payload.type === 'leave') { setDragOver(false); return; }
      if (ev.payload.type === 'drop') {
        setDragOver(false);
        const jars = (ev.payload.paths || []).filter(p => p.endsWith('.jar'));
        if (!jars.length) return;
        await addFiles(jars);
      }
    }).then(fn => { unlisten = fn; });
    return () => unlisten?.();
  }, [instance.id]);

  async function addFiles(paths) {
    try {
      await invoke('copy_files_to_folder', {
        sourcePaths: paths,
        instanceName: instance.name,
        customPath: instance.custom_path || null,
        subFolder: 'mods',
      });
      setFlashGreen(true);
      setTimeout(() => setFlashGreen(false), 900);
      await load();
    } catch (e) { addToast(t('errorGeneric') + ': ' + e, 'error'); }
  }

  async function handlePickFiles() {
    const downloadsPath = await invoke('get_default_instances_dir').catch(() => null);
    const files = await open({ multiple: true, filters: [{ name: 'Minecraft Mod', extensions: ['jar'] }], defaultPath: downloadsPath });
    if (files?.length) await addFiles(Array.isArray(files) ? files : [files]);
  }

  async function handleToggle(mod) {
    try {
      const enabled = await invoke('toggle_mod', { modPath: mod.path });
      setMods(prev => prev.map(m => m.path === mod.path ? { ...m, enabled, path: enabled ? mod.path.replace('.jar.disabled','.jar') : mod.path + '.disabled' } : m));
    } catch (e) { addToast(t('errorGeneric') + ': ' + e, 'error'); }
  }

  async function handleDelete(mod) {
    const yes = await confirm(`${t('deleteMod')} "${mod.name}"?`, { title: t('confirmTitle'), kind: 'warning' });
    if (!yes) return;
    try {
      await invoke('delete_content_file', { filePath: mod.path });
      setMods(prev => prev.filter(m => m.path !== mod.path));
    } catch (e) { addToast(t('errorGeneric') + ': ' + e, 'error'); }
  }

  const filtered = sortMods(
    mods.filter(m => m.name.toLowerCase().includes(search.toLowerCase())),
    sort
  );

  return (
    <div style={{ display: 'flex', gap: 20, height: '100%' }}>
      {/* Left: list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="form-input" placeholder={t('searchMods')} value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 30, height: 34, fontSize: 12 }} />
          </div>
          <select className="form-select" value={sort} onChange={e => setSort(e.target.value)} style={{ width: 160, height: 34, fontSize: 12 }}>
            {SORT_KEYS.map(k => <option key={k} value={k}>{t('sort'+k.charAt(0).toUpperCase()+k.slice(1))}</option>)}
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><Package size={40} opacity={0.4}/></div>
            <div className="empty-title">{search ? t('noModsFound') : t('noMods')}</div>
            <div className="empty-desc">{t('modsDropHint').split('\n').map((l,i)=><span key={i}>{l}{i===0&&<br/>}</span>)}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
            {filtered.map(mod => (
              <div key={mod.path} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                borderRadius: 10, border: '1px solid var(--border)',
                background: mod.enabled ? 'var(--bg-elevated)' : 'var(--bg-base)',
                opacity: mod.enabled ? 1 : 0.5, transition: 'all .15s',
              }}>
                {/* Checkbox */}
                <input type="checkbox" checked={mod.enabled} onChange={() => handleToggle(mod)}
                  style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }} />
                {/* Icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  {mod.icon
                    ? <img src={mod.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }} />
                    : <Package size={18} style={{ color: 'var(--text-muted)' }} />}
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <McText text={mod.name} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                    {mod.version && <span>{mod.version}</span>}
                    <span>{mod.size_fmt}</span>
                    {!mod.enabled && <span style={{ color: 'var(--yellow)' }}>{t('modDisabled')}</span>}
                  </div>
                </div>
                {/* Delete */}
                <button onClick={() => handleDelete(mod)} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 4, borderRadius: 6, display: 'flex',
                  transition: 'color .1s',
                }} onMouseOver={e => e.currentTarget.style.color = '#f87171'}
                   onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: actions */}
      <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn btn-secondary" style={{ width: '100%', gap: 6, fontSize: 12 }}
          onClick={() => invoke('open_instance_folder', { instanceName: instance.name, customPath: instance.custom_path || null, subFolder: 'mods' })}>
          <FolderOpen size={13} /> {t('openModsFolder')}
        </button>

        {/* Drop zone */}
        <div
          ref={dropRef}
          onClick={handlePickFiles}
          style={{
            border: `2px dashed ${flashGreen ? '#4ade80' : dragOver ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 12, padding: '24px 12px', textAlign: 'center', cursor: 'pointer',
            background: flashGreen ? 'rgba(74,222,128,.08)' : dragOver ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : 'var(--bg-overlay)',
            transition: 'all .2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            height: 250, justifyContent: 'center',
          }}
        >
          <Upload size={22} style={{ color: dragOver || flashGreen ? 'var(--accent)' : 'var(--text-muted)' }} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {t('modsDropHint').split('\n').map((l,i)=><span key={i}>{l}{i===0&&<br/>}</span>)}
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
          {t('modCount').replace('{n}', mods.length)}
        </div>
      </div>
    </div>
  );
}
