import React, { useState, useEffect } from 'react';
import {
  Server,
  Folder,
  FolderPlus,
  CornerLeftUp,
  Home,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  Play,
  History,
  FolderTree,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import type { SshConfig, RemoteBrowseResult, DiscoveredRemoteProject } from '../types';

interface SshModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectAdded: (project: { id: string; name: string; path: string; ssh: SshConfig }) => void;
}

import { ipcRenderer } from '../lib/ipc';

export const SshModal: React.FC<SshModalProps> = ({
  isOpen,
  onClose,
  onProjectAdded,
}) => {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [savedHosts, setSavedHosts] = useState<SshConfig[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [browseData, setBrowseData] = useState<RemoteBrowseResult | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [activeTab, setActiveTab] = useState<'browse' | 'discovered'>('browse');

  // 新增遠端資料夾狀態
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolderLoading, setCreatingFolderLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !ipcRenderer) return;
    ipcRenderer.invoke('ssh:get-saved-hosts').then((list: SshConfig[]) => {
      if (Array.isArray(list)) {
        setSavedHosts(list);
      }
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const buildCurrentSsh = (): SshConfig => {
    const p = parseInt(port, 10);
    const cleanHost = host.trim();
    return {
      id: `${cleanHost}:${Number.isFinite(p) && p > 0 ? p : 22}`,
      host: cleanHost,
      port: Number.isFinite(p) && p > 0 && p !== 22 ? p : undefined,
      password: password || undefined,
      label: cleanHost,
    };
  };

  const handleBrowse = async (targetPath = '', overrideSsh?: SshConfig) => {
    if (!ipcRenderer) {
      setError('SSH is unavailable in browser preview.');
      return;
    }
    const sshCfg = overrideSsh || buildCurrentSsh();
    if (!sshCfg.host) {
      setError('Enter a host, e.g. user@192.168.1.50 or an ssh config alias');
      return;
    }

    setConnecting(true);
    setError(null);
    try {
      const res: RemoteBrowseResult = await ipcRenderer.invoke('ssh:browse-dir', {
        ssh: sshCfg,
        targetPath,
      });
      if (!res || !res.success) {
        setError(res?.error || 'SSH connection failed');
        return;
      }
      setBrowseData(res);
      setPathInput(res.currentPath || '');
    } catch (e: any) {
      setError(e?.message || 'SSH connection error');
    } finally {
      setConnecting(false);
    }
  };

  const handleSelectSavedHost = (h: SshConfig) => {
    setHost(h.host);
    setPort(String(h.port || 22));
    setPassword(h.password || '');
    handleBrowse('', h);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !browseData?.currentPath || !ipcRenderer) return;
    const base = browseData.currentPath.replace(/\/+$/, '');
    const fullNewPath = `${base}/${name}`;

    setCreatingFolderLoading(true);
    setError(null);
    try {
      const res = await ipcRenderer.invoke('ssh:mkdir', {
        ssh: buildCurrentSsh(),
        dirPath: fullNewPath,
      });
      if (res?.success) {
        setNewFolderName('');
        setIsCreatingFolder(false);
        await handleBrowse(res.path || fullNewPath);
      } else {
        setError(res?.error || 'Could not create folder');
      }
    } catch (e: any) {
      setError(e?.message || 'Could not create folder');
    } finally {
      setCreatingFolderLoading(false);
    }
  };

  const handleConfirmOpenPath = async (remotePath: string) => {
    if (!ipcRenderer || !remotePath) return;
    const sshCfg = buildCurrentSsh();
    const cleanPath = remotePath.trim().replace(/\/+$/, '') || '/';
    const folderName = cleanPath.split('/').filter(Boolean).pop() || cleanPath;

    const saved = await ipcRenderer.invoke('ssh:save-project', {
      ssh: sshCfg,
      remotePath: cleanPath,
      name: folderName,
    });

    if (saved) {
      onProjectAdded(saved);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-line-strong bg-surface text-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 頂部標題列 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-surface-2">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Server size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Add SSH project</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* 主體內容 */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* 曾連線過的主機快速選擇 */}
          {savedHosts.length > 0 && (
            <div>
              <div className="text-xs font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                <History size={12} /> Recent hosts
              </div>
              <div className="flex flex-wrap gap-1.5">
                {savedHosts.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => handleSelectSavedHost(h)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono border transition flex items-center gap-1.5 ${
                      host === h.host
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                        : 'bg-canvas border-line-strong text-zinc-300 hover:border-zinc-600'
                    }`}
                  >
                    <Server size={11} className="text-cyan-400" />
                    <span>{h.host}</span>
                    {h.port && h.port !== 22 && <span className="text-fg-subtle">:{h.port}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* SSH 連線設定表單 */}
          <div className="rounded-lg border border-line bg-canvas p-4 space-y-3">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-9">
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Host
                </label>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleBrowse(pathInput);
                  }}
                  placeholder="user@192.168.1.50 or ssh config alias"
                  className="field bg-surface py-1.5 font-mono"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-zinc-400 mb-1">Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="22"
                  className="field bg-surface py-1.5 font-mono"
                />
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Password <span className="text-fg-subtle font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleBrowse(pathInput);
                    }}
                    placeholder="Leave empty to use your SSH key"
                    className="field bg-surface pl-3 pr-9 py-1.5 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-zinc-300"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <button
                onClick={() => handleBrowse('')}
                disabled={connecting || !host.trim()}
                className="px-4 py-1.5 h-[34px] rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium transition flex items-center gap-1.5 shrink-0"
              >
                {connecting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Connecting…</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    <span>Connect</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 錯誤提示 */}
          {error && (
            <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-xs text-danger flex items-start gap-2">
              <AlertCircle size={15} className="text-danger shrink-0 mt-0.5" />
              <div className="break-all leading-relaxed select-text">{error}</div>
            </div>
          )}

          {/* 連線成功：顯示環境檢測與目錄選擇器 */}
          {browseData && (
            <div className="space-y-3">
              {/* 遠端環境狀態列 */}
              <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  <span>
                    Connected to <strong className="font-mono">{host.trim()}</strong> · Node {browseData.nodeVersion}
                  </span>
                </div>
                <div>
                  {browseData.piAvailable ? (
                    <span className="text-emerald-300">
                      pi ready · <span className="font-mono">{browseData.piPath}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-warning">
                      <AlertCircle size={13} className="shrink-0" /> pi not found in remote PATH
                    </span>
                  )}
                </div>
              </div>

              {/* 分頁切換：瀏覽遠端資料夾 vs 遠端既有 Pi 專案 */}
              <div className="flex items-center justify-between border-b border-line">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setActiveTab('browse')}
                    className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
                      activeTab === 'browse'
                        ? 'border-cyan-400 text-cyan-300'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <FolderTree size={13} />
                    <span>Browse folders</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('discovered')}
                    className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
                      activeTab === 'discovered'
                        ? 'border-cyan-400 text-cyan-300'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <History size={13} />
                    <span>
                      Pi projects ({browseData.discoveredProjects?.length || 0})
                    </span>
                  </button>
                </div>
              </div>

              {activeTab === 'browse' ? (
                <div className="rounded-lg border border-line bg-canvas overflow-hidden">
                  {/* 路徑導覽列 */}
                  <div className="p-2 border-b border-line bg-surface-2 flex items-center gap-1.5">
                    <button
                      onClick={() => browseData.parentPath && handleBrowse(browseData.parentPath)}
                      disabled={!browseData.parentPath || connecting}
                      title="Up one level"
                      className="p-1.5 rounded hover:bg-zinc-800 disabled:opacity-40 text-zinc-300 transition"
                    >
                      <CornerLeftUp size={14} />
                    </button>
                    <button
                      onClick={() => browseData.homeDir && handleBrowse(browseData.homeDir)}
                      disabled={connecting}
                      title="Home (~)"
                      className="p-1.5 rounded hover:bg-zinc-800 text-zinc-300 transition"
                    >
                      <Home size={14} />
                    </button>

                    <input
                      type="text"
                      value={pathInput}
                      onChange={(e) => setPathInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleBrowse(pathInput);
                      }}
                      className="field w-auto min-w-0 flex-1 rounded bg-surface px-2.5 py-1 text-xs font-mono"
                      placeholder="/home/user/..."
                    />

                    <button
                      onClick={() => handleBrowse(pathInput)}
                      disabled={connecting}
                      title="Go to path"
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 transition flex items-center gap-1"
                    >
                      <span>Go</span>
                      <ArrowRight size={12} />
                    </button>

                    <button
                      onClick={() => setIsCreatingFolder((v) => !v)}
                      title="New folder"
                      className="p-1.5 rounded hover:bg-zinc-800 text-cyan-400 transition"
                    >
                      <FolderPlus size={14} />
                    </button>
                  </div>

                  {/* 新增資料夾輸入列 */}
                  {isCreatingFolder && (
                    <div className="px-3 py-2 bg-zinc-900/90 border-b border-line flex items-center gap-2">
                      <FolderPlus size={14} className="text-cyan-400 shrink-0" />
                      <input
                        autoFocus
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateFolder();
                          if (e.key === 'Escape') setIsCreatingFolder(false);
                        }}
                        placeholder="Folder name"
                        className="field w-auto min-w-0 flex-1 rounded px-2.5 py-1 text-xs font-mono"
                      />
                      <button
                        onClick={handleCreateFolder}
                        disabled={creatingFolderLoading || !newFolderName.trim()}
                        className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs text-white transition"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => setIsCreatingFolder(false)}
                        className="px-2 py-1 rounded hover:bg-zinc-800 text-xs text-zinc-400"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* 子目錄列表 */}
                  <div className="max-h-56 overflow-y-auto divide-y divide-line">
                    {browseData.parentPath && (
                      <div
                        onClick={() => handleBrowse(browseData.parentPath!)}
                        className="px-3 py-2 flex items-center gap-2.5 text-xs text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 cursor-pointer transition"
                      >
                        <CornerLeftUp size={14} className="text-fg-subtle" />
                        <span className="font-mono">..</span>
                      </div>
                    )}

                    {(browseData.directories || []).length === 0 ? (
                      <div className="py-8 text-center text-xs text-fg-subtle">
                        No subfolders
                      </div>
                    ) : (
                      browseData.directories!.map((dir) => (
                        <div
                          key={dir.path}
                          onClick={() => handleBrowse(dir.path)}
                          className="px-3 py-2 flex items-center justify-between text-xs text-zinc-200 hover:bg-zinc-800/60 cursor-pointer transition group"
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <Folder size={14} className="text-amber-400/90 shrink-0" />
                            <span className="font-mono truncate">{dir.name}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConfirmOpenPath(dir.path);
                            }}
                            className="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/30 text-2xs transition shrink-0"
                          >
                            Select
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* 底部確認選擇目前路徑 */}
                  <div className="px-3.5 py-2.5 bg-surface-2 border-t border-line flex items-center justify-between gap-3">
                    <div className="text-xs text-zinc-400 truncate">
                      Current: <span className="font-mono text-zinc-100">{browseData.currentPath}</span>
                    </div>
                    <button
                      onClick={() => handleConfirmOpenPath(browseData.currentPath || pathInput)}
                      className="px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition flex items-center gap-1.5 shrink-0"
                    >
                      <Play size={12} />
                      <span>Open this folder</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* 遠端既有 Pi 專案清單 */
                <div className="rounded-lg border border-line bg-canvas overflow-hidden max-h-72 overflow-y-auto divide-y divide-line">
                  {!browseData.discoveredProjects || browseData.discoveredProjects.length === 0 ? (
                    <div className="py-10 text-center text-xs text-fg-subtle">
                      No Pi sessions on this host.
                    </div>
                  ) : (
                    browseData.discoveredProjects.map((dp: DiscoveredRemoteProject) => (
                      <div
                        key={dp.path}
                        className="px-3.5 py-2.5 flex items-center justify-between hover:bg-zinc-800/50 transition"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="text-sm font-medium text-zinc-100 truncate flex items-center gap-2">
                            <Folder size={14} className="text-cyan-400 shrink-0" />
                            <span>{dp.name}</span>
                            <span className="text-2xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 tabular-nums">
                              {dp.sessionCount} {dp.sessionCount === 1 ? 'session' : 'sessions'}
                            </span>
                          </div>
                          <div className="text-xs font-mono text-fg-subtle truncate mt-0.5">
                            {dp.path}
                          </div>
                        </div>
                        <button
                          onClick={() => handleConfirmOpenPath(dp.path)}
                          className="px-3 py-1 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition shrink-0"
                        >
                          Add and open
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
