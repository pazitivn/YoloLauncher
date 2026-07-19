import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../components/ToastProvider';
import { useTranslation } from '../i18n';
import {
  ArrowLeft, Trash2, HardDrive, PackageOpen, Loader2,
  AlertTriangle, FolderOutput, Info, CheckCircle, XCircle, RefreshCw
} from 'lucide-react';

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function VersionsPage({ onBack }) {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(null);

  // States for migration logic
  const [migrationStep, setMigrationStep] = useState(0); // 0 = hidden, 1 = warning, 2 = confirm, 3 = results
  const [malformedData, setMalformedData] = useState({ modpacks: [], emptyFolders: [], duplicateLoaders: [] });
  const [migrationStatus, setMigrationStatus] = useState({});
  const [isMigrating, setIsMigrating] = useState(false);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke('get_versions_detail');
      // Debug: log raw data to console to diagnose display issues
      console.log('[VersionsPage] Raw data from get_versions_detail:', data);
      if (data.length > 0) {
        console.log('[VersionsPage] First entry keys:', Object.keys(data[0]));
        console.log('[VersionsPage] First entry:', data[0]);
      }
      setVersions(data);
    } catch (e) {
      console.error('[VersionsPage] Failed to load versions:', e);
      addToast('Failed to load versions: ' + e, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadVersions();

    // Scan for TLauncher modpacks, empty folders and duplicates when page opens
    invoke('scan_malformed_versions').then(res => {
      if (res.modpacks.length > 0 || res.empty_folders.length > 0 || res.duplicate_loaders.length > 0) {
        setMalformedData({ 
          modpacks: res.modpacks, 
          emptyFolders: res.empty_folders,
          duplicateLoaders: res.duplicate_loaders 
        });
        setMigrationStep(1); // Trigger step 1
      }
    }).catch(console.error);
  }, [loadVersions]);

  const runMigration = async (itemsToRun) => {
    setIsMigrating(true);
    setMigrationStep(3);

    let newStatus = { ...migrationStatus };
    
    // Initialize processing state for items to be processed in this run
    itemsToRun.modpacks.forEach(m => {
      if (newStatus[m]?.status !== 'Success') newStatus[m] = { type: 'modpack', status: 'pending' };
    });
    itemsToRun.emptyFolders.forEach(e => {
      if (newStatus[e]?.status !== 'Success') newStatus[e] = { type: 'empty', status: 'pending' };
    });
    itemsToRun.duplicateLoaders.forEach(d => {
      if (newStatus[d]?.status !== 'Success') newStatus[d] = { type: 'duplicate', status: 'pending' };
    });
    setMigrationStatus({ ...newStatus });

    // Process modpacks
    for (const name of itemsToRun.modpacks) {
      if (newStatus[name]?.status === 'Success') continue;
      
      setMigrationStatus(prev => ({ ...prev, [name]: { ...prev[name], status: 'processing' } }));
      try {
        const res = await invoke('migrate_modpack', { name });
        setMigrationStatus(prev => ({ ...prev, [name]: { ...prev[name], status: res.status, error: res.error } }));
      } catch (e) {
        setMigrationStatus(prev => ({ ...prev, [name]: { ...prev[name], status: 'CopyFailed', error: String(e) } }));
      }
    }

    // Process empty folders
    for (const name of itemsToRun.emptyFolders) {
      if (newStatus[name]?.status === 'Success') continue;
      
      setMigrationStatus(prev => ({ ...prev, [name]: { ...prev[name], status: 'processing' } }));
      try {
        const res = await invoke('delete_empty_folder', { name });
        setMigrationStatus(prev => ({ ...prev, [name]: { ...prev[name], status: res.status, error: res.error } }));
      } catch (e) {
        setMigrationStatus(prev => ({ ...prev, [name]: { ...prev[name], status: 'DeleteFailed', error: String(e) } }));
      }
    }

    // Process duplicate loaders (delete them)
    for (const name of itemsToRun.duplicateLoaders) {
      if (newStatus[name]?.status === 'Success') continue;
      
      setMigrationStatus(prev => ({ ...prev, [name]: { ...prev[name], status: 'processing' } }));
      try {
        // We reuse the existing delete_version_folder command
        await invoke('delete_version_folder', { versionId: name });
        setMigrationStatus(prev => ({ ...prev, [name]: { ...prev[name], status: 'Success', error: null } }));
      } catch (e) {
        setMigrationStatus(prev => ({ ...prev, [name]: { ...prev[name], status: 'DeleteFailed', error: String(e) } }));
      }
    }

    // Update instance.json custom_paths if needed
    try {
      await invoke('fix_instance_paths');
    } catch (e) {
      console.error("Failed to fix instance paths:", e);
    }

    setIsMigrating(false);
  };

  // Group versions by minecraft_version, then by loader
  // Filter out entries with missing/empty key fields (defensive)
  const grouped = React.useMemo(() => {
    const groups = {};
    for (const v of versions) {
      if (!v.id || !v.minecraft_version) continue;

      // ОПРЕДЕЛЕНИЕ СБОРОК: Если версия содержит пробелы или скобки, 
      // это сторонние сборки (например, из TLauncher). Группируем их отдельно.
      const isCustom = /[\s\[\]А-Яа-я]/.test(v.minecraft_version);
      const mcVer = isCustom ? "Сборки (TL / Сторонние)" : v.minecraft_version;

      if (!groups[mcVer]) {
        groups[mcVer] = { vanilla: [], loaders: {} };
      }
      if (v.loader) {
        if (!groups[mcVer].loaders[v.loader]) {
          groups[mcVer].loaders[v.loader] = [];
        }
        groups[mcVer].loaders[v.loader].push(v);
      } else {
        groups[mcVer].vanilla.push(v);
      }
    }
    return groups;
  }, [versions]);

  const mcVersions = Object.keys(grouped)
    .filter(k => k.length > 0)
    .sort((a, b) => {
      // Спускаем категорию со сборками в самый конец списка
      if (a === "Сборки (TL / Сторонние)") return 1;
      if (b === "Сборки (TL / Сторонние)") return -1;
      return b.localeCompare(a, undefined, { numeric: true });
    });

  // Debug grouping
  React.useEffect(() => {
    if (versions.length > 0) {
      console.log('[VersionsPage] versions count:', versions.length);
      console.log('[VersionsPage] grouped keys:', Object.keys(grouped));
      console.log('[VersionsPage] mcVersions:', mcVersions);
      console.log('[VersionsPage] grouped:', grouped);
    }
  }, [versions, grouped, mcVersions]);

  async function handleDelete(versionId) {
    setDeleting(prev => new Set(prev).add(versionId));
    try {
      await invoke('delete_version_folder', { versionId });
      setVersions(prev => prev.filter(v => v.id !== versionId));
      addToast(`"${versionId}" deleted`, 'success');
      setConfirmDelete(null);
    } catch (e) {
      addToast(String(e), 'error');
    } finally {
      setDeleting(prev => {
        const next = new Set(prev);
        next.delete(versionId);
        return next;
      });
    }
  }

  async function handleDeleteLoader(mcVersion, loader) {
    const targets = grouped[mcVersion]?.loaders[loader];
    if (!targets || targets.length === 0) return;
    setConfirmDelete(null);

    for (const v of targets) {
      setDeleting(prev => new Set(prev).add(v.id));
    }

    let success = true;
    for (const v of targets) {
      try {
        await invoke('delete_version_folder', { versionId: v.id });
        setVersions(prev => prev.filter(x => x.id !== v.id));
      } catch (e) {
        addToast(`Failed to delete "${v.id}": ${e}`, 'error');
        success = false;
      } finally {
        setDeleting(prev => {
          const next = new Set(prev);
          next.delete(v.id);
          return next;
        });
      }
    }
    if (success) {
      addToast(`${loader} for ${mcVersion} deleted`, 'success');
    }
  }

  async function handleDeleteMcVersion(mcVersion) {
    const group = grouped[mcVersion];
    const allVersions = [
      ...group.vanilla,
      ...Object.values(group.loaders).flat(),
    ];
    setConfirmDelete(null);

    for (const v of allVersions) {
      setDeleting(prev => new Set(prev).add(v.id));
    }

    let success = true;
    for (const v of allVersions) {
      try {
        await invoke('delete_version_folder', { versionId: v.id });
        setVersions(prev => prev.filter(x => x.id !== v.id));
      } catch (e) {
        addToast(`Failed to delete "${v.id}": ${e}`, 'error');
        success = false;
      } finally {
        setDeleting(prev => {
          const next = new Set(prev);
          next.delete(v.id);
          return next;
        });
      }
    }
    if (success) {
      addToast(`Version ${mcVersion} deleted`, 'success');
    }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn btn-secondary btn-icon" onClick={onBack} title={t('backToAccounts')}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="page-title">{t('versionManagement')}</div>
            <div className="page-subtitle">{versions.length} {t('versionsCount')}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <Loader2 size={48} className="spin" opacity={0.5} />
          <div className="empty-title">{t('loading')}</div>
        </div>
      ) : versions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><PackageOpen size={48} opacity={0.5} /></div>
          <div className="empty-title">{t('noVersionsInstalled')}</div>
          <div className="empty-desc">{t('noVersionsInstalledDesc')}</div>
        </div>
      ) : (
        <div className="versions-list">
          {mcVersions.map(mcVer => {
            const group = grouped[mcVer];
            const totalSize = [...group.vanilla, ...Object.values(group.loaders).flat()]
              .reduce((sum, v) => sum + v.size_bytes, 0);
            const loaderNames = Object.keys(group.loaders);
            const hasVanilla = group.vanilla.length > 0;

            return (
              <div key={mcVer} className="version-group" style={{ flexShrink: 0 }}>
                <div className="version-group-header">
                  <div className="version-group-title">
                    <span className="version-mc-name">{mcVer}</span>
                    <span className="version-size">{formatSize(totalSize)}</span>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => setConfirmDelete({ type: 'mc', mcVer })}
                    disabled={deleting.size > 0}
                    style={{ padding: '5px 10px', fontSize: 11 }}
                  >
                    <Trash2 size={12} /> {t('delete')}
                  </button>
                </div>

                <div className="version-sublist">
                  {hasVanilla && (
                    <div className="version-loader-group">
                      <div className="version-loader-header">
                        <span className="version-loader-name">Vanilla</span>
                        <span className="version-size">
                          {formatSize(group.vanilla.reduce((s, v) => s + v.size_bytes, 0))}
                        </span>
                      </div>
                      {group.vanilla.map(v => (
                        <div key={v.id} className="version-item">
                          <span className="version-item-name">{v.id}</span>
                          <span className="version-item-size">{formatSize(v.size_bytes)}</span>
                          <button
                            className="btn btn-danger btn-sm btn-icon"
                            style={{ width: 26, height: 26, padding: 0, flexShrink: 0 }}
                            disabled={deleting.has(v.id)}
                            onClick={() => setConfirmDelete({ type: 'single', versionId: v.id })}
                          >
                            {deleting.has(v.id) ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {loaderNames.map(loader => {
                    const lvVersions = group.loaders[loader];
                    const loaderTotalSize = lvVersions.reduce((s, v) => s + v.size_bytes, 0);

                    return (
                      <div key={loader} className="version-loader-group">
                        <div className="version-loader-header">
                          <span className="version-loader-name">{loader}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="version-size">{formatSize(loaderTotalSize)}</span>
                            <button
                              className="btn btn-danger btn-sm btn-icon"
                              style={{ width: 26, height: 26, padding: 0 }}
                              disabled={deleting.size > 0}
                              onClick={() => setConfirmDelete({ type: 'loader', mcVer, loader })}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        {lvVersions.map(v => (
                          <div key={v.id} className="version-item">
                            <span className="version-item-name">
                              {v.loader_version || v.id}
                            </span>
                            <span className="version-item-size">{formatSize(v.size_bytes)}</span>
                            <button
                              className="btn btn-danger btn-sm btn-icon"
                              style={{ width: 26, height: 26, padding: 0, flexShrink: 0 }}
                              disabled={deleting.has(v.id)}
                              onClick={() => setConfirmDelete({ type: 'single', versionId: v.id })}
                            >
                              {deleting.has(v.id) ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Предупреждение о миграции */}
      {migrationStep === 1 && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" style={{ width: 480 }}>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Info size={20} color="var(--accent-secondary)" />
              Оптимизация папки версий
            </div>
            <div style={{ margin: '16px 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Обнаружено неправильное расположение сборок или наличие дубликатов загрузчиков в папке версий.<br/><br/>
              Чаще всего так делает TLauncher. Для корректной работы мы можем автоматически перенести сборки и очистить мусор. Ваши файлы игры не пострадают.
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onBack}>
                Назад
              </button>
              <button className="btn btn-primary" onClick={() => setMigrationStep(2)}>
                Продолжить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Подтверждение списка файлов */}
      {migrationStep === 2 && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" style={{ width: 500 }}>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FolderOutput size={20} color="var(--accent-secondary)" />
              Подтверждение действий
            </div>
            <div style={{ margin: '16px 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Сборки будут перенесены в <b>instances</b>, дубликаты загрузчиков и пустые папки — удалены.
              
              {malformedData.modpacks.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Сборки к переносу ({malformedData.modpacks.length}):</strong>
                  <ul style={{ paddingLeft: 20, marginTop: 6, maxHeight: 120, overflowY: 'auto' }}>
                    {malformedData.modpacks.map(m => <li key={m} style={{ padding: '2px 0' }}>{m}</li>)}
                  </ul>
                </div>
              )}

              {malformedData.duplicateLoaders.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Дубликаты загрузчиков к удалению ({malformedData.duplicateLoaders.length}):</strong>
                  <ul style={{ paddingLeft: 20, marginTop: 6, maxHeight: 120, overflowY: 'auto' }}>
                    {malformedData.duplicateLoaders.map(d => <li key={d} style={{ padding: '2px 0' }}>{d}</li>)}
                  </ul>
                </div>
              )}
              
              {malformedData.emptyFolders.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Пустые папки к удалению ({malformedData.emptyFolders.length}):</strong>
                  <ul style={{ paddingLeft: 20, marginTop: 6, maxHeight: 120, overflowY: 'auto' }}>
                    {malformedData.emptyFolders.map(e => <li key={e} style={{ padding: '2px 0' }}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onBack}>
                Отмена
              </button>
              <button className="btn btn-primary" onClick={() => runMigration(malformedData)}>
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Итоги и прогресс */}
      {migrationStep === 3 && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" style={{ width: 550 }}>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <RefreshCw size={20} className={isMigrating ? "spin" : ""} color="var(--accent-secondary)" />
              Итог переноса
            </div>
            <div style={{ margin: '16px 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxHeight: 350, overflowY: 'auto', paddingRight: 4 }}>
              {Object.entries(migrationStatus).map(([name, info]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10, padding: '12px', background: 'var(--bg-overlay)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  {info.status === 'pending' || info.status === 'processing' ? (
                    <Loader2 size={16} className="spin" color="var(--accent-secondary)" style={{ flexShrink: 0, marginTop: 2 }} />
                  ) : info.status === 'Success' ? (
                    <CheckCircle size={16} color="var(--green)" style={{ flexShrink: 0, marginTop: 2 }} />
                  ) : info.status === 'CopiedButNotDeleted' ? (
                    <AlertTriangle size={16} color="var(--yellow)" style={{ flexShrink: 0, marginTop: 2 }} />
                  ) : (
                    <XCircle size={16} color="var(--red)" style={{ flexShrink: 0, marginTop: 2 }} />
                  )}
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {name} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        ({info.type === 'modpack' ? 'Сборка' : info.type === 'duplicate' ? 'Дубликат загрузчика (TL)' : 'Пустая папка'})
                      </span>
                    </div>
                    
                    {info.status === 'CopiedButNotDeleted' && (
                      <div style={{ fontSize: 12, color: 'var(--yellow)', marginTop: 4 }}>
                        Успешно скопировано в instances, но старая папка не удалена (файл занят). Закройте игру и нажмите "Повторить попытку".
                      </div>
                    )}
                    {(info.status === 'CopyFailed' || info.status === 'DeleteFailed') && (
                      <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>
                        Ошибка: {info.error}. Закройте игру и другие программы, использующие файлы, и повторите попытку.
                      </div>
                    )}
                    {info.status === 'Success' && (
                      <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 4 }}>
                        Успешно завершено.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="modal-footer">
              {isMigrating ? (
                <button className="btn btn-secondary" disabled>
                  В процессе...
                </button>
              ) : Object.values(migrationStatus).every(s => s.status === 'Success') ? (
                <button className="btn btn-primary" onClick={() => { setMigrationStep(0); loadVersions(); }}>
                  Готово
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => {
                  // Выбираем только те элементы, которые выдали ошибку
                  const failedModpacks = malformedData.modpacks.filter(m => migrationStatus[m]?.status !== 'Success');
                  const failedEmpty = malformedData.emptyFolders.filter(e => migrationStatus[e]?.status !== 'Success');
                  const failedDuplicates = malformedData.duplicateLoaders.filter(d => migrationStatus[d]?.status !== 'Success');
                  runMigration({ modpacks: failedModpacks, emptyFolders: failedEmpty, duplicateLoaders: failedDuplicates });
                }}>
                  Повторить попытку
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal" role="dialog" style={{ width: 400 }}>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={20} color="var(--red)" />
              {t('confirmDelete')}
            </div>
            <div style={{ margin: '16px 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {confirmDelete.type === 'single' && (
                <span>{t('deleteVersionConfirm').replace('{version}', confirmDelete.versionId)}</span>
              )}
              {confirmDelete.type === 'loader' && (
                <span>{t('deleteLoaderConfirm')
                  .replace('{loader}', confirmDelete.loader)
                  .replace('{version}', confirmDelete.mcVer)}
                </span>
              )}
              {confirmDelete.type === 'mc' && (
                <span>{t('deleteMcVersionConfirm').replace('{version}', confirmDelete.mcVer)}</span>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                {t('cancel')}
              </button>
              <button className="btn btn-danger" onClick={() => {
                if (confirmDelete.type === 'single') {
                  handleDelete(confirmDelete.versionId);
                } else if (confirmDelete.type === 'loader') {
                  handleDeleteLoader(confirmDelete.mcVer, confirmDelete.loader);
                } else if (confirmDelete.type === 'mc') {
                  handleDeleteMcVersion(confirmDelete.mcVer);
                }
              }}>
                <Trash2 size={14} /> {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debug: raw data dump (remove after diagnosing) */}
      {versions.length > 0 && (
        <details style={{ marginTop: 32, padding: 16, background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Debug: Raw Versions Data ({versions.length} entries)
          </summary>
          <pre style={{ marginTop: 12, fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 300, overflow: 'auto', fontFamily: 'monospace' }}>
            {JSON.stringify(versions, null, 2)}
          </pre>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
            mcVersions keys: [{mcVersions.join(', ')}]
          </div>
        </details>
      )}
    </div>
  );
}