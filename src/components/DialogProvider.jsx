import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setDialog({ message, options, resolve });
    });
  }, []);

  const handleClose = (result) => {
    if (dialog) {
      dialog.resolve(result);
      setDialog(null);
    }
  };

  return (
    <DialogContext.Provider value={{ confirm }}>
      {children}
      {dialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.15s ease-out'
        }} onClick={() => handleClose(false)}>
          <div style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 16, width: 400, maxWidth: '90vw',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
            animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14 }}>
                {dialog.options.kind === 'warning' && <AlertTriangle size={18} color="var(--yellow)" />}
                {dialog.options.title || 'Подтверждение'}
              </div>
              <button onClick={() => handleClose(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
            </div>
            {/* Body */}
            <div style={{ padding: '20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {dialog.message}
            </div>
            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '16px 20px', background: 'var(--bg-base)', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={() => handleClose(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={() => handleClose(true)} style={dialog.options.kind === 'warning' ? { background: '#ef4444', color: 'white', borderColor: '#dc2626' } : {}}>
                {dialog.options.okLabel || 'ОК'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export const useDialog = () => useContext(DialogContext);
