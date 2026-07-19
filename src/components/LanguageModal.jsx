import React, { useState, useEffect } from 'react';
import { getSetting, setSetting } from '../utils/settings';
import { useTranslation } from '../i18n';

const LANGUAGES = [
  {
    id: 'en',
    label: 'English',
    native: 'English',
    description: 'Interface language: English',
  },
  {
    id: 'ru',
    label: 'Русский',
    native: 'Русский',
    description: 'Язык интерфейса: русский',
  },
];

export default function LanguageModal({ onComplete }) {
  const { setLang } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const done = await getSetting('language_selected', false);
      if (cancelled) return;
      if (done) {
        onComplete();
      } else {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [onComplete]);

  const handleSelect = async (langId) => {
    if (applying) return;
    setSelected(langId);
    setApplying(true);
    await setLang(langId);
    await setSetting('language_selected', true);
    onComplete();
  };

  if (loading) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999999,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.2s ease'
    }}>
      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        width: 460,
        maxWidth: '90vw',
        padding: 0,
        overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Header with gradient accent */}
        <div style={{
          padding: '32px 32px 20px',
          textAlign: 'center',
          background: 'linear-gradient(180deg, var(--bg-overlay) 0%, transparent 100%)',
          borderBottom: '1px solid var(--border)'
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            margin: '0 auto 14px',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-dim))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, color: 'white',
            boxShadow: '0 8px 25px var(--accent-glow)'
          }}>
            YL
          </div>
          <h2 style={{
            fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text-primary)',
            letterSpacing: '-0.3px'
          }}>
            YoloLauncher
          </h2>
          <p style={{
            fontSize: 13, color: 'var(--text-secondary)',
            margin: '6px 0 0', lineHeight: 1.5
          }}>
            Choose your preferred language to get started
            <br />
            Выберите язык для продолжения
          </p>
        </div>

        {/* Language options */}
        <div style={{
          padding: '20px 32px 28px',
          display: 'flex', flexDirection: 'column', gap: 12
        }}>
          {LANGUAGES.map(lang => {
            const isActive = selected === lang.id;
            return (
              <button
                key={lang.id}
                onClick={() => handleSelect(lang.id)}
                disabled={applying}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '18px 20px',
                  borderRadius: 14,
                  border: `1px solid ${isActive ? 'var(--border-accent)' : 'var(--border)'}`,
                  background: isActive
                    ? 'linear-gradient(135deg, var(--accent-glow), transparent)'
                    : 'var(--bg-overlay)',
                  cursor: applying ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'left',
                  width: '100%',
                  fontFamily: 'inherit',
                  opacity: applying && !isActive ? 0.5 : 1,
                  outline: 'none'
                }}
                onMouseEnter={e => {
                  if (!applying) {
                    e.currentTarget.style.borderColor = 'var(--border-accent)';
                    e.currentTarget.style.background = 'var(--bg-glass-hover)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.background = 'var(--bg-overlay)';
                  } else {
                    e.currentTarget.style.borderColor = 'var(--border-accent)';
                    e.currentTarget.style.background = 'linear-gradient(135deg, var(--accent-glow), transparent)';
                  }
                }}
              >
                {/* Icon circle */}
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: isActive
                    ? 'linear-gradient(135deg, var(--accent), var(--accent-dim))'
                    : 'var(--bg-glass)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 700, color: isActive ? 'white' : 'var(--text-secondary)',
                  flexShrink: 0,
                  transition: 'all 0.2s ease'
                }}>
                  {lang.id === 'en' ? 'EN' : 'RU'}
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                    marginBottom: 2
                  }}>
                    {lang.native}
                  </div>
                  <div style={{
                    fontSize: 12, color: 'var(--text-muted)'
                  }}>
                    {lang.description}
                  </div>
                </div>

                {/* Check indicator */}
                {isActive && (
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '0 32px 20px',
          textAlign: 'center'
        }}>
          <p style={{
            fontSize: 11, color: 'var(--text-muted)', margin: 0,
            lineHeight: 1.4
          }}>
            You can always change the language later in Settings
            <br />
            Язык можно будет изменить позже в настройках
          </p>
        </div>
      </div>
    </div>
  );
}
