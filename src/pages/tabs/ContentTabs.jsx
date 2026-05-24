import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useDialog } from '../../components/DialogProvider';
import { Loader2, FolderOpen, Trash2, Layers, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { McText } from '../../utils/minecraftColors';
import { useToast } from '../../components/ToastProvider';
import { useTranslation } from '../../i18n';

// ─── Resource Packs ──────────────────────────────────────────────────────────
export function ResourcePacksTab({ instance }) {
  const { addToast } = useToast();
  const { confirm } = useDialog();
  const { t } = useTranslation();
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    invoke('list_resourcepacks', { instanceName: instance.name, customPath: instance.custom_path || null })
      .then(setPacks).catch(e => addToast(t('errorGeneric') + ': ' + e, 'error')).finally(() => setLoading(false));
  }, [instance.id]);

  async function del(pack) {
    const yes = await confirm(`${t('deleteResourcepack')} "${pack.name}"?`, { title: t('confirmTitle'), kind: 'warning' });
    if (!yes) return;
    await invoke('delete_content_file', { filePath: pack.path }).catch(e => addToast('' + e, 'error'));
    setPacks(p => p.filter(x => x.path !== pack.path));
  }

  return <GridTab items={packs} loading={loading} emptyIcon={<Layers size={40}/>} emptyTitle={t('noResourcepacks')}
    renderCard={item => <ResourceCard item={item} onDelete={() => del(item)} />}
    onOpenFolder={() => invoke('open_instance_folder', { instanceName: instance.name, customPath: instance.custom_path||null, subFolder: 'resourcepacks' })}
    folderLabel={t('openResourcepacks')} />;
}

function ResourceCard({ item, onDelete }) {
  return (
    <div style={cardStyle}>
      <div style={previewStyle}>
        {item.icon ? <img src={item.icon} alt="" style={imgStyle} />
          : <ImageIcon size={28} style={{ color: 'var(--text-muted)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <McText text={item.name} />
        </div>
        {item.description && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <McText text={item.description} />
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{item.size_fmt}</div>
      </div>
      <DeleteBtn onClick={onDelete} />
    </div>
  );
}

// ─── Shaders ─────────────────────────────────────────────────────────────────
export function ShadersTab({ instance }) {
  const { addToast } = useToast();
  const { confirm } = useDialog();
  const { t } = useTranslation();
  const [shaders, setShaders] = useState([]);
  const [mods, setMods]       = useState([]);
  const [loading, setLoading] = useState(true);
  const loader = instance.loader?.toLowerCase?.() ?? 'vanilla';

  useEffect(() => {
    setLoading(true);
    Promise.all([
      invoke('list_shaders', { instanceName: instance.name, customPath: instance.custom_path||null }),
      invoke('list_mods',    { instanceName: instance.name, customPath: instance.custom_path||null }),
    ]).then(([s, m]) => { setShaders(s); setMods(m); }).catch(e => addToast('' + e, 'error')).finally(() => setLoading(false));
  }, [instance.id]);

  const modNames = mods.map(m => m.name.toLowerCase());
  const hasShaderMod = modNames.some(n => n.includes('iris') || n.includes('oculus') || n.includes('optifine') || n.includes('optifabric'));
  const recommended = (loader === 'forge') ? 'Oculus' : 'Iris';

  async function del(sh) {
    const yes = await confirm(`${t('deleteShader')} "${sh.name}"?`, { title: t('confirmTitle'), kind: 'warning' });
    if (!yes) return;
    await invoke('delete_content_file', { filePath: sh.path }).catch(e => addToast('' + e, 'error'));
    setShaders(p => p.filter(x => x.path !== sh.path));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {!hasShaderMod && !loading && (
        <div style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(251,191,36,.35)', background: 'rgba(251,191,36,.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertTriangle size={16} color="var(--yellow)" />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {t('shaderModMissing')} <strong style={{ color: 'var(--yellow)' }}>{recommended}</strong> {t('shaderModFor')}
          </span>
        </div>
      )}
      <ListTab items={shaders} loading={loading} emptyIcon={<ImageIcon size={40}/>} emptyTitle={t('noShaders')}
        renderRow={item => (
          <div style={rowStyle} key={item.path}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}><McText text={item.name} /></div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.size_fmt}</span>
            <DeleteBtn onClick={() => del(item)} />
          </div>
        )}
        onOpenFolder={() => invoke('open_instance_folder', { instanceName: instance.name, customPath: instance.custom_path||null, subFolder: 'shaderpacks' })}
        folderLabel={t('openShaders')} />
    </div>
  );
}

// ─── Worlds ──────────────────────────────────────────────────────────────────
export function WorldsTab({ instance }) {
  const { addToast } = useToast();
  const { confirm } = useDialog();
  const { t } = useTranslation();
  const [worlds, setWorlds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    invoke('list_worlds', { instanceName: instance.name, customPath: instance.custom_path||null })
      .then(setWorlds).catch(e => addToast('' + e, 'error')).finally(() => setLoading(false));
  }, [instance.id]);

  async function del(w) {
    const yes = await confirm(`${t('deleteWorld').replace('(irreversible!)','').replace('(необратимо!)','').trim()} "${w.name}"?`, { title: t('confirmTitle'), kind: 'warning' });
    if (!yes) return;
    await invoke('delete_content_file', { filePath: w.path }).catch(e => addToast('' + e, 'error'));
    setWorlds(p => p.filter(x => x.path !== w.path));
  }

  return <GridTab items={worlds} loading={loading} emptyIcon={<span style={{fontSize:40}}>🌍</span>} emptyTitle={t('noWorlds')}
    renderCard={item => <WorldCard item={item} onDelete={() => del(item)} t={t} />}
    onOpenFolder={() => invoke('open_instance_folder', { instanceName: instance.name, customPath: instance.custom_path||null, subFolder: 'saves' })}
    folderLabel={t('openWorlds')} />;
}

function WorldCard({ item, onDelete, t }) {
  return (
    <div style={cardStyle}>
      <div style={previewStyle}>
        {item.icon ? <img src={item.icon} alt="" style={imgStyle} />
          : <span style={{ fontSize: 28 }}>🌍</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><McText text={item.name} /></div>
        {item.last_played && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{t('lastPlayed2')}: {fmtDate(item.last_played)}</div>}
        {item.created_at  && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('created2')}: {fmtDate(item.created_at)}</div>}
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.size_fmt}</div>
      </div>
      <DeleteBtn onClick={onDelete} />
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  try { return new Intl.DateTimeFormat(undefined, {day:'numeric',month:'short',year:'numeric'}).format(new Date(iso)); }
  catch { return iso; }
}

const cardStyle = {
  display: 'flex', alignItems: 'center', padding: 10,
  borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--bg-elevated)', gap: 0, transition: 'border-color .15s',
};
const previewStyle = {
  width: 52, height: 52, borderRadius: 8, flexShrink: 0,
  background: 'var(--bg-overlay)', border: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
};
const imgStyle = { width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' };
const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)' };

function DeleteBtn({ onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseOver={() => setHov(true)} onMouseOut={() => setHov(false)}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', color: hov ? '#f87171' : 'var(--text-muted)', transition: 'color .1s' }}>
      <Trash2 size={14} />
    </button>
  );
}

// ─── Generic GridTab ─────────────────────────────────────────────────────────
function GridTab({ items, loading, emptyIcon, emptyTitle, renderCard, onOpenFolder, folderLabel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" style={{ gap: 6, fontSize: 12 }} onClick={onOpenFolder}>
          <FolderOpen size={13} /> {folderLabel}
        </button>
      </div>
      {loading ? (
        <div style={{ display:'flex',alignItems:'center',justifyContent:'center',flex:1 }}>
          <Loader2 size={28} style={{ animation:'spin 1s linear infinite', color:'var(--text-muted)' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">{emptyIcon}</div><div className="empty-title">{emptyTitle}</div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, overflowY: 'auto' }}>
          {items.map((item, i) => <div key={i}>{renderCard(item)}</div>)}
        </div>
      )}
    </div>
  );
}

// ─── Generic ListTab ─────────────────────────────────────────────────────────
function ListTab({ items, loading, emptyIcon, emptyTitle, renderRow, onOpenFolder, folderLabel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" style={{ gap: 6, fontSize: 12 }} onClick={onOpenFolder}>
          <FolderOpen size={13} /> {folderLabel}
        </button>
      </div>
      {loading ? (
        <div style={{ display:'flex',alignItems:'center',justifyContent:'center',flex:1 }}>
          <Loader2 size={28} style={{ animation:'spin 1s linear infinite', color:'var(--text-muted)' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">{emptyIcon}</div><div className="empty-title">{emptyTitle}</div></div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6, overflowY:'auto' }}>
          {items.map((item, i) => <React.Fragment key={i}>{renderRow(item)}</React.Fragment>)}
        </div>
      )}
    </div>
  );
}
