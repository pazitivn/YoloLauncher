import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getSetting } from '../utils/settings';

export default function UpdateModal({ onComplete }) {
  const [checked, setChecked] = useState(false);
  const [phase, setPhase] = useState('checking'); // 'checking' | 'downloading' | 'applying'
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    async function run() {
      // Check if auto-update is enabled in settings
      const autoUpdate = await getSetting('auto_update', true);
      if (!autoUpdate) {
        onComplete();
        return;
      }

      try {
        // Step 1: Check for update
        const info = await invoke('check_for_update');

        if (!info.available) {
          // No update available, proceed to normal launch
          onComplete();
          return;
        }

        if (!info.download_url) {
          // Update available but no download URL (no file.update asset)
          onComplete();
          return;
        }

        setChecked(true);
        setPhase('downloading');

        // Listen for download progress events
        const unlisten = await listen('update-download-progress', (event) => {
          setPercent(event.payload.percent);
        });

        // Step 2: Download update
        const tempFile = await invoke('download_update', { downloadUrl: info.download_url });

        unlisten();

        // Step 3: Apply update (replace exe, restart)
        setPhase('applying');
        await invoke('apply_update', { tempFile });

        // The process will exit before reaching here — apply_update calls std::process::exit(0)
      } catch (err) {
        console.error('[update]', err);
        setError(String(err));
        // On error, proceed to normal launch after a short delay
        setTimeout(() => onComplete(), 1500);
      }
    }

    run();
  }, [onComplete]);

  // If check passed but no update needed, don't render anything
  if (!checked && !error) {
    return null;
  }

  // Smooth percentage for the progress bar
  const displayPercent = Math.min(100, Math.max(0, percent));

  return (
    <div className="modal-overlay" style={{ zIndex: 100000 }}>
      <div className="modal" style={{ width: 420, textAlign: 'center' }}>
        <div className="modal-title" style={{ marginBottom: 16 }}>
          {error
            ? 'Ошибка обновления'
            : phase === 'applying'
            ? 'Запуск новой версии...'
            : 'Установка обновления YoloLauncher...'}
        </div>

        {error ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, wordBreak: 'break-word' }}>
              {error}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              Лаунчер продолжит обычный запуск
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                width: '100%',
                height: 6,
                borderRadius: 3,
                background: 'var(--bg-overlay)',
                overflow: 'hidden',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 3,
                  background: 'linear-gradient(90deg, var(--accent-dim), var(--accent-bright))',
                  width: `${displayPercent}%`,
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {phase === 'applying' ? 'Завершение...' : `${displayPercent}%`}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
