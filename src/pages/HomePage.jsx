import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../i18n';
import { fetchMinecraftNews, translateToRu } from '../utils/news';
import {
  Play, Clock, Camera, ChevronRight,
  ArrowLeft, ExternalLink, Globe, Loader2, Server,
  Sparkles, TrendingUp, X
} from 'lucide-react';
import {
  initStats, getTotalHours, getMostPlayedInstance, getFirstLaunch, getLastPlayedId
} from '../utils/stats';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  } catch { return iso; }
}
function tagColor(tag) {
  return { release: 'var(--green)', snapshot: 'var(--yellow)', article: 'var(--accent)' }[tag] || 'var(--accent)';
}
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── Smart overflow text ──────────────────────────────────────────────────────
function SmartText({ text, style = {} }) {
  const ref = useRef(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  return (
    <span ref={ref} title={overflow ? text : undefined}
      style={{ display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: overflow ? 'ellipsis' : 'clip', ...style }}>
      {text}
    </span>
  );
}

// ─── Translation cache ────────────────────────────────────────────────────────
const translCache = {};
async function getTranslated(id, title, summary) {
  if (translCache[id]) return translCache[id];
  const [t, s] = await Promise.all([translateToRu(title), translateToRu(summary || '')]);
  translCache[id] = { title: t, summary: s };
  return translCache[id];
}

// ─── Fullscreen Screenshot Lightbox ───────────────────────────────────────────
function ScreenshotLightbox({ src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,0.15)', border: 'none',
          color: 'white', width: 36, height: 36, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: 18, zIndex: 1001, transition: 'background 0.15s',
        }}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
        onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
      >
        <X size={18} />
      </button>
      <img
        src={src}
        onClick={e => e.stopPropagation()}
        alt="Screenshot"
        style={{
          maxWidth: '90vw', maxHeight: '90vh',
          borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}
// ─── Article Detail View ──────────────────────────────────────────────────────
function ArticleView({ article, onBack, lang }) {
  const { t } = useTranslation();
  const [translatedBody, setTranslatedBody] = useState(null);
  const [translatedTitle, setTranslatedTitle] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [isTranslated, setIsTranslated] = useState(false);

  const rawBody = stripHtml(article.body) || article.summary || '';
  const needsTrans = lang === 'ru' && article.lang === 'en';

  useEffect(() => {
    setTranslatedBody(null);
    setTranslatedTitle(null);
    setIsTranslated(false);

    if (needsTrans) {
      setTranslating(true);

      // Use pre-cached translated title from the news list if available
      const titlePromise = article.translatedTitle
        ? Promise.resolve(article.translatedTitle)
        : translateToRu(article.title);

      // Always translate the body fresh (it's not cached in news list)
      const bodyText = rawBody.slice(0, 1500);
      const bodyPromise = bodyText.length > 3
        ? translateToRu(bodyText)
        : Promise.resolve(bodyText);

      Promise.all([titlePromise, bodyPromise])
        .then(([title, body]) => {
          console.log('[ArticleView] Translation result:', { title: title?.slice(0,50), body: body?.slice(0,50) });
          setTranslatedTitle(title);
          setTranslatedBody(body);
          setIsTranslated(true);
        })
        .catch(err => console.warn('[ArticleView] Translation failed:', err))
        .finally(() => setTranslating(false));
    }
  }, [article.id, lang]);

  const displayTitle = (needsTrans && translatedTitle) ? translatedTitle : article.title;
  const displayBody = (needsTrans && translatedBody) ? translatedBody : rawBody;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Sticky header — top:0 relative to .content-area scroll */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--bg-surface)',
        margin: '-28px -32px 24px -32px',
        padding: '12px 32px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
        backdropFilter: 'blur(8px)',
      }}>
        <button className="btn btn-secondary btn-icon" onClick={onBack}>
          <ArrowLeft size={16} />
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: 13, flexShrink: 0 }}>{t('newsTitle')}</span>
        <ChevronRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {article.title}
        </span>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
        {article.image && (
          <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 24, maxHeight: 280 }}>
            <img src={article.image} alt={article.title}
              style={{ width: '100%', objectFit: 'cover', display: 'block' }}
              onError={e => { e.target.style.display = 'none'; }} />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.8,
            background: `color-mix(in srgb, ${tagColor(article.tag)} 15%, transparent)`,
            color: tagColor(article.tag)
          }}>{article.tag || 'release'}</span>
          {article.date && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(article.date)}</span>}
          {needsTrans && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
              display: 'flex', alignItems: 'center', gap: 4
            }}>
              <Globe size={10} />
              {translating ? t('translating') : isTranslated ? t('translated') : t('translating')}
            </span>
          )}
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16, lineHeight: 1.3 }}>
          {displayTitle}
          {translating && <Loader2 size={16} style={{ marginLeft: 8, display: 'inline-block', animation: 'spin 1s linear infinite' }} />}
        </h1>

        <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {displayBody || <span style={{ color: 'var(--text-muted)' }}>{translating ? t('translating') : '—'}</span>}
        </div>

        {article.url && (
          <button
            className="btn btn-secondary"
            style={{ marginTop: 24, display: 'inline-flex', gap: 8, alignItems: 'center' }}
            onClick={() => openUrl(article.url)}
          >
            <ExternalLink size={14} /> {t('readOnWeb')}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Full News List Page ──────────────────────────────────────────────────────
function NewsPage({ articles, onBack, onSelectArticle, lang, loading }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--bg-surface)',
        margin: '-28px -32px 24px -32px',
        padding: '12px 32px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
        backdropFilter: 'blur(8px)',
      }}>
        <button className="btn btn-secondary btn-icon" onClick={onBack}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{t('newsTitle')}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{t('newsSubtitle')}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12, color: 'var(--text-muted)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          {t('loadingNews')}
        </div>
      ) : articles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">{t('newsEmpty')}</div>
          <div className="empty-desc">{t('newsEmptyDesc')}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {articles.map((a, i) => (
            <NewsCard key={a.id} article={a} lang={lang} delay={i * 30} onClick={() => onSelectArticle(a)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Single News Card ─────────────────────────────────────────────────────────
function NewsCard({ article, lang, delay = 0, onClick, compact = false }) {
  const { t } = useTranslation();
  const showTitle = (lang === 'ru' && article.translatedTitle) ? article.translatedTitle : article.title;
  const showSummary = (lang === 'ru' && article.translatedSummary) ? article.translatedSummary : article.summary;
  const hasTranslation = lang === 'ru' && article.translatedTitle && article.translatedTitle !== article.title;
  return (
    <div className="news-card fade-in-up" style={{ animationDelay: `${delay}ms`, cursor: 'pointer' }} onClick={onClick}>
      {article.image && !compact && (
        <div className="news-card-img">
          <img src={article.image} alt={article.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.parentElement.style.display = 'none'; }} />
        </div>
      )}
      <div className="news-card-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.8,
            background: `color-mix(in srgb, ${tagColor(article.tag)} 15%, transparent)`,
            color: tagColor(article.tag)
          }}>{article.tag || 'release'}</span>
          {article.date && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(article.date)}</span>}
          {hasTranslation && (
            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Globe size={9} /> {t('translated')}
            </span>
          )}
        </div>
        <div className="news-card-title">{showTitle}</div>
        {!compact && showSummary && <div className="news-card-summary">{showSummary}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, color: 'var(--accent-secondary-bright)', fontSize: 12, fontWeight: 600 }}>
          {t('readMore')} <ChevronRight size={13} />
        </div>
      </div>
    </div>
  );
}

// ─── Stats Hero Card ──────────────────────────────────────────────────────────
function StatsHeroCard({ instances, activeInstance, onPlayInstance, t }) {
  const [totalHours, setTotalHours] = useState('0.0');
  const [mostPlayed, setMostPlayed] = useState(null);
  const [firstLaunch, setFirstLaunch] = useState(null);
  const [lastId, setLastId] = useState(null);
  const [screenshot, setScreenshot] = useState(null);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    getTotalHours().then(setTotalHours);
    getMostPlayedInstance().then(setMostPlayed);
    getFirstLaunch().then(setFirstLaunch);
    getLastPlayedId().then(setLastId);
  }, []);

  const lastInstance = instances?.find(i => i.id === lastId) || activeInstance;
  const daysSince = firstLaunch ? Math.floor((Date.now() - new Date(firstLaunch)) / 86_400_000) : null;

  useEffect(() => {
    if (!instances || instances.length === 0) return;
    loadLatestScreenshot(instances);
  }, [instances]);

  async function loadLatestScreenshot(insts) {
    const ordered = lastId
      ? [insts.find(i => i.id === lastId), ...insts.filter(i => i.id !== lastId)].filter(Boolean)
      : insts;
    for (const inst of ordered) {
      try {
        const dataUrl = await invoke('get_instance_screenshot', {
          instanceName: inst.name,
          customPath: inst.custom_path || null,
        });
        if (dataUrl) {
          setScreenshot({ dataUrl, instanceName: inst.name });
          return;
        }
      } catch {}
    }
  }

  return (
    <>
      {lightbox && screenshot && <ScreenshotLightbox src={screenshot.dataUrl} onClose={() => setLightbox(false)} />}
      <div className="home-stats-card fade-in-up" style={{ animationDelay: '0ms' }}>
        <div className="home-stats-header">
          <div className="home-stats-badge"><Sparkles size={12} /> YoloLauncher</div>
          {daysSince !== null && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('daysWithUs').replace('{n}', daysSince)}</span>}
        </div>

        <div className="home-stats-grid">
          {/* Hours */}
          <div className="home-stat-item">
            <div className="home-stat-icon" style={{ color: 'var(--accent-secondary-bright)' }}><Clock size={18} /></div>
            <div className="home-stat-value">{totalHours}h</div>
            <div className="home-stat-label">{t('totalPlayTime')}</div>
          </div>

          {/* Most played */}
          <div className="home-stat-item">
            <div className="home-stat-icon" style={{ color: 'var(--yellow)' }}><TrendingUp size={18} /></div>
            <SmartText text={mostPlayed ? mostPlayed.name : '—'}
              style={{ fontSize: mostPlayed ? 13 : 20, fontWeight: 800, color: 'var(--text-primary)', maxWidth: '100%' }} />
            <div className="home-stat-label">{t('mostPlayed')}</div>
            {mostPlayed && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{mostPlayed.hours}h</div>}
          </div>

          {/* Screenshot */}
          <div className="home-stat-item home-screenshot-slot"
            style={{ padding: 0, overflow: 'hidden', cursor: screenshot ? 'zoom-in' : 'default' }}
            onClick={() => screenshot && setLightbox(true)}
          >
            {screenshot ? (
              <div style={{ width: '100%', height: '100%', position: 'relative', minHeight: 80 }}>
                <img src={screenshot.dataUrl} alt="screenshot"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                  padding: '6px 8px', fontSize: 10, color: 'white', fontWeight: 600
                }}>
                  {t('latestScreenshot')}
                  <div style={{ fontSize: 9, opacity: 0.8 }}>{t('screenshotFrom').replace('{name}', screenshot.instanceName)}</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 14, gap: 6 }}>
                <Camera size={18} color="var(--text-muted)" />
                <div className="home-stat-label" style={{ textAlign: 'center' }}>{t('rememberMoment')}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('noScreenshots')}</div>
              </div>
            )}
          </div>
        </div>

        {lastInstance && (
          <div className="home-continue-bar">
            <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{t('continuePlaying')}</span>
              <SmartText text={lastInstance.name} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', maxWidth: '100%' }} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{lastInstance.minecraft_version}</span>
            </div>
            <button
              className="btn btn-primary"
              style={{ gap: 8, paddingLeft: 20, paddingRight: 20, flexShrink: 0 }}
              onClick={() => onPlayInstance(lastInstance)}
            >
              <Play size={16} fill="currentColor" /> {t('play')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Helpers for relative date ────────────────────────────────────────────────
function formatRelativeDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diffMs = now - d;
  const diffHrs = Math.floor(diffMs / 3600000);
  if (diffHrs < 1) {
    const mins = Math.floor(diffMs / 60000);
    return `${mins}м назад`;
  }
  if (diffHrs < 24) return `${diffHrs}ч назад`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(d);
}

// ─── Servers Teaser ───────────────────────────────────────────────────────────
function ServersTeaser({ t, onGoServers, instances, activeInstance }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const inst = activeInstance || instances?.[0];
    if (!inst) {
      setLoading(false);
      return;
    }
    setLoading(true);
    invoke('get_servers_summary', {
      instanceName: inst.name,
      customPath: inst.custom_path || null,
    })
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [activeInstance, instances]);

  const hasServers = summary && summary.total_count > 0;

  return (
    <div className="home-servers-teaser fade-in-up" style={{ animationDelay: '120ms' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <Server size={18} color="var(--accent-secondary-bright)" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{t('serversTitle')}</div>
            {loading ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>—</div>
            ) : hasServers && summary.last_server ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 1, overflow: 'hidden' }}>
                <span style={{
                  fontSize: 11, color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {t('serversLastServer')}: {summary.last_server.ip}
                </span>
                {summary.last_server.last_seen && (
                  <span style={{
                    fontSize: 10, color: 'var(--text-muted)', flexShrink: 0,
                    background: 'var(--bg-surface)', padding: '1px 6px', borderRadius: 6,
                  }}>
                    {formatRelativeDate(summary.last_server.last_seen)}
                  </span>
                )}
              </div>
            ) : hasServers ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                {summary.total_count} {t('serversAdded')}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{t('serversTeaser')}</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {hasServers && (
            <div style={{
              fontSize: 16, fontWeight: 800, color: 'var(--accent-secondary-bright)',
              lineHeight: 1,
            }}>
              {summary.total_count}
            </div>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onGoServers} style={{ gap: 6 }}>
            {t('open')} <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main HomePage ────────────────────────────────────────────────────────────
export default function HomePage({ instances, activeInstance, setActiveInstance, onLaunch, setPage }) {
  const { t, lang } = useTranslation();
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsOpen, setNewsOpen] = useState(true);
  const [view, setView] = useState('home');
  const [selectedArticle, setSelectedArticle] = useState(null);

  useEffect(() => {
    initStats(); // async — runs in background, no await needed here
    loadNews();
  }, []);

  async function loadNews() {
    setNewsLoading(true);
    try {
      const articles = await fetchMinecraftNews();
      setNews(articles);

      if (lang === 'ru' && articles.length > 0) {
        const toTranslate = articles.slice(0, 8);
        for (const article of toTranslate) {
          getTranslated(article.id, article.title, article.summary).then(tr => {
            setNews(prev => prev.map(a =>
              a.id === article.id
                ? { ...a, translatedTitle: tr.title, translatedSummary: tr.summary }
                : a
            ));
          });
        }
      }
    } catch (e) {
      console.error('[HomePage] News load failed:', e);
    } finally {
      setNewsLoading(false);
    }
  }

  if (view === 'news') {
    return (
      <div className="page">
        <NewsPage
          articles={news} lang={lang} loading={newsLoading}
          onBack={() => setView('home')}
          onSelectArticle={a => { setSelectedArticle(a); setView('article'); }}
        />
      </div>
    );
  }
  if (view === 'article' && selectedArticle) {
    return (
      <div className="page">
        <ArticleView article={selectedArticle} lang={lang} onBack={() => setView('news')} />
      </div>
    );
  }

  const recentNews = news.slice(0, 3);

  return (
    <div className="page home-page-new" style={{ paddingBottom: 32 }}>
      <StatsHeroCard
        instances={instances} activeInstance={activeInstance}
        onPlayInstance={inst => { setActiveInstance(inst); onLaunch(inst); }}
        t={t}
      />

      <ServersTeaser t={t} onGoServers={() => setPage('servers')} instances={instances} activeInstance={activeInstance} />

      {/* News block */}
      <div className="home-news-block fade-in-up" style={{ animationDelay: '200ms' }}>
        <div className="home-news-header" onClick={() => setNewsOpen(o => !o)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={16} color="var(--accent-secondary-bright)" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>{t('newsTitle')}</span>
            {newsLoading && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={e => { e.stopPropagation(); setView('news'); }}
            >
              {t('allNews')} <ChevronRight size={12} />
            </button>
            <div className={`collapsible-chevron ${newsOpen ? 'open' : ''}`} style={{ fontSize: 18 }}>▾</div>
          </div>
        </div>

        <div className={`collapsible-body ${newsOpen ? 'open' : ''}`} style={{ maxHeight: newsOpen ? '700px' : '0' }}>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {newsLoading ? (
              [0,1,2].map(i => <div key={i} className="news-card skeleton" style={{ height: 76 }} />)
            ) : recentNews.length === 0 ? (
              <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>{t('newsEmpty')}</div>
            ) : (
              recentNews.map((a, i) => (
                <NewsCard key={a.id} article={a} lang={lang} delay={i * 50} compact
                  onClick={() => { setSelectedArticle(a); setView('article'); }} />
              ))
            )}
            {!newsLoading && news.length > 3 && (
              <button className="btn btn-secondary"
                style={{ alignSelf: 'center', fontSize: 12, padding: '7px 20px', marginTop: 4 }}
                onClick={() => setView('news')}>
                {t('allNews')} ({news.length})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
