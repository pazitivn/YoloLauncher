import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Minus, Maximize2, Terminal, RefreshCw, Trash2,
  AlertTriangle, Info, AlertCircle, ChevronDown, Copy, Check
} from 'lucide-react';

// ─── Level badge ────────────────────────────────────────────────────────────
function LevelBadge({ level }) {
  const cfg = {
    error: { bg: 'rgba(248,113,113,0.15)', color: '#f87171', icon: <AlertCircle size={11} /> },
    warn:  { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24', icon: <AlertTriangle size={11} /> },
    info:  { bg: 'rgba(139,146,179,0.12)', color: '#8b92b3', icon: <Info size={11} /> },
  }[level] || { bg: 'rgba(139,146,179,0.12)', color: '#8b92b3', icon: <Info size={11} /> };

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, fontWeight: 700, padding: '1px 5px',
      borderRadius: 4, background: cfg.bg, color: cfg.color,
      textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0,
      minWidth: 42, justifyContent: 'center',
    }}>
      {cfg.icon} {level}
    </span>
  );
}

// ─── Single log line ─────────────────────────────────────────────────────────
function LogLine({ entry, index }) {
  const timeStr = (() => {
    try { return new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return ''; }
  })();
  const isError = entry.level === 'error';
  const isWarn  = entry.level === 'warn';

  return (
    <div
      style={{
        display: 'flex', gap: 8, alignItems: 'flex-start',
        padding: '2px 12px',
        background: isError
          ? 'rgba(248,113,113,0.06)'
          : isWarn ? 'rgba(251,191,36,0.04)' : 'transparent',
        borderLeft: isError
          ? '2px solid rgba(248,113,113,0.4)'
          : isWarn ? '2px solid rgba(251,191,36,0.3)' : '2px solid transparent',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: 11.5, lineHeight: '18px',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ color: '#4a5175', fontSize: 10, flexShrink: 0, marginTop: 2, minWidth: 60 }}>
        {timeStr}
      </span>
      <LevelBadge level={entry.level} />
      <span style={{
        color: isError ? '#fca5a5' : isWarn ? '#fde68a' : '#c9cfe8',
        wordBreak: 'break-all', flex: 1, userSelect: 'text',
      }}>
        {entry.message}
      </span>
    </div>
  );
}

// ─── Tab strip ───────────────────────────────────────────────────────────────
function TabStrip({ tabs, activeId, onSelect, onClose, runningIds }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 0,
      background: '#0d0f14', borderBottom: '1px solid rgba(255,255,255,0.06)',
      overflowX: 'auto', flexShrink: 0,
    }}>
      {tabs.map(tab => {
        const isActive  = tab.id === activeId;
        const isRunning = runningIds.has(tab.id);
        return (
          <div
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '0 12px 0 14px', height: 34, cursor: 'pointer',
              background: isActive ? '#111520' : 'transparent',
              borderRight: '1px solid rgba(255,255,255,0.05)',
              borderBottom: isActive ? '2px solid var(--accent, #7c6af7)' : '2px solid transparent',
              minWidth: 120, maxWidth: 200, flexShrink: 0,
              transition: 'background 0.15s',
              position: 'relative',
            }}
          >
            <Terminal size={12} style={{ color: isActive ? 'var(--accent-bright, #9d8fff)' : '#4a5175', flexShrink: 0 }} />
            <span style={{
              fontSize: 12, fontWeight: isActive ? 600 : 400,
              color: isActive ? '#e8eaff' : '#6b7194',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {tab.name}
            </span>
            {isRunning && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#4ade80', flexShrink: 0,
                boxShadow: '0 0 5px rgba(74,222,128,0.6)',
                animation: 'pulse 2s infinite',
              }} />
            )}
            <button
              onClick={e => { e.stopPropagation(); onClose(tab.id); }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#4a5175', display: 'flex', padding: 2, borderRadius: 3,
                transition: 'color 0.1s, background 0.1s', flexShrink: 0,
              }}
              onMouseOver={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; }}
              onMouseOut={e => { e.currentTarget.style.color = '#4a5175'; e.currentTarget.style.background = 'transparent'; }}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main ConsoleWindow ───────────────────────────────────────────────────────
export default function ConsoleWindow({ open, onClose, logs, runningIds, onClearLogs }) {
  const [activeTab, setActiveTab]       = useState(null);
  const [tabs, setTabs]                 = useState([]);
  const [autoScroll, setAutoScroll]     = useState(true);
  const [copied, setCopied]             = useState(false);
  const scrollRef = useRef(null);
  const isScrolledToBottom = useRef(true);

  // ── Build tab list from logs (one per instance) ────────────────────────────
  useEffect(() => {
    if (!logs || logs.length === 0) return;
    setTabs(prev => {
      const prevMap = new Map(prev.map(t => [t.id, t]));
      const ids = [...new Set(logs.map(l => l.instance_id))];
      const next = ids.map(id => {
        const sample = logs.find(l => l.instance_id === id);
        return prevMap.get(id) || { id, name: sample?.instance_name || id };
      });
      // Keep existing tabs that have no more logs (might have been cleared)
      return next;
    });
  }, [logs]);

  // Set active tab to first tab when tabs appear
  useEffect(() => {
    if (tabs.length > 0 && (!activeTab || !tabs.find(t => t.id === activeTab))) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    isScrolledToBottom.current = atBottom;
    if (!atBottom) setAutoScroll(false);
  }, []);

  // Scroll to bottom when new log arrives (if autoScroll is on)
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, autoScroll, activeTab]);

  function syncScroll() {
    setAutoScroll(true);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  function closeTab(id) {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (activeTab === id && next.length > 0) setActiveTab(next[0].id);
      if (next.length === 0) { setActiveTab(null); }
      return next;
    });
    onClearLogs && onClearLogs(id);
  }

  function copyLogs() {
    const active = logs.filter(l => l.instance_id === activeTab);
    const text = active.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (!open) return null;

  const activeLogs = activeTab ? logs.filter(l => l.instance_id === activeTab) : [];
  const errorCount = activeLogs.filter(l => l.level === 'error').length;
  const warnCount  = activeLogs.filter(l => l.level === 'warn').length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      animation: 'fadeIn 0.18s ease',
    }}>
      <div style={{
        width: '100%', maxWidth: '100%', height: '72vh',
        background: '#0a0c12',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px 16px 0 0',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
        animation: 'slideUpConsole 0.22s cubic-bezier(0.22,1,0.36,1)',
        overflow: 'hidden',
      }}>
        {/* ── Window chrome / title bar ──────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', height: 38, flexShrink: 0,
          background: '#080a10',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          WebkitAppRegion: 'drag',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Terminal size={14} style={{ color: 'var(--accent-bright, #9d8fff)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#c9cfe8', letterSpacing: 0.5 }}>
              Console
            </span>
            {errorCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>
                {errorCount} error{errorCount > 1 ? 's' : ''}
              </span>
            )}
            {warnCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                {warnCount} warn{warnCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' }}>
            {/* Sync / auto-scroll */}
            {!autoScroll && (
              <button
                onClick={syncScroll}
                title="Sync to latest"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 6, border: '1px solid var(--accent, #7c6af7)',
                  background: 'color-mix(in srgb, var(--accent, #7c6af7) 15%, transparent)',
                  color: 'var(--accent-bright, #9d8fff)', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', animation: 'pulse 2s infinite',
                }}
              >
                <RefreshCw size={11} /> Sync
              </button>
            )}

            {/* Copy */}
            <button
              onClick={copyLogs}
              title="Copy logs"
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                color: copied ? '#4ade80' : '#6b7194', cursor: 'pointer',
                padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
                transition: 'all 0.15s',
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>

            {/* Clear */}
            <button
              onClick={() => activeTab && onClearLogs && onClearLogs(activeTab)}
              title="Clear this tab"
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                color: '#6b7194', cursor: 'pointer',
                padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
                transition: 'all 0.15s',
              }}
              onMouseOver={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)'; }}
              onMouseOut={e => { e.currentTarget.style.color = '#6b7194'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >
              <Trash2 size={12} /> Clear
            </button>

            {/* Collapse */}
            <button
              onClick={onClose}
              title="Close console"
              style={{
                background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.2)',
                color: '#f87171', cursor: 'pointer',
                padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4,
                transition: 'all 0.15s', fontSize: 11,
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(248,113,113,0.22)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(248,113,113,0.12)'}
            >
              <X size={12} /> Close
            </button>
          </div>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        {tabs.length > 0 && (
          <TabStrip
            tabs={tabs}
            activeId={activeTab}
            onSelect={id => { setActiveTab(id); setAutoScroll(true); }}
            onClose={closeTab}
            runningIds={runningIds}
          />
        )}

        {/* ── Log area ─────────────────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            flex: 1, overflowY: 'auto', overflowX: 'hidden',
            background: '#0a0c12',
            scrollbarWidth: 'thin', scrollbarColor: '#1e2330 transparent',
          }}
        >
          {tabs.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: '#2d3250' }}>
              <Terminal size={36} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>No active instances</div>
              <div style={{ fontSize: 11, color: '#1e2330' }}>Launch a game to see logs here</div>
            </div>
          ) : activeLogs.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: '#2d3250' }}>
              <Terminal size={28} />
              <div style={{ fontSize: 12, fontWeight: 500 }}>Waiting for output…</div>
            </div>
          ) : (
            <div style={{ paddingTop: 4, paddingBottom: 8 }}>
              {activeLogs.map((entry, i) => (
                <LogLine key={`${entry.instance_id}-${i}`} entry={entry} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* ── Status bar ───────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 14px', background: '#080a10',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: '#3a4060' }}>
            <span>{activeLogs.length} lines</span>
            {activeTab && runningIds.has(activeTab) && (
              <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                Running
              </span>
            )}
            {activeTab && !runningIds.has(activeTab) && activeLogs.length > 0 && (
              <span style={{ color: '#3a4060' }}>Stopped</span>
            )}
          </div>
          <div style={{ fontSize: 10, color: '#3a4060' }}>
            {autoScroll ? '↓ Auto-scroll on' : '↑ Scrolled up — click Sync to resume'}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUpConsole {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
