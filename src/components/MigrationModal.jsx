import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Download, ChevronDown, Check, X } from 'lucide-react';
import { getSetting, setSetting } from '../utils/settings';

export default function MigrationModal({ onComplete }) {
  const [launchers, setLaunchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  useEffect(() => {
    async function init() {
      const isDone = await getSetting('migration_done', false);
      if (isDone) {
        onComplete(false);
        return;
      }
      
      try {
        const found = await invoke('scan_old_launchers');
        if (found && found.length > 0) {
          setLaunchers(found);
          // auto select all
          const allItems = new Set();
          const allGroups = new Set();
          found.forEach(l => {
            allGroups.add(l.id);
            l.items.forEach(i => allItems.add(i.id));
          });
          setSelectedItems(allItems);
          setExpandedGroups(allGroups);
        } else {
          // nothing found, mark done
          await setSetting('migration_done', true);
          onComplete(false);
        }
      } catch (e) {
        console.error("Migration scan failed", e);
        await setSetting('migration_done', true);
        onComplete(false);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [onComplete]);

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleItem = (itemId) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      // gather selected MigrationItems
      const itemsToMigrate = [];
      launchers.forEach(l => {
        l.items.forEach(item => {
          if (selectedItems.has(item.id)) {
            itemsToMigrate.push(item);
          }
        });
      });

      if (itemsToMigrate.length > 0) {
        await invoke('migrate_data', { items: itemsToMigrate });
      }
      
      await setSetting('migration_done', true);
      onComplete(true);
    } catch (e) {
      console.error("Migration failed", e);
      alert("Ошибка при миграции: " + e);
      setMigrating(false);
    }
  };

  const handleSkip = async () => {
    await setSetting('migration_done', true);
    onComplete(false);
  };

  if (loading) return null;
  if (launchers.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border-accent)',
        borderRadius: 16, width: 480, maxWidth: '90vw',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Header */}
        <div style={{ padding: '24px 24px 16px', display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent), var(--accent-dim))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
            }}>
              <Download size={18} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Найдены старые лаунчеры
            </h2>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '10px 0 0', lineHeight: 1.5 }}>
            Мы обнаружили данные из других лаунчеров. Выберите, что вы хотите перенести в YoloLauncher в один клик.
          </p>
        </div>

        {/* Content */}
        <div style={{ 
          maxHeight: '55vh', 
          overflowY: 'auto', 
          padding: '16px 24px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 12 
        }}>
          {launchers.map(launcher => (
              <div key={launcher.id} style={{
                background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', flexShrink: 0
              }}>
                {/* Group Header */}
                <div 
                  onClick={() => toggleGroup(launcher.id)}
                  style={{ 
                    padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                    cursor: 'pointer', background: 'var(--bg-glass)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
                    <ChevronDown size={16} style={{ 
                      transition: 'transform 0.2s', 
                      transform: expandedGroups.has(launcher.id) ? 'rotate(180deg)' : 'rotate(0deg)' 
                    }} />
                    {launcher.name}
                    <span style={{ fontSize: 11, background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: 12, color: 'var(--text-muted)' }}>
                      {launcher.items.length}
                    </span>
                  </div>
                </div>

                {/* Group Items */}
                {expandedGroups.has(launcher.id) && (
                  <div style={{ borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                    {launcher.items.map(item => (
                      <div 
                        key={item.id} 
                        onClick={() => toggleItem(item.id)}
                        style={{ 
                          padding: '10px 16px 10px 40px', display: 'flex', alignItems: 'center', gap: 12, 
                          cursor: 'pointer', borderTop: '1px solid var(--border)', marginTop: -1
                        }}
                      >
                        <div style={{ 
                          width: 16, height: 16, borderRadius: 4, border: '1px solid var(--border)', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: selectedItems.has(item.id) ? 'var(--accent)' : 'transparent',
                          borderColor: selectedItems.has(item.id) ? 'var(--accent)' : 'var(--border)'
                        }}>
                          {selectedItems.has(item.id) && <Check size={12} color="white" />}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{item.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {item.type === 'account' ? 'Аккаунт' : 'Сборка'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', background: 'var(--bg-base)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
          <button 
            className="btn btn-secondary" 
            onClick={handleSkip}
            disabled={migrating}
          >
            Пропустить
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleMigrate}
            disabled={migrating || selectedItems.size === 0}
          >
            {migrating ? 'Перенос...' : `Перенести выбранное (${selectedItems.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
