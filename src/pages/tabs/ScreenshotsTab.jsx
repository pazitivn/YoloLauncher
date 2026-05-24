import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useDialog } from '../../components/DialogProvider';
import { Loader2, FolderOpen, Trash2, Camera, X } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { useTranslation } from '../../i18n';

export default function ScreenshotsTab({ instance }) {
  const { addToast } = useToast();
  const { confirm } = useDialog();
  const { t } = useTranslation();
  const [shots, setShots]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    setLoading(true);
    invoke('list_screenshots', { instanceName: instance.name, customPath: instance.custom_path || null })
      .then(setShots).catch(e => addToast(''+e,'error')).finally(() => setLoading(false));
  }, [instance.id]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  async function del(shot, e) {
    e.stopPropagation();
    const yes = await confirm(`${t('deleteScreenshot')} "${shot.name}"?`, { title: t('confirmTitle'), kind: 'warning' });
    if (!yes) return;
    await invoke('delete_content_file', { filePath: shot.path }).catch(e => addToast(''+e,'error'));
    setShots(p => p.filter(x => x.path !== shot.path));
    if (lightbox?.path === shot.path) setLightbox(null);
  }

  function fmtDate(iso) {
    try { return new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)); }
    catch { return iso; }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('screenshotCount').replace('{n}', shots.length)}</span>
        <button className="btn btn-secondary" style={{ gap: 6, fontSize: 12 }}
          onClick={() => invoke('open_instance_folder', { instanceName: instance.name, customPath: instance.custom_path||null, subFolder: 'screenshots' })}>
          <FolderOpen size={13} /> {t('openModsFolder')}
        </button>
      </div>

      {loading ? (
        <div style={{ display:'flex',alignItems:'center',justifyContent:'center',flex:1 }}>
          <Loader2 size={28} style={{ animation:'spin 1s linear infinite', color:'var(--text-muted)' }} />
        </div>
      ) : shots.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Camera size={40} opacity={0.4}/></div>
          <div className="empty-title">{t('noScreenshots')}</div>
          <div className="empty-desc">F2</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, overflowY:'auto', paddingBottom:8 }}>
          {shots.map((shot, i) => (
            <div key={i} onClick={() => setLightbox(shot)} style={{
              borderRadius: 12, border: '1px solid var(--border)',
              background: 'var(--bg-elevated)', overflow: 'hidden',
              cursor: 'pointer', transition: 'border-color .15s, transform .15s',
              position: 'relative', display: 'flex', flexDirection: 'column'
            }}
              onMouseOver={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.transform='translateY(-2px)'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='translateY(0)'; }}>
              {/* Image */}
              <div style={{ aspectRatio:'16/9', background:'var(--bg-overlay)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {shot.data
                  ? <img src={shot.data} alt={shot.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  : <Camera size={32} style={{ color:'var(--text-muted)' }} />}
              </div>
              {/* Footer */}
              <div style={{ padding:'8px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', borderTop:'1px solid var(--border)' }}>
                <div style={{ fontSize:12, fontWeight:500, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {shot.name}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                  <button onClick={(e) => del(shot,e)} style={{
                    background:'transparent', border:'none',
                    color:'var(--text-muted)', borderRadius:6, padding:4, cursor:'pointer',
                    display:'flex', alignItems:'center', transition:'color .1s, background .1s'
                  }}
                  onMouseOver={e => { e.currentTarget.style.color='#f87171'; e.currentTarget.style.background='rgba(248,113,113,.12)'; }}
                  onMouseOut={e => { e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.background='transparent'; }}>
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position:'fixed', inset:0, zIndex:9999,
          background:'rgba(0,0,0,.88)', backdropFilter:'blur(12px)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <button onClick={() => setLightbox(null)} style={{
            position:'absolute', top:20, right:20, background:'rgba(255,255,255,.1)',
            border:'none', borderRadius:8, color:'white', cursor:'pointer',
            width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center',
          }}><X size={18}/></button>
          <img src={lightbox.data} alt={lightbox.name} onClick={e=>e.stopPropagation()} style={{
            maxWidth:'90vw', maxHeight:'88vh', borderRadius:10,
            boxShadow:'0 20px 60px rgba(0,0,0,.7)',
          }} />
          <div style={{ position:'absolute', bottom:20, color:'rgba(255,255,255,.5)', fontSize:12 }}>
            {lightbox.name} · {lightbox.size_fmt}
          </div>
        </div>
      )}
    </div>
  );
}
