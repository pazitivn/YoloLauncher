import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useDialog } from '../../components/DialogProvider';
import { Loader2, FolderOpen, Trash2, FileText, X } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { useTranslation } from '../../i18n';

export default function LogsTab({ instance }) {
  const { addToast } = useToast();
  const { confirm } = useDialog();
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState(null);
  const [logContent, setLogContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);

  useEffect(() => {
    loadLogs();
  }, [instance.id]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') closeViewer(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  async function loadLogs() {
    setLoading(true);
    try {
      const data = await invoke('list_logs', {
        instanceName: instance.name,
        customPath: instance.custom_path || null,
      });
      setLogs(data);
    } catch (e) {
      addToast(t('errorGeneric') + ': ' + e, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function openLog(log) {
    setViewer(log);
    setLoadingContent(true);
    setLogContent('');
    try {
      const content = await invoke('read_log_content', {
        logPath: log.path,
        isCompressed: log.is_compressed,
      });
      setLogContent(content);
    } catch (e) {
      addToast(t('errorGeneric') + ': ' + e, 'error');
      setLogContent('Error loading log content');
    } finally {
      setLoadingContent(false);
    }
  }

  function closeViewer() {
    setViewer(null);
    setLogContent('');
  }

  async function deleteLog(log, e) {
    e.stopPropagation();
    const yes = await confirm(`${t('deleteLog')} "${log.name}"?`, {
      title: t('confirmTitle'),
      kind: 'warning',
    });
    if (!yes) return;

    try {
      await invoke('delete_content_file', { filePath: log.path });
      setLogs((prev) => prev.filter((l) => l.path !== log.path));
      if (viewer?.path === log.path) closeViewer();
    } catch (e) {
      addToast('' + e, 'error');
    }
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {t('logCount').replace('{n}', logs.length)}
        </span>
        <button
          className="btn btn-secondary"
          style={{ gap: 6, fontSize: 12 }}
          onClick={() =>
            invoke('open_instance_folder', {
              instanceName: instance.name,
              customPath: instance.custom_path || null,
              subFolder: 'logs',
            })
          }
        >
          <FolderOpen size={13} /> {t('openLogsFolder')}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />
        </div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <FileText size={40} opacity={0.4} />
          </div>
          <div className="empty-title">{t('noLogs')}</div>
          <div className="empty-desc">{t('noLogsDesc')}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', paddingBottom: 8 }}>
          {logs.map((log, i) => (
            <div
              key={i}
              onClick={() => openLog(log)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                cursor: 'pointer',
                transition: 'all .15s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-secondary)';
                e.currentTarget.style.background = 'color-mix(in srgb, var(--accent-secondary) 5%, var(--bg-elevated))';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.background = 'var(--bg-elevated)';
              }}
            >
              {/* Icon */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  flexShrink: 0,
                  background: log.is_compressed ? 'rgba(96,165,250,.12)' : 'var(--bg-overlay)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FileText size={18} style={{ color: log.is_compressed ? '#60a5fa' : 'var(--text-muted)' }} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--text-primary)',
                  }}
                >
                  {log.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 10, marginTop: 2 }}>
                  <span>{log.line_count.toLocaleString()} {t('lines')}</span>
                  <span>•</span>
                  <span>{log.size_fmt}</span>
                  {log.created_at && (
                    <>
                      <span>•</span>
                      <span>{fmtDate(log.created_at)}</span>
                    </>
                  )}
                  {log.is_compressed && (
                    <>
                      <span>•</span>
                      <span style={{ color: '#60a5fa' }}>Compressed</span>
                    </>
                  )}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={(e) => deleteLog(log, e)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: 4,
                  borderRadius: 6,
                  display: 'flex',
                  transition: 'color .1s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = '#f87171')}
                onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Log Viewer Modal */}
      {viewer && (
        <div
          onClick={closeViewer}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
          }}
        >
          {/* Header */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              padding: '12px 16px',
              background: 'var(--bg-elevated)',
              borderRadius: 10,
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <FileText size={18} style={{ color: 'var(--accent-secondary)' }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{viewer.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {viewer.line_count.toLocaleString()} {t('lines')} · {viewer.size_fmt}
                </div>
              </div>
            </div>
            <button
              onClick={closeViewer}
              style={{
                background: 'var(--bg-glass)',
                border: 'none',
                borderRadius: 8,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background .15s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-glass-hover)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'var(--bg-glass)')}
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              background: 'var(--bg-base)',
              borderRadius: 10,
              border: '1px solid var(--border)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {loadingContent ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />
              </div>
            ) : (
              <LogViewer content={logContent} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LogViewer({ content }) {
  const lines = useMemo(() => content.split('\n'), [content]);
  const analyzedLines = useMemo(
    () => lines.map((line) => ({ text: line, type: analyzeLogLine(line).type })),
    [lines]
  );
  const ROW_HEIGHT = 20;
  const lineNumberWidth = Math.max(56, `${analyzedLines.length}`.length * 10 + 24);

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        background: 'var(--bg-base)',
        fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
        fontSize: 12,
        lineHeight: `${ROW_HEIGHT}px`,
      }}
    >
      <div
        style={{
          minWidth: '100%',
          width: 'max-content',
          color: 'var(--text-primary)',
          padding: '16px 0',
        }}
      >
        {analyzedLines.map((line, index) => (
          <LogLine
            key={index}
            line={line}
            lineNumber={index + 1}
            lineNumberWidth={lineNumberWidth}
            rowHeight={ROW_HEIGHT}
          />
        ))}
      </div>
    </div>
  );
}

// Individual log line with highlighting
function LogLine({ line, lineNumber, lineNumberWidth, rowHeight }) {
  const isError = line.type === 'error';
  const isWarn = line.type === 'warn';
  const isInfo = line.type === 'info';
  const isDebug = line.type === 'debug';

  const rowStyle = {
    display: 'flex',
    minWidth: '100%',
    width: 'max-content',
    height: rowHeight,
    background: isError ? 'rgba(239,68,68,.08)' : isWarn ? 'rgba(245,158,11,.05)' : 'transparent',
  };

  const gutterStyle = {
    position: 'sticky',
    left: 0,
    zIndex: 1,
    width: lineNumberWidth,
    flexShrink: 0,
    padding: '0 12px 0 16px',
    borderRight: '1px solid var(--border)',
    textAlign: 'right',
    color: isError ? '#fca5a5' : isWarn ? '#fcd34d' : 'var(--text-muted)',
    // Opaque background so text sliding under doesn't show through
    background: 'var(--bg-elevated)',
    boxSizing: 'border-box',
    userSelect: 'none',
  };

  const contentStyle = {
    padding: '0 16px',
    whiteSpace: 'pre',
    color: isError ? '#fca5a5' : isWarn ? '#fcd34d' : isInfo ? 'var(--text-secondary)' : isDebug ? 'var(--text-muted)' : 'var(--text-primary)',
    fontWeight: isError ? 600 : isWarn ? 500 : 400,
    boxShadow: isError ? 'inset 3px 0 0 #ef4444' : isWarn ? 'inset 3px 0 0 #f59e0b' : 'none',
    boxSizing: 'border-box',
    userSelect: 'text',
  };

  return (
    <div style={rowStyle}>
      <div style={gutterStyle}>{lineNumber}</div>
      <div style={contentStyle}>{line.text}</div>
    </div>
  );
}

// Analyze log line type with better detection
function analyzeLogLine(line) {
  const upper = line.toUpperCase();
  
  // Error patterns - must be more strict
  const errorPatterns = [
    /\[ERROR\]/i,
    /\bERROR:/i,
    /\bERROR\b/i,
    /\[SEVERE\]/i,
    /\bSEVERE:/i,
    /\bFATAL:/i,
    /\[FATAL\]/i,
    /Exception in/i,
    /^\s*at\s+[\w.]+\(/,  // Stack trace
    /Caused by:/i,
    /java\.lang\.\w+Exception/i,
    /java\.lang\.\w+Error/i,
  ];
  
  // Warning patterns
  const warnPatterns = [
    /\[WARN\]/i,
    /\bWARN:/i,
    /\bWARNING:/i,
    /\[WARNING\]/i,
    /\bWARN\b/i,
  ];
  
  // Info patterns
  const infoPatterns = [
    /\[INFO\]/i,
    /\bINFO:/i,
  ];
  
  // Debug patterns
  const debugPatterns = [
    /\[DEBUG\]/i,
    /\bDEBUG:/i,
    /\[TRACE\]/i,
    /\bTRACE:/i,
  ];
  
  for (const pattern of errorPatterns) {
    if (pattern.test(line)) {
      return { type: 'error' };
    }
  }
  
  for (const pattern of warnPatterns) {
    if (pattern.test(line)) {
      return { type: 'warn' };
    }
  }
  
  for (const pattern of infoPatterns) {
    if (pattern.test(line)) {
      return { type: 'info' };
    }
  }
  
  for (const pattern of debugPatterns) {
    if (pattern.test(line)) {
      return { type: 'debug' };
    }
  }
  
  return { type: 'normal' };
}
