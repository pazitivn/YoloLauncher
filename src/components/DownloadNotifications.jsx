import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const DownloadContext = createContext(null);

export function DownloadProvider({ children }) {
  const [activeDownloads, setActiveDownloads] = useState({});
  const [systemDownloads, setSystemDownloads] = useState({});
  const waitResolvers = useRef({});

  useEffect(() => {
    const unlisten = listen('download-progress', (event) => {
      const progress = event.payload;
      setActiveDownloads(prev => ({
        ...prev,
        [progress.instance_id]: progress,
      }));

      if (progress.done) {
        const resolver = waitResolvers.current[progress.instance_id];
        if (resolver) {
          resolver(progress);
          delete waitResolvers.current[progress.instance_id];
        }
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const startDownload = useCallback(async (instance, mcVersions, waitForFinish) => {
    const versionMeta = mcVersions.find(v => v.id === instance.minecraft_version);
    if (!versionMeta) {
      const err = { error: `Version ${instance.minecraft_version} not found in manifest` };
      if (waitForFinish) return err;
      return;
    }

    try {
      await invoke('download_instance', {
        instanceId: instance.id,
        instanceName: instance.name,
        customPath: instance.custom_path || null,
        versionId: instance.minecraft_version,
        versionUrl: versionMeta.url,
        loader: instance.loader?.toLowerCase() === 'vanilla' ? null : instance.loader?.toLowerCase(),
        loaderVersion: instance.loader_version || null,
      });
    } catch (e) {
      const err = { error: String(e) };
      if (waitForFinish) return err;
      return;
    }

    if (waitForFinish) {
      return new Promise((resolve) => {
        waitResolvers.current[instance.id] = resolve;
      });
    }
  }, []);

  const waitForDownload = useCallback((instanceId) => {
    return new Promise((resolve) => {
      const existing = activeDownloads[instanceId];
      if (existing && existing.done) {
        resolve(existing);
        return;
      }
      waitResolvers.current[instanceId] = resolve;
    });
  }, [activeDownloads]);

  // System downloads (e.g. PortableMC)
  const startPmcInstall = useCallback(async () => {
    const pmcId = 'pmc';

    setSystemDownloads(prev => ({
      ...prev,
      [pmcId]: {
        id: pmcId,
        name: 'PortableMC',
        percent: 0,
        stage: 'Starting\u2026',
        done: false,
        error: null,
      },
    }));

    const unlisten = await listen('pmc-setup-progress', ({ payload }) => {
      setSystemDownloads(prev => ({
        ...prev,
        [pmcId]: {
          id: pmcId,
          name: 'PortableMC',
          percent: payload.percent,
          stage: payload.stage,
          done: payload.done,
          error: payload.error || null,
        },
      }));
    });

    try {
      await invoke('setup_portablemc');
    } catch (e) {
      setSystemDownloads(prev => ({
        ...prev,
        [pmcId]: { ...prev[pmcId], done: true, error: String(e) },
      }));
    }

    unlisten.then(fn => fn());
  }, []);

  const startPmcInstallAndWait = useCallback(async () => {
    await startPmcInstall();

    // Wait until pmc is done
    return new Promise((resolve) => {
      const check = () => {
        setSystemDownloads(prev => {
          const p = prev['pmc'];
          if (p && p.done) {
            resolve(p);
            return prev;
          }
          // Check again after a short delay
          setTimeout(check, 200);
          return prev;
        });
      };
      setTimeout(check, 200);
    });
  }, [startPmcInstall]);

  return (
    <DownloadContext.Provider value={{
      startDownload,
      activeDownloads,
      waitForDownload,
      systemDownloads,
      startPmcInstall,
      startPmcInstallAndWait,
    }}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownloads() {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error('useDownloads must be used within DownloadProvider');
  return ctx;
}
