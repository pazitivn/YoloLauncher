/**
 * ConsoleApp — standalone game-log console window.
 * Opened as a separate native Tauri window (hash: #console).
 *
 * Features:
 *  • Tabs named by launch timestamp (HH:MM:SS), instance name shown as header
 *  • Auto-scroll that pauses when user scrolls up
 *  • Prominent "Sync" button centred at the bottom when scrolled up
 *  • Copy + Clear per tab
 *  • Crash badge on tab
 *  • Custom title bar (decorations: false)
 */

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  Terminal, X, Minus, Maximize2, Minimize2,
  Copy, Check, Trash2, AlertCircle, AlertTriangle, Info,
  ChevronDown, WifiOff,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getSetting } from './utils/settings';

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return '??:??:??'; }
}

function nowLabel() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const MAX_PER_TAB = 10_000;

// ─── CSS variables — loaded from store at runtime ──────────────────────────
let ACCENT   = '#7c6af7';
let ACCENT_B = '#9d8fff';
const BG_BASE  = '#080a10';
const BG_BAR   = '#0d0f16';
const BG_TAB   = '#111520';
const BORDER   = 'rgba(255,255,255,0.07)';

// ─── Level config ────────────────────────────────────────────────────────────
const LEVELS = {
  error: { bg: 'rgba(248,113,113,.13)', color: '#fca5a5', border: 'rgba(248,113,113,.3)', icon: <AlertCircle size={11} /> },
  warn:  { bg: 'rgba(251,191,36,.10)',  color: '#fde68a', border: 'rgba(251,191,36,.25)', icon: <AlertTriangle size={11} /> },
  info:  { bg: 'transparent',           color: '#c9cfe8', border: 'transparent',          icon: <Info size={11} /> },
};

// ─── Single log line ─────────────────────────────────────────────────────────
function LogLine({ entry }) {
  const cfg = LEVELS[entry.level] ?? LEVELS.info;
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      padding: '2px 14px',
      background: cfg.bg,
      borderLeft: `2px solid ${cfg.border}`,
      fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace",
      fontSize: 11.5, lineHeight: '18px',
    }}>
      <span style={{ color: '#3a4060', fontSize: 10, flexShrink: 0, marginTop: 2, minWidth: 62 }}>
        {fmtTime(entry.timestamp)}
      </span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: 9, fontWeight: 700, padding: '1px 5px',
        borderRadius: 4, background: cfg.bg || 'rgba(255,255,255,.06)',
        color: cfg.color, textTransform: 'uppercase',
        letterSpacing: 0.5, flexShrink: 0, minWidth: 42,
        justifyContent: 'center', border: `1px solid ${cfg.border}`,
        marginTop: 2,
      }}>
        {cfg.icon} {entry.level}
      </span>
      <span style={{
        color: cfg.color, wordBreak: 'break-all', flex: 1,
        userSelect: 'text',
        opacity: entry.level === 'info' ? 0.88 : 1,
      }}>
        {entry.message}
      </span>
    </div>
  );
}

// ─── Tab strip ───────────────────────────────────────────────────────────────
function TabStrip({ tabs, activeId, onSelect, onClose }) {
  return (
    <div style={{
      display: 'flex', flexShrink: 0, overflowX: 'auto', overflowY: 'hidden',
      background: BG_BAR, borderBottom: `1px solid ${BORDER}`,
      scrollbarWidth: 'none',
    }}>
      {tabs.map(tab => {
        const isActive = tab.id === activeId;
        return (
          <div
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            title={tab.instanceName}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '0 10px 0 14px', height: 36,
              cursor: 'pointer', userSelect: 'none',
              background: isActive ? BG_TAB : 'transparent',
              borderRight: `1px solid ${BORDER}`,
              borderBottom: isActive
                ? `2px solid ${ACCENT}`
                : '2px solid transparent',
              minWidth: 110, maxWidth: 180, flexShrink: 0,
              transition: 'background .15s',
              position: 'relative',
            }}
          >
            <Terminal size={11} style={{
              color: isActive ? ACCENT_B : '#3a4060', flexShrink: 0,
            }} />
            <span style={{
              fontSize: 12, fontWeight: isActive ? 600 : 400,
              color: isActive ? '#e8eaff' : '#5a6080',
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', flex: 1,
              fontFamily: "'JetBrains Mono',monospace",
            }}>
              {tab.label}
            </span>
            {tab.running && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#4ade80', flexShrink: 0,
                boxShadow: '0 0 6px rgba(74,222,128,.6)',
                animation: 'pulse 2s infinite',
              }} />
            )}
            {tab.crashed && !tab.running && (
              <AlertCircle size={11} style={{ color: '#f87171', flexShrink: 0 }} />
            )}
            <button
              onClick={e => { e.stopPropagation(); onClose(tab.id); }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#3a4060', padding: 2, borderRadius: 3, flexShrink: 0,
                display: 'flex', alignItems: 'center',
                transition: 'color .1s',
              }}
              onMouseOver={e => e.currentTarget.style.color = '#f87171'}
              onMouseOut={e => e.currentTarget.style.color = '#3a4060'}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Custom title bar ─────────────────────────────────────────────────────────
function TitleBar({ title, errorCount, warnCount }) {
  const [maximized, setMaximized] = useState(false);
  const win = getCurrentWindow();

  async function toggleMax() {
    const m = await win.isMaximized();
    if (m) { await win.unmaximize(); setMaximized(false); }
    else    { await win.maximize();   setMaximized(true); }
  }

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 36, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 12px 0 16px',
        background: '#060810', borderBottom: `1px solid ${BORDER}`,
        flexShrink: 0, WebkitAppRegion: 'drag',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Terminal size={13} style={{ color: ACCENT_B }} />
        <span style={{
          fontSize: 12, fontWeight: 700, color: '#8b92b3',
          letterSpacing: 0.5,
        }}>
          {title}
        </span>
        {errorCount > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 6px',
            borderRadius: 10, background: 'rgba(248,113,113,.15)',
            color: '#f87171',
          }}>
            {errorCount} error{errorCount !== 1 ? 's' : ''}
          </span>
        )}
        {warnCount > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 6px',
            borderRadius: 10, background: 'rgba(251,191,36,.15)',
            color: '#fbbf24',
          }}>
            {warnCount} warn{warnCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, WebkitAppRegion: 'no-drag' }}>
        <WinBtn onClick={() => win.minimize()} title="Minimise">
          <Minus size={12} />
        </WinBtn>
        <WinBtn onClick={toggleMax} title="Maximise">
          {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </WinBtn>
        <WinBtn onClick={() => win.close()} title="Close" danger>
          <X size={12} />
        </WinBtn>
      </div>
    </div>
  );
}

function WinBtn({ children, onClick, title, danger }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseOver={() => setHov(true)}
      onMouseOut={() => setHov(false)}
      style={{
        width: 26, height: 26, border: 'none', borderRadius: 6,
        cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', transition: 'background .1s',
        background: hov
          ? (danger ? 'rgba(248,113,113,.22)' : 'rgba(255,255,255,.08)')
          : 'transparent',
        color: hov
          ? (danger ? '#f87171' : '#e0e2f0')
          : '#4a5175',
      }}
    >
      {children}
    </button>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ noTabs }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 14, color: '#2d3250',
    }}>
      {noTabs ? <WifiOff size={40} /> : <Terminal size={40} />}
      <div style={{ fontSize: 14, fontWeight: 600 }}>
        {noTabs ? 'No game sessions yet' : 'Waiting for output…'}
      </div>
      <div style={{ fontSize: 11, color: '#1e2330', maxWidth: 280, textAlign: 'center' }}>
        {noTabs
          ? 'Launch a Minecraft instance from the launcher to see logs here.'
          : 'Game is starting up…'}
      </div>
    </div>
  );
}

// ─── Main ConsoleApp ──────────────────────────────────────────────────────────
export default function ConsoleApp() {
  // sessions: { [id]: { id, label, instanceName, instanceId, logs[], running, crashed } }
  const [sessions, setSessions]       = useState({});
  const [activeId, setActiveId]       = useState(null);
  const [autoScroll, setAutoScroll]   = useState(true);
  const [copied, setCopied]           = useState(false);
  const [accentReady, setAccentReady] = useState(0); // bump to re-render on accent load
  const scrollRef                     = useRef(null);

  // ── Load accent color from persistent store ─────────────────────────────
  useEffect(() => {
    getSetting('accent', '#7c6af7').then(color => {
      ACCENT   = color;
      // Derive a lighter variant
      const r = parseInt(color.slice(1,3), 16);
      const g = parseInt(color.slice(3,5), 16);
      const b = parseInt(color.slice(5,7), 16);
      ACCENT_B = `rgb(${Math.min(255,r+35)},${Math.min(255,g+35)},${Math.min(255,b+35)})`;
      document.documentElement.style.setProperty('--accent', color);
      document.documentElement.style.setProperty('--accent-bright', ACCENT_B);
      // Force re-render to pick up new colours
      setAccentReady(v => v + 1);
    });
  }, []);

  // ── Tauri event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const unlistenLog = listen('game-log', ({ payload }) => {
      const id = payload.launch_id;
      setSessions(prev => {
        const existing = prev[id];
        const logs = existing?.logs ?? [];
        const trimmed = logs.length >= MAX_PER_TAB
          ? [...logs.slice(-MAX_PER_TAB + 1), payload]
          : [...logs, payload];
        return {
          ...prev,
          [id]: {
            ...existing,
            id,
            launchId: id,
            instanceId: payload.instance_id,
            instanceName: payload.instance_name ?? payload.instance_id,
            label: existing?.label ?? nowLabel(),
            logs: trimmed,
            running: existing?.running ?? true,
            crashed: existing?.crashed ?? false,
          },
        };
      });
      setActiveId(prev => prev ?? id);
    });

    const unlistenStart = listen('instance-started', ({ payload }) => {
      const id = payload.launch_id;
      setSessions(prev => {
        if (prev[id]) {
          return { ...prev, [id]: { ...prev[id], running: true, crashed: false } };
        }
        // New session entry before any logs
        const newSession = {
          id, launchId: id, instanceId: payload.instance_id, instanceName: payload.instance_name,
          label: nowLabel(), logs: [], running: true, crashed: false,
        };
        setActiveId(cur => cur ?? id);
        return { ...prev, [id]: newSession };
      });
    });

    const unlistenStop = listen('instance-stopped', ({ payload }) => {
      const id = payload.launch_id;
      setSessions(prev => prev[id]
        ? { ...prev, [id]: { ...prev[id], running: false } }
        : prev
      );
    });

    const unlistenCrash = listen('instance-crashed', ({ payload }) => {
      const id = payload.launch_id;
      setSessions(prev => prev[id]
        ? { ...prev, [id]: { ...prev[id], crashed: true, running: false } }
        : prev
      );
      setActiveId(id); // focus crashed tab
    });

    return () => {
      [unlistenLog, unlistenStart, unlistenStop, unlistenCrash]
        .forEach(p => p.then(f => f()));
    };
  }, []);

  // ── Scroll management ─────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sessions, autoScroll, activeId]);

  function syncScroll() {
    setAutoScroll(true);
    const el = scrollRef.current;
    if (el) { el.scrollTop = el.scrollHeight; }
  }

  // ── Tab actions ───────────────────────────────────────────────────────────
  function closeTab(id) {
    setSessions(prev => {
      const next = { ...prev };
      delete next[id];
      const ids = Object.keys(next);
      if (activeId === id) setActiveId(ids[0] ?? null);
      return next;
    });
  }

  function clearTab(id) {
    setSessions(prev => prev[id]
      ? { ...prev, [id]: { ...prev[id], logs: [] } }
      : prev
    );
  }

  function copyLogs() {
    const session = sessions[activeId];
    if (!session) return;
    const text = session.logs
      .map(l => `[${fmtTime(l.timestamp)}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const tabs        = Object.values(sessions);
  const activeSession = sessions[activeId] ?? null;
  const activeLogs  = activeSession?.logs ?? [];
  const errorCount  = activeLogs.filter(l => l.level === 'error').length;
  const warnCount   = activeLogs.filter(l => l.level === 'warn').length;
  const title       = activeSession
    ? `Console — ${activeSession.instanceName} [${activeSession.label}]`
    : 'YoloLauncher Console';

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      background: BG_BASE, color: '#c9cfe8', overflow: 'hidden',
      fontFamily: "'Inter',system-ui,sans-serif",
      border: `1px solid ${BORDER}`, borderRadius: 10,
    }}>
      {/* Custom title bar */}
      <TitleBar title={title} errorCount={errorCount} warnCount={warnCount} />

      {/* Tab strip */}
      {tabs.length > 0 && (
        <TabStrip
          tabs={tabs}
          activeId={activeId}
          onSelect={id => { setActiveId(id); setAutoScroll(true); }}
          onClose={closeTab}
        />
      )}

      {/* Session header */}
      {activeSession && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', borderBottom: `1px solid ${BORDER}`,
          background: BG_BAR, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: activeSession.running ? '#4ade80' : activeSession.crashed ? '#f87171' : '#4a5175',
              boxShadow: activeSession.running ? '0 0 8px rgba(74,222,128,.5)' : 'none',
              animation: activeSession.running ? 'pulse 2s infinite' : 'none',
            }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e0e2f0' }}>
              {activeSession.instanceName}
            </span>
            <span style={{ fontSize: 11, color: '#3a4060' }}>
              started {activeSession.label}
            </span>
            {activeSession.crashed && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 8px',
                borderRadius: 10, background: 'rgba(248,113,113,.15)',
                color: '#f87171', border: '1px solid rgba(248,113,113,.3)',
              }}>
                CRASHED
              </span>
            )}
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 6 }}>
            <ToolBtn onClick={copyLogs} title="Copy all logs">
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </ToolBtn>
            <ToolBtn onClick={() => clearTab(activeId)} title="Clear tab" danger>
              <Trash2 size={13} />
              <span>Clear</span>
            </ToolBtn>
          </div>
        </div>
      )}

      {/* Log area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          background: BG_BASE, position: 'relative',
          scrollbarWidth: 'thin', scrollbarColor: '#1e2330 transparent',
        }}
      >
        {tabs.length === 0 ? (
          <EmptyState noTabs />
        ) : !activeSession ? null
          : activeLogs.length === 0 ? (
            <EmptyState noTabs={false} />
          ) : (
            <div style={{ paddingTop: 4, paddingBottom: autoScroll ? 4 : 60 }}>
              {activeLogs.map((entry, i) => (
                <LogLine key={i} entry={entry} />
              ))}
            </div>
          )
        }
      </div>

      {/* ── Floating Sync button ─────────────────────────────────────────── */}
      {!autoScroll && tabs.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 40, left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          animation: 'syncBounce .3s cubic-bezier(.34,1.56,.64,1)',
        }}>
          <button
            onClick={syncScroll}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 22px', borderRadius: 30,
              background: `linear-gradient(135deg, ${ACCENT}, #9d8fff)`,
              color: 'white', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              boxShadow: `0 4px 20px rgba(124,106,247,.55)`,
              transition: 'transform .1s, box-shadow .1s',
              letterSpacing: 0.3,
            }}
            onMouseOver={e => {
              e.currentTarget.style.transform = 'scale(1.06)';
              e.currentTarget.style.boxShadow = `0 6px 28px rgba(124,106,247,.7)`;
            }}
            onMouseOut={e => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = `0 4px 20px rgba(124,106,247,.55)`;
            }}
          >
            <ChevronDown size={15} />
            Sync to latest
          </button>
        </div>
      )}

      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '3px 14px', background: '#060810',
        borderTop: `1px solid ${BORDER}`, flexShrink: 0,
        fontSize: 10, color: '#3a4060',
      }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <span>{activeLogs.length} lines</span>
          {errorCount > 0 && <span style={{ color: '#f87171' }}>{errorCount} errors</span>}
          {warnCount > 0  && <span style={{ color: '#fbbf24' }}>{warnCount} warnings</span>}
        </div>
        <span style={{ color: autoScroll ? '#2d3250' : ACCENT_B }}>
          {autoScroll ? 'Auto-scroll on ↓' : '↑ Scrolled up — click Sync to follow'}
        </span>
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { width: 100%; height: 100%; background: ${BG_BASE}; overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2330; border-radius: 2px; }
        @keyframes pulse {
          0%,100% { opacity: 1; }
          50% { opacity: .45; }
        }
        @keyframes syncBounce {
          from { opacity: 0; transform: translateX(-50%) translateY(12px) scale(.9); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)     scale(1); }
        }
      `}</style>
    </div>
  );
}

// ─── Small toolbar button ─────────────────────────────────────────────────────
function ToolBtn({ children, onClick, title, danger }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseOver={() => setHov(true)}
      onMouseOut={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
        fontSize: 11, fontFamily: 'inherit', fontWeight: 500,
        border: `1px solid ${hov
          ? (danger ? 'rgba(248,113,113,.4)' : 'rgba(255,255,255,.15)')
          : 'rgba(255,255,255,.07)'}`,
        background: hov
          ? (danger ? 'rgba(248,113,113,.12)' : 'rgba(255,255,255,.06)')
          : 'transparent',
        color: hov
          ? (danger ? '#f87171' : '#c9cfe8')
          : '#5a6080',
        transition: 'all .12s',
      }}
    >
      {children}
    </button>
  );
}
