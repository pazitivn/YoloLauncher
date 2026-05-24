import React from 'react';
import { useTranslation } from '../i18n';
import { Server, Wifi, WifiOff } from 'lucide-react';

export default function ServersPage() {
  const { t } = useTranslation();

  return (
    <div className="page">
      <div className="page-header fade-in-up" style={{ animationDelay: '0ms' }}>
        <div className="page-title">{t('serversTitle')}</div>
        <div className="page-subtitle">{t('serversSubtitle')}</div>
      </div>

      <div className="empty-state fade-in-up" style={{ animationDelay: '60ms' }}>
        <div className="empty-icon">
          <Server size={48} opacity={0.4} />
        </div>
        <div className="empty-title">{t('serversComingSoon')}</div>
        <div className="empty-desc" style={{ maxWidth: 360 }}>
          {t('serversComingSoonDesc')}
        </div>
        <div style={{
          marginTop: 12,
          padding: '12px 20px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          fontSize: 12,
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: 360,
          textAlign: 'left',
          lineHeight: 1.6
        }}>
          <Wifi size={16} style={{ flexShrink: 0, color: 'var(--accent-bright)' }} />
          {t('serversModNote')}
        </div>
      </div>
    </div>
  );
}
