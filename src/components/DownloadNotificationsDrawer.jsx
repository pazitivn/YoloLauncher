import React, { useState, useMemo } from 'react';
import { useDownloads } from './DownloadNotifications';
import { Download, Loader2, CheckCircle2, XCircle, X, ChevronDown } from 'lucide-react';

export default function DownloadNotificationsDrawer() {
  const { activeDownloads, systemDownloads } = useDownloads();
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Collect all active / recent downloads (instance + system)
  const items = useMemo(() => {
    const all = [];

    // Instance downloads
    Object.values(activeDownloads).forEach((dl) => {
      if (!dl.done || dl.percent === 100) {
        all.push({ ...dl, type: 'instance' });
      }
    });

    // System downloads (PMC)
    Object.values(systemDownloads).forEach((dl) => {
      all.push({ ...dl, type: 'system' });
    });

    // Sort: active first, then by percent asc
    all.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.percent - b.percent;
    });

    return all;
  }, [activeDownloads, systemDownloads]);

  if (dismissed || items.length === 0) return null;

  const icon = (item) => {
    if (item.done && item.error) return <XCircle size={16} color="var(--red)" />;
    if (item.done) return <CheckCircle2 size={16} color="var(--green)" />;
    return <Loader2 size={14} className="download-icon-spin" />;
  };

  return (
    <div className="download-notifications-container">
      {minimized ? (
        <div className="download-notif-mini" onClick={() => setMinimized(false)}>
          <Download size={14} />
          {items.filter(i => !i.done).length > 0
            ? `${items.filter(i => !i.done).length} active`
            : 'Done'}
        </div>
      ) : (
        <div className="download-notif-drawer">
          <div className="download-notif-header">
            <div className="download-notif-header-left">
              <Download size={15} />
              <span>Downloads</span>
            </div>
            <div className="download-notif-header-actions">
              <button className="download-notif-btn" onClick={() => setMinimized(true)} title="Hide">
                <ChevronDown size={14} />
              </button>
              <button className="download-notif-btn" onClick={() => setDismissed(true)} title="Close">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="download-notif-list">
            {items.map((item, idx) => (
              <div
                key={idx}
                className={`download-notif-item${item.done ? (item.error ? ' error' : ' done') : ''}`}
              >
                <div className="download-notif-item-header">
                  <span className="download-notif-item-icon">{icon(item)}</span>
                  <div className="download-notif-item-info">
                    <div className="download-notif-item-name">{item.name || item.instance_name || 'Download'}</div>
                    <div className="download-notif-item-stage">
                      {item.error
                        ? item.error
                        : item.done
                          ? (item.error ? item.error : 'Complete')
                          : (item.stage || `${Math.round(item.percent)}%`)}
                    </div>
                  </div>
                  {!item.done && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}>
                      {Math.round(item.percent)}%
                    </span>
                  )}
                </div>
                {!item.done && item.percent > 0 && (
                  <div className="download-notif-item-progress">
                    <div className="loader-bar">
                      <div className="loader-bar-fill" style={{ width: `${item.percent}%` }} />
                    </div>
                    <span className="download-notif-item-percent">{Math.round(item.percent)}%</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
