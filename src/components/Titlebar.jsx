import React from 'react';
import { Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export default function Titlebar() {
  const appWindow = getCurrentWindow();

  return (
    <div className="titlebar">
      <div className="titlebar-logo">
        <div className="logo-dot" />
        <span>YoloLauncher <span style={{ opacity: 0.6, fontSize: 10, marginLeft: 4, fontWeight: 600 }}>v0.5 Beta</span></span>
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-btn" onClick={() => appWindow.minimize().catch(console.error)} title="Minimize">
          <Minus size={14} />
        </button>
        <button className="titlebar-btn" onClick={() => appWindow.toggleMaximize().catch(console.error)} title="Maximize">
          <Square size={12} />
        </button>
        <button className="titlebar-btn close" onClick={() => appWindow.close().catch(console.error)} title="Close">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
