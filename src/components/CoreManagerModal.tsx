import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  RefreshCw, 
  DownloadCloud, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Terminal,
  ShieldCheck,
  FolderGit2
} from 'lucide-react';
import type { CoreInfo, CheckUpdateResult } from '../types';
import { ipcRenderer } from '../lib/ipc';

interface CoreManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  coreInfo: CoreInfo | null;
  onCoreReload?: () => void;
}

export const CoreManagerModal: React.FC<CoreManagerModalProps> = ({
  isOpen,
  onClose,
  coreInfo,
  onCoreReload,
}) => {
  const [checking, setChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState<CheckUpdateResult | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateLogs, setUpdateLogs] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!ipcRenderer) return;

    const handleLog = (_event: any, log: string) => {
      setUpdateLogs((prev) => [...prev, log]);
    };

    ipcRenderer.on('core:update-log', handleLog);
    return () => {
      ipcRenderer?.removeListener('core:update-log', handleLog);
    };
  }, []);

  if (!isOpen) return null;

  const handleCheckUpdate = async () => {
    if (!ipcRenderer) {
      setStatusMessage('Updates are unavailable in browser preview');
      return;
    }
    setChecking(true);
    setStatusMessage(null);
    try {
      const res: CheckUpdateResult = await ipcRenderer.invoke('core:check-update');
      setUpdateResult(res);
      if (!res.hasUpdate) {
        setStatusMessage('Already up to date');
      }
    } catch (e: any) {
      setStatusMessage(`Check failed: ${e.message}`);
    } finally {
      setChecking(false);
    }
  };

  const handleDoUpdate = async () => {
    if (!ipcRenderer || !updateResult?.latestVersion) return;
    setIsUpdating(true);
    setUpdateLogs([`Installing @earendil-works/pi-coding-agent@${updateResult.latestVersion}…`]);
    setStatusMessage(null);

    try {
      const res = await ipcRenderer.invoke('core:do-update', updateResult.latestVersion);
      if (res.success) {
        setStatusMessage(`Updated to v${res.updatedVersion}`);
        await ipcRenderer.invoke('core:restart');
        if (onCoreReload) onCoreReload();
      } else {
        setStatusMessage(`Update failed: ${res.error}`);
      }
    } catch (e: any) {
      setStatusMessage(`Update failed: ${e.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResetBundled = async () => {
    if (!ipcRenderer) return;
    if (!confirm('Remove downloaded updates and revert to the bundled version?')) return;

    try {
      await ipcRenderer.invoke('core:reset-bundled');
      setStatusMessage('Reverted to the bundled version');
      if (onCoreReload) onCoreReload();
    } catch (e: any) {
      setStatusMessage(`Revert failed: ${e.message}`);
    }
  };

  const handleRestartCore = async () => {
    if (!ipcRenderer) return;
    try {
      await ipcRenderer.invoke('core:restart');
      setStatusMessage('Core restarted');
      if (onCoreReload) onCoreReload();
    } catch (e: any) {
      setStatusMessage(`Restart failed: ${e.message}`);
    }
  };

  const getTypeBadge = (type?: string) => {
    switch (type) {
      case 'user':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <FolderGit2 className="w-3 h-3" /> User install
          </span>
        );
      case 'bundled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/20">
            <ShieldCheck className="w-3 h-3" /> Bundled
          </span>
        );
      case undefined:
        return <span className="text-fg-subtle">—</span>;
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-sm font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
            System PATH
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-zinc-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800/80 bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Pi core</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5 text-sm text-zinc-300">
          {/* Current Status Card */}
          <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Version</span>
              <span className="tabular-nums text-sm font-bold text-zinc-100">
                {coreInfo?.version ? `v${coreInfo.version}` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Source</span>
              {getTypeBadge(coreInfo?.type)}
            </div>
            {coreInfo?.baseDir && (
              <div className="pt-1.5 border-t border-zinc-800/60 text-xs text-fg-subtle font-mono truncate">
                {coreInfo.baseDir}
              </div>
            )}
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCheckUpdate}
              disabled={checking || isUpdating}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary-solid hover:brightness-110 disabled:opacity-50 text-white font-medium transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking…' : 'Check for updates'}
            </button>

            <button
              onClick={handleRestartCore}
              disabled={isUpdating}
              title="Restart core"
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restart
            </button>

            {coreInfo?.type === 'user' && (
              <button
                onClick={handleResetBundled}
                disabled={isUpdating}
                title="Revert to bundled version"
                className="px-3 py-2 rounded-lg bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger transition"
              >
                Revert
              </button>
            )}
          </div>

          {/* Status Alert */}
          {statusMessage && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Update Available Box */}
          {updateResult?.hasUpdate && (
            <div className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 space-y-2">
              <div className="flex items-center justify-between text-emerald-400">
                <span className="font-semibold flex items-center gap-1.5">
                  <DownloadCloud className="w-4 h-4" /> Update available
                </span>
                <span className="tabular-nums font-bold">v{updateResult.latestVersion}</span>
              </div>
              <button
                onClick={handleDoUpdate}
                disabled={isUpdating}
                className="w-full mt-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition"
              >
                <DownloadCloud className="w-3.5 h-3.5" />
                {isUpdating ? 'Downloading…' : `Update to v${updateResult.latestVersion}`}
              </button>
            </div>
          )}

          {/* Update Progress Logs */}
          {updateLogs.length > 0 && (
            <div className="rounded-lg bg-black/60 border border-zinc-800 p-2.5 space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                <Terminal className="w-3 h-3" />
                <span>Log</span>
              </div>
              <div className="font-mono text-xs text-zinc-300 max-h-28 overflow-y-auto space-y-0.5">
                {updateLogs.map((log, i) => (
                  <div key={i} className="leading-tight">{log}</div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
