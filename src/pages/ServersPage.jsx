import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from '../i18n';
import {
  Server, ArrowLeft, ChevronRight, RefreshCw,
  Globe, Users, Gamepad2,
  Zap, Leaf, Flame, Gem, Mountain, Sword, Crosshair, Skull, Moon,
  Clock, Copy, Check,
} from 'lucide-react';
import { McText } from '../utils/minecraftColors';
import { getStatusColor, LOGO_COLORS } from '../utils/servers';

const LOGO_SIZE = 56;

const INSTANCE_ICONS_MAP = {
  Zap: <Zap />, Leaf: <Leaf />, Flame: <Flame />, Gem: <Gem />,
  Globe: <Globe />, Mountain: <Mountain />, Sword: <Sword />,
  Crosshair: <Crosshair />, Skull: <Skull />, Moon: <Moon />
};

function InstanceIcon({ iconKey, size = 16, color = 'currentColor' }) {
  if (INSTANCE_ICONS_MAP[iconKey]) {
    return React.cloneElement(INSTANCE_ICONS_MAP[iconKey], { size, color });
  }
  return <Gamepad2 size={size} color={color} />;
}

function ServerLogo({ name, index, size = LOGO_SIZE, favicon }) {
  const [imgError, setImgError] = useState(false);

  if (favicon && !imgError) {
    return (
      <img
        src={favicon}
        alt={name}
        onError={() => setImgError(true)}
        style={{
          width: size, height: size, borderRadius: 14, flexShrink: 0,
          objectFit: 'contain',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 14, flexShrink: 0,
        background: `linear-gradient(145deg, ${LOGO_COLORS[index % LOGO_COLORS.length]}, ${LOGO_COLORS[(index + 1) % LOGO_COLORS.length]})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontSize: size > 50 ? 22 : 14, fontWeight: 800,
        textTransform: 'uppercase',
        boxShadow: `0 4px 14px ${LOGO_COLORS[index % LOGO_COLORS.length]}44,
                    0 1px 3px rgba(0,0,0,0.2)`,
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      {name.charAt(0)}
    </div>
  );
}

function formatPlayers(online, max, noDataText = 'Нет данных') {
  if (online == null || max == null) return noDataText;
  return `${online.toLocaleString()} / ${max.toLocaleString()}`;
}

function formatLastSeen(dateStr) {
  if (!dateStr || dateStr === '\u2014') return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const diffMs = now - d;
  const diffHrs = Math.floor(diffMs / 3600000);
  if (diffHrs < 1) {
    const mins = Math.floor(diffMs / 60000);
    return `${mins}м назад`;
  }
  if (diffHrs < 24) return `${diffHrs}ч назад`;
  const days = Math.floor(diffHrs / 24);
  if (days < 7) return `${days}д назад`;
  return d.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' });
}

function StatusDot({ online }) {
  return (
    <span
      style={{
        width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
        background: online ? 'var(--green)' : 'var(--text-muted)',
        boxShadow: online ? '0 0 8px rgba(74, 222, 128, 0.6)' : 'none',
        transition: 'background 0.3s, box-shadow 0.3s',
        animation: online ? 'pulse 2s infinite' : 'none',
      }}
    />
  );
}

function formatUpdateTime(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return null; // null means "just now"
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}м назад`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}ч назад`;
  const days = Math.floor(diffHrs / 24);
  if (days < 30) return `${days}д назад`;
  return d.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' });
}

function UpdateStatus({ server, t }) {
  const isOnline = server.status === 'online';
  const hasCachedData = !!server.slp_data;

  if (isOnline) {
    // Green: server responded now
    const timeText = formatUpdateTime(server.last_pinged);
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
          background: 'var(--green)',
          boxShadow: '0 0 6px rgba(74, 222, 128, 0.5)',
        }} />
        {timeText || t('serversUpdateJustNow')}
      </span>
    );
  }

  if (hasCachedData) {
    // Yellow: server has old data but didn't respond now
    const timeText = formatUpdateTime(server.last_pinged);
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--yellow)' }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
          background: 'var(--yellow)',
          boxShadow: '0 0 6px rgba(250, 204, 21, 0.5)',
        }} />
        {timeText || t('serversUpdateJustNow')}
      </span>
    );
  }

  // Red: never got a response
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--red)' }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
        background: 'var(--red)',
        boxShadow: '0 0 6px rgba(248, 113, 113, 0.5)',
      }} />
      {t('serversUpdateNoResponses')}
    </span>
  );
}

/* ─── Server Row Card (macOS-style list row) ─────────────────────────── */
function ServerRowCard({ server, index, onSelect }) {
  const { t } = useTranslation();
  const slp = server.slp_data;
  const isOnline = server.status === 'online';
  const isTimeout = server.status === 'timeout';
  const onlineStr = slp ? formatPlayers(slp.online_players, slp.max_players, t('serversNoData')) : t('serversNoData');
  const versionLabel = slp?.version || t('serversNoData');
  const statusTone = isOnline ? 'good' : 'warn';
  const lastSeen = formatLastSeen(server.last_seen);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="fade-in-up"
      style={{
        animationDelay: `${220 + index * 40}ms`,
        cursor: 'pointer',
      }}
      onClick={() => onSelect(server)}
    >
      <div
        style={{
          borderRadius: 16,
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--bg-elevated)',
          border: `1px solid ${hovered ? 'var(--border-accent-secondary)' : 'var(--border)'}`,
          boxShadow: hovered
            ? '0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1)'
            : '0 1px 3px rgba(0,0,0,0.08)',
          transition: 'border-color 0.25s ease, box-shadow 0.3s ease, transform 0.2s ease',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Subtle glass overlay on hover */}
        <div
          style={{
            position: 'absolute', inset: 0,
            background: hovered
              ? 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 4%, transparent), transparent)'
              : 'transparent',
            transition: 'background 0.3s ease',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'relative', zIndex: 1,
            display: 'grid',
            gridTemplateColumns: `${LOGO_SIZE}px 1fr auto`,
            gap: 16,
            alignItems: 'center',
            padding: '14px 20px',
          }}
        >
          {/* Logo */}
          <ServerLogo name={server.saved_name} index={index} size={LOGO_SIZE} favicon={slp?.favicon} />

          {/* Info column */}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Server name + IP badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  fontSize: 15, fontWeight: 800, lineHeight: 1.2,
                  color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                title={server.saved_name}
              >
                {server.saved_name}
              </div>
              <span
                style={{
                  fontSize: 10, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 6,
                  background: 'color-mix(in srgb, var(--bg-overlay) 60%, transparent)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  whiteSpace: 'nowrap', flexShrink: 0,
                  lineHeight: '18px',
                }}
              >
                {server.ip}
              </span>
            </div>

            {/* MOTD line */}
            <div
              style={{
                fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 1,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {isTimeout ? (
                <span style={{ color: 'var(--yellow)' }}>{t('serversTimeout')}</span>
              ) : slp?.motd_raw ? (
                <McText text={slp.motd_raw.replace(/\n/g, '  ')} />
              ) : slp?.motd_clean ? (
                <McText text={slp.motd_clean.replace(/\n/g, '  ')} />
              ) : isOnline ? (
                <span style={{ color: 'var(--text-muted)' }}>{server.ip}</span>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {'\u2014'}
                </span>
              )}
            </div>

            {/* Meta row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {/* Online status */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: isOnline ? 'var(--green)' : 'var(--text-muted)' }}>
                <StatusDot online={isOnline} />
                {isOnline ? onlineStr : t('serversOffline')}
              </span>

              {/* Version chip */}
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  fontSize: 10, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 6,
                  background: `color-mix(in srgb, ${getStatusColor(statusTone)} 10%, transparent)`,
                  color: getStatusColor(statusTone),
                  lineHeight: '18px',
                }}
              >
                {versionLabel}
              </span>

              {/* Last seen */}
              {lastSeen && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                  <Clock size={10} />
                  {lastSeen}
                </span>
              )}
            </div>
          </div>

          {/* Right side: quick action hint */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 10,
              background: hovered ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
              color: hovered ? 'var(--accent-secondary-bright)' : 'var(--text-muted)',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
          >
            <ChevronRight size={18} strokeWidth={2} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Server Detail View (macOS Settings panel style) ─────────────────── */
function ServerDetailView({ server, onBack, onRefresh, lang }) {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [ipCopied, setIpCopied] = useState(false);
  const slp = server.slp_data;
  const isOnline = server.status === 'online';
  const isTimeout = server.status === 'timeout';
  const onlinePlayers = slp?.online_players ?? null;
  const maxPlayers = slp?.max_players ?? null;
  const serverIndex = 0;
  const motdText = slp?.motd_raw || slp?.motd_clean || null;
  const lastSeen = formatLastSeen(server.last_seen);

  const serverAddress = `${server.ip}:${server.port}`;

  function handleCopyIp() {
    navigator.clipboard.writeText(serverAddress).then(() => {
      setIpCopied(true);
      setTimeout(() => setIpCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* macOS-style sticky header with vibrancy */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'color-mix(in srgb, var(--bg-surface) 75%, transparent)',
        backdropFilter: 'blur(24px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
        margin: '-28px -32px 0 -32px',
        padding: '16px 32px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn btn-secondary btn-icon"
            onClick={onBack}
            style={{ width: 30, height: 30, borderRadius: 8 }}
          >
            <ArrowLeft size={14} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
              onClick={onBack}
            >
              {t('serversTitle')}
            </span>
            <ChevronRight size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <span style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            }}>
              {server.saved_name}
            </span>
          </div>
          <UpdateStatus server={server} t={t} />
          <button
            onClick={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }}
            disabled={refreshing}
            className="btn btn-secondary btn-icon"
            title={t('serversRefresh')}
            style={{ width: 30, height: 30, borderRadius: 8 }}
          >
            <RefreshCw
              size={13}
              style={refreshing ? { animation: 'spin 0.8s linear infinite' } : undefined}
            />
          </button>
        </div>
      </div>

      {/* Content container */}
      <div style={{ maxWidth: 640, margin: '28px auto 0', width: '100%' }}>
        {/* Hero: Logo + Name + Status */}
        <div
          className="fade-in-up"
          style={{
            animationDelay: '0ms',
            display: 'flex', alignItems: 'center', gap: 20,
            padding: '20px 24px',
            marginBottom: 16,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 18,
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}
        >
          <ServerLogo name={server.saved_name} index={serverIndex} size={72} favicon={slp?.favicon} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>
                {server.saved_name}
              </div>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 700,
                  padding: '3px 10px', borderRadius: 8,
                  background: isOnline
                    ? 'color-mix(in srgb, var(--green) 12%, transparent)'
                    : 'color-mix(in srgb, var(--red) 10%, transparent)',
                  color: isOnline ? 'var(--green)' : 'var(--red)',
                  border: `1px solid ${
                    isOnline
                      ? 'color-mix(in srgb, var(--green) 25%, transparent)'
                      : 'color-mix(in srgb, var(--red) 20%, transparent)'
                  }`,
                  lineHeight: 1,
                }}
              >
                <StatusDot online={isOnline} />
                {isOnline ? t('serversOnline') : t('serversOffline')}
              </span>
            </div>
            <div
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13,
                color: 'var(--text-secondary)', cursor: 'pointer',
                padding: '2px 8px', borderRadius: 6,
                background: 'color-mix(in srgb, var(--bg-overlay) 40%, transparent)',
                border: '1px solid var(--border)',
                transition: 'background 0.15s, color 0.15s',
                maxWidth: 'fit-content',
              }}
              onClick={handleCopyIp}
              title={ipCopied ? 'Скопировано' : 'Копировать IP'}
            >
              <Globe size={13} />
              {serverAddress}
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                color: ipCopied ? 'var(--green)' : 'var(--text-muted)',
                transition: 'color 0.2s',
              }}>
                {ipCopied ? <Check size={12} /> : <Copy size={12} />}
              </span>
            </div>
          </div>
        </div>

        {/* MOTD Block */}
        {(motdText || isTimeout) && (
          <div
            className="fade-in-up"
            style={{
              animationDelay: '60ms',
              background: 'color-mix(in srgb, var(--bg-elevated) 70%, transparent)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '18px 22px',
              marginBottom: 16,
              backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: 0.8, color: 'var(--text-muted)', marginBottom: 10,
            }}>
              {t('serversMotdLabel')}
            </div>
            {isTimeout ? (
              <div style={{
                fontSize: 14, lineHeight: 1.7,
                color: 'var(--yellow)',
              }}>
                {t('serversTimeout')}
              </div>
            ) : (
              <div style={{
                fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                color: 'var(--text-primary)',
              }}>
                <McText text={motdText} />
              </div>
            )}
          </div>
        )}

        {/* macOS-style grouped info cards */}
        <div
          className="fade-in-up"
          style={{ animationDelay: '100ms', marginBottom: 28 }}
        >
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 18,
            overflow: 'hidden',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}>
            {[
              {
                icon: <Users size={16} />,
                label: t('serversPlayersLabel'),
                value: formatPlayers(onlinePlayers, maxPlayers, t('serversNoData')),
                accent: 'var(--accent-secondary-bright)',
              },
              {
                icon: <Gamepad2 size={16} />,
                label: t('version'),
                value: slp?.version || t('serversNoData'),
              },
              {
                icon: <Clock size={16} />,
                label: t('serversLastSeenLabel'),
                value: lastSeen || '\u2014',
              },
              {
                icon: <Globe size={16} />,
                label: 'IP',
                value: serverAddress,
                copyable: true,
                isLast: true,
              },
            ].filter(Boolean).map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 20px',
                  borderBottom: item.isLast ? 'none' : '1px solid var(--border)',
                  transition: 'background 0.15s',
                  cursor: item.copyable ? 'pointer' : 'default',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-glass-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                onClick={item.copyable ? handleCopyIp : undefined}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'color-mix(in srgb, var(--bg-overlay) 50%, transparent)',
                  border: '1px solid var(--border)',
                  color: item.accent || 'var(--text-secondary)',
                }}>
                  {item.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>
                    {item.label}
                  </div>
                  <div style={{
                    fontSize: 17, fontWeight: 800, color: 'var(--text-primary)',
                    lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {item.value}
                    {item.copyable && (
                      <span style={{ color: ipCopied ? 'var(--green)' : 'var(--text-muted)', transition: 'color 0.2s' }}>
                        {ipCopied ? <Check size={13} /> : <Copy size={13} />}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ServersPage({ instances, activeInstance }) {
  const { t, lang } = useTranslation();

  const [selectedInstance, setSelectedInstance] = useState(activeInstance);
  const [instanceDropdownOpen, setInstanceDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState('list');
  const [selectedServer, setSelectedServer] = useState(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!instanceDropdownOpen) return;
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setInstanceDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [instanceDropdownOpen]);

  // Load servers with status once
  useEffect(() => {
    if (!selectedInstance) {
      setServers([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const entries = await invoke('load_servers_with_ping', {
          instanceName: selectedInstance.name,
          customPath: selectedInstance.custom_path || null,
        });
        if (!cancelled) {
          setServers(entries);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('[servers] Load error:', e);
          setLoadError(String(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedInstance]);

  // Refresh a single server: SLP ping + cross-check with servers.dat
  async function handleRefreshServer(server) {
    try {
      const updated = await invoke('refresh_single_server', {
        instanceName: selectedInstance.name,
        customPath: selectedInstance.custom_path || null,
        ip: server.ip,
        port: server.port,
      });

      if (updated === null) {
        // Server was removed from servers.dat
        setServers(prev => prev.filter(s => s.ip !== server.ip || s.port !== server.port));
        setSelectedServer(null);
        setView('list');
        return;
      }

      setSelectedServer(updated);
      setServers(prev => prev.map(s =>
        s.ip === server.ip && s.port === server.port ? updated : s
      ));
    } catch (e) {
      console.error('[servers] Refresh error:', e);
    }
  }

  function handleSelect(server) {
    setSelectedServer(server);
    setView('detail');
  }

  function handleBack() {
    setSelectedServer(null);
    setView('list');
  }

  if (view === 'detail' && selectedServer) {
    return (
      <div className="page" style={{ paddingBottom: 40 }}>
        <ServerDetailView
          server={selectedServer}
          onBack={handleBack}
          onRefresh={() => handleRefreshServer(selectedServer)}
          lang={lang}
        />
      </div>
    );
  }

  const showEmpty = !loading && servers.length === 0;

  return (
    <div className="page">
      <div className="page-header fade-in-up" style={{ animationDelay: '0ms' }}>
        <div className="page-title">{t('serversTitle')}</div>
        <div className="page-subtitle">{t('serversSubtitle')}</div>
      </div>

      {/* Instance selector */}
      {instances.length > 0 && (
        <div
          className="fade-in-up"
          style={{ animationDelay: '20ms', marginBottom: 16, position: 'relative', zIndex: 10 }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-muted)', marginBottom: 6 }}>
            {t('instances')}
          </div>
          <div ref={dropdownRef} style={{ position: 'relative', zIndex: 200 }}>
            <button
              onClick={() => setInstanceDropdownOpen(o => !o)}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--bg-elevated)',
                border: `1px solid ${instanceDropdownOpen ? 'var(--border-accent-secondary)' : 'var(--border)'}`,
                borderRadius: 14,
                padding: '10px 14px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                fontSize: 14,
                transition: 'border-color 0.15s',
              }}
            >
              <span
                style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--accent-bright), var(--accent-dim))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff',
                }}
              >
                <InstanceIcon iconKey={selectedInstance?.icon} size={20} color="#fff" />
              </span>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedInstance?.name || 'No instance'}
                </div>
                {selectedInstance && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {selectedInstance.minecraft_version}
                    {selectedInstance.loader !== 'Vanilla' && ` · ${selectedInstance.loader}`}
                    {selectedInstance.loader_version && ` ${selectedInstance.loader_version}`}
                  </div>
                )}
              </div>
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                style={{
                  color: 'var(--text-muted)', flexShrink: 0,
                  transform: instanceDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {instanceDropdownOpen && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
                  marginTop: 6,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: 6,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
                  maxHeight: 280,
                  overflowY: 'auto',
                }}
              >
                {instances.map(inst => (
                  <button
                    key={inst.id}
                    onClick={() => {
                      setSelectedInstance(inst);
                      setInstanceDropdownOpen(false);
                    }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 10,
                      border: 'none', background: 'transparent',
                      cursor: 'pointer', color: 'var(--text-primary)',
                      fontSize: 13, textAlign: 'left',
                      backgroundColor: selectedInstance?.id === inst.id
                        ? 'color-mix(in srgb, var(--accent-secondary-bright) 12%, transparent)'
                        : 'transparent',
                    }}
                    onMouseOver={e => { if (selectedInstance?.id !== inst.id) e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--accent-secondary-bright) 6%, transparent)'; }}
                    onMouseOut={e => { if (selectedInstance?.id !== inst.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <span
                      style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: selectedInstance?.id === inst.id
                          ? 'linear-gradient(135deg, var(--accent-secondary-bright), var(--accent-secondary-dim))'
                          : 'var(--bg-surface)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <InstanceIcon
                        iconKey={inst.icon}
                        size={15}
                        color={selectedInstance?.id === inst.id ? '#fff' : 'var(--text-muted)'}
                      />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inst.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                        {inst.minecraft_version}
                        {inst.loader !== 'Vanilla' && ` · ${inst.loader}`}
                      </div>
                    </div>
                    {selectedInstance?.id === inst.id && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary-bright)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div
          className="fade-in-up"
          style={{
            animationDelay: '40ms',
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}
        >
          <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {t('loading')}
          </div>
          <div>{t('serversStatNote')}</div>
        </div>
      )}

      {/* Error message */}
      {loadError && !loading && (
        <div
          className="fade-in-up"
          style={{
            animationDelay: '40ms',
            padding: '10px 14px',
            background: 'color-mix(in srgb, var(--red) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)',
            borderRadius: 10,
            fontSize: 12,
            color: 'var(--red)',
            marginBottom: 12,
            lineHeight: 1.5,
            wordBreak: 'break-all',
          }}
        >
          <strong>{t('errorGeneric')}:</strong> {loadError}
        </div>
      )}

      {/* Server list header */}
      {!loading && servers.length > 0 && (
        <div
          className="fade-in-up"
          style={{
            animationDelay: '40ms',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '14px 18px',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>
              {t('serversListTitle')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {t('serversListSubtitle')}
            </div>
          </div>
          <div
            style={{
              fontSize: 11, fontWeight: 700,
              color: 'var(--accent-secondary-bright)',
              background: 'color-mix(in srgb, var(--accent-secondary-bright) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-secondary-bright) 24%, transparent)',
              padding: '6px 10px',
              borderRadius: 999,
            }}
          >
            {servers.length}
          </div>
        </div>
      )}

      {/* Empty state */}
      {showEmpty && (
        <div
          className="fade-in-up"
          style={{
            animationDelay: '40ms',
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--text-muted)',
          }}
        >
          <Server size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>
            {t('serversTeaser')}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            {loadError ? t('errorGeneric') + ': ' + loadError : t('serversComingSoonHint')}
          </div>
        </div>
      )}

      {/* Server list */}
      {!loading && servers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {servers.map((server, index) => (
            <ServerRowCard
              key={server.ip + ':' + server.port}
              server={server}
              index={index}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
