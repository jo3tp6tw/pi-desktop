import React, { useState, useEffect, useMemo } from 'react';
import { ipcRenderer } from '../lib/ipc';
import {
  Cpu,
  X,
  Plus,
  Pencil,
  Copy,
  Trash2,
  Star,
  Monitor,
  Server,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
} from 'lucide-react';
import type {
  ModelProfile,
  ProfileState,
  ModelCatalog,
  ThinkingLevel,
  SamplingParams,
} from '../types';
import { LOCAL_ENV, type PiEnvironment } from '../lib/environment';
import {
  COMPAT_DEFAULTS,
  effectiveSpec,
  findCatalogModel,
  formatTokens,
  providerLabel,
  supportedThinkingLevels,
  supportsSampling,
} from '../lib/modelProfiles';

interface ModelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 目前對話所在的環境，開啟時預設顯示此環境分頁 */
  activeEnv?: PiEnvironment;
  /** 設定檔或環境啟用狀態變更後通知（讓對話頂端的切換選單更新） */
  onStateChanged?: (state: ProfileState) => void;
}

type Status = { text: string; type: 'success' | 'error' } | null;

interface ApplyResult {
  envKey: string;
  success: boolean;
  error?: string;
  errors?: string[];
  restart?: { restarted: number; deferred: number };
}

const EMPTY_STATE: ProfileState = { profiles: [], envs: {} };

// 把套用結果整理成一行訊息
function describeApply(results: ApplyResult[], envLabel: (k: string) => string): Status {
  const problems: string[] = [];
  for (const r of results) {
    if (!r.success) problems.push(`「${envLabel(r.envKey)}」套用失敗：${r.error}`);
    for (const e of r.errors || []) problems.push(`「${envLabel(r.envKey)}」${e}`);
  }
  if (problems.length) return { text: problems.join('；'), type: 'error' };
  const deferred = results.reduce((n, r) => n + (r.restart?.deferred || 0), 0);
  return {
    text: deferred ? `已套用；${deferred} 個執行中的對話會在跑完後套用` : '已儲存並套用',
    type: 'success',
  };
}

export const ModelSettingsModal: React.FC<ModelSettingsModalProps> = ({
  isOpen,
  onClose,
  activeEnv = LOCAL_ENV,
  onStateChanged,
}) => {
  const [environments, setEnvironments] = useState<PiEnvironment[]>([LOCAL_ENV]);
  const [envKey, setEnvKey] = useState<string>(activeEnv.key);
  const [state, setState] = useState<ProfileState>(EMPTY_STATE);
  // 各環境自己安裝的 pi 模型目錄（版本可能不同），依環境分頁載入
  const [catalogs, setCatalogs] = useState<Record<string, ModelCatalog>>({});
  const catalog = catalogs[envKey] || null;
  const [editing, setEditing] = useState<ModelProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const envLabel = (key: string) => environments.find((e) => e.key === key)?.label || key;
  const envSel = state.envs[envKey] || { enabled: [], defaultId: null };

  const updateState = (next: ProfileState) => {
    setState(next);
    onStateChanged?.(next);
  };

  useEffect(() => {
    if (!isOpen || !ipcRenderer) return;
    setEnvKey(activeEnv.key);
    setEditing(null);
    setStatus(null);
    ipcRenderer.invoke('profile:get-state').then((s: ProfileState) => setState(s || EMPTY_STATE));
    ipcRenderer
      .invoke('model:list-environments')
      .then((list: PiEnvironment[]) => {
        const envs = Array.isArray(list) && list.length ? list : [LOCAL_ENV];
        setEnvironments(envs.some((e) => e.key === activeEnv.key) ? envs : [...envs, activeEnv]);
      })
      .catch(() => setEnvironments([LOCAL_ENV]));
    // 僅在開啟時初始化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // 載入目前環境分頁的 pi 模型目錄（遠端透過 SSH 讀取該主機安裝的 pi）
  useEffect(() => {
    if (!isOpen || !ipcRenderer || catalogs[envKey]) return;
    const env = environments.find((e) => e.key === envKey);
    if (!env) return; // 環境清單尚未載入
    let cancelled = false;
    ipcRenderer.invoke('profile:get-catalog', { ssh: env.ssh }).then((c: ModelCatalog) => {
      if (cancelled) return;
      // 失敗不快取，下次開啟視窗會重試（例如遠端主機暫時連不上）
      if (c?.success) setCatalogs((prev) => ({ ...prev, [envKey]: c }));
      else setStatus({ text: `讀取「${env.label}」的 pi 模型目錄失敗：${c?.error}`, type: 'error' });
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, envKey, environments, catalogs]);

  // 變更環境的啟用清單 / 預設，立即套用
  const setEnvSelection = async (enabled: string[], defaultId: string | null) => {
    if (!ipcRenderer) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await ipcRenderer.invoke('profile:set-env', { envKey, enabled, defaultId });
      if (!res.success) {
        setStatus({ text: `套用失敗：${res.error}`, type: 'error' });
        return;
      }
      updateState(res.state);
      setStatus(describeApply([res.applyResult], envLabel));
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = (id: string) => {
    const on = envSel.enabled.includes(id);
    const enabled = on ? envSel.enabled.filter((x) => x !== id) : [...envSel.enabled, id];
    setEnvSelection(enabled, envSel.defaultId && enabled.includes(envSel.defaultId) ? envSel.defaultId : enabled[0] || null);
  };

  const saveProfile = async (profile: ModelProfile) => {
    if (!ipcRenderer) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await ipcRenderer.invoke('profile:save', { profile });
      if (!res.success) {
        setStatus({ text: `儲存失敗：${res.error}`, type: 'error' });
        return;
      }
      updateState(res.state);
      setEditing(null);
      // 新建的設定檔若此環境還沒有任何啟用的，直接啟用並設為預設
      if (!profile.id && envSel.enabled.length === 0) {
        await setEnvSelection([res.profile.id], res.profile.id);
        return;
      }
      setStatus(res.applyResults.length ? describeApply(res.applyResults, envLabel) : { text: '已儲存', type: 'success' });
    } finally {
      setBusy(false);
    }
  };

  const deleteProfile = async (id: string) => {
    if (!ipcRenderer) return;
    setBusy(true);
    setConfirmDeleteId(null);
    try {
      const res = await ipcRenderer.invoke('profile:delete', { id });
      if (!res.success) {
        setStatus({ text: `刪除失敗：${res.error}`, type: 'error' });
        return;
      }
      updateState(res.state);
      setStatus(res.applyResults.length ? describeApply(res.applyResults, envLabel) : { text: '已刪除', type: 'success' });
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-zinc-700/80 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* 頂部標題 */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center space-x-2.5">
            {editing ? (
              <button
                onClick={() => setEditing(null)}
                disabled={busy}
                className="w-8 h-8 rounded-lg border border-zinc-700 flex items-center justify-center text-zinc-300 hover:bg-zinc-800 transition"
                title="返回列表"
              >
                <ArrowLeft size={16} />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                <Cpu size={17} />
              </div>
            )}
            <div>
              <h2 className="text-base font-semibold text-zinc-100">
                {editing ? (editing.id ? `編輯「${editing.name}」` : '新增模型設定檔') : '模型設定檔'}
              </h2>
              <p className="text-xs text-zinc-400">
                {editing
                  ? `模型清單來自「${envLabel(envKey)}」的 pi${catalog?.version ? ` v${catalog.version}` : ''}；只會顯示該模型支援的參數`
                  : '每個環境可啟用多個設定檔，並指定一個作為新對話的預設'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            <X size={17} />
          </button>
        </div>

        {status && (
          <div
            className={`px-6 py-2.5 text-xs flex items-start space-x-2 border-b ${
              status.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
                : 'bg-danger/10 border-danger/30 text-danger'
            }`}
          >
            {status.type === 'success' ? <CheckCircle2 size={14} className="shrink-0 mt-px" /> : <AlertCircle size={14} className="shrink-0 mt-px" />}
            <span>{status.text}</span>
          </div>
        )}

        {editing ? (
          <ProfileEditor
            initial={editing}
            catalog={catalog}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSave={saveProfile}
          />
        ) : (
          <>
            {/* 環境分頁：每個環境各自啟用設定檔 */}
            <div className="px-6 py-2.5 border-b border-zinc-800 bg-zinc-950/40 flex items-center gap-1.5 overflow-x-auto">
              {environments.map((env) => {
                const selected = env.key === envKey;
                const isRemote = !!env.ssh;
                const sel = state.envs[env.key];
                const def = state.profiles.find((p) => p.id === sel?.defaultId);
                return (
                  <button
                    key={env.key}
                    type="button"
                    onClick={() => {
                      setEnvKey(env.key);
                      setStatus(null);
                    }}
                    disabled={busy}
                    className={`shrink-0 flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                      selected
                        ? isRemote
                          ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/50'
                          : 'bg-zinc-700/70 text-zinc-100 border-zinc-500/60'
                        : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800'
                    }`}
                  >
                    {isRemote ? <Server size={12} className="text-cyan-400" /> : <Monitor size={12} />}
                    <span className="truncate max-w-[140px]">{env.label}</span>
                    <span className="text-2xs font-normal text-fg-subtle truncate max-w-[120px]">
                      · {def ? def.name : '未指定'}
                    </span>
                    {catalogs[env.key]?.version && (
                      <span className="text-2xs tabular-nums font-normal text-fg-subtle">pi v{catalogs[env.key].version}</span>
                    )}
                    {env.key === activeEnv.key && (
                      <span className="text-2xs px-1 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800/60">
                        目前對話
                      </span>
                    )}
                  </button>
                );
              })}
              {busy && <RefreshCw size={12} className="animate-spin text-fg-subtle shrink-0 ml-1" />}
            </div>

            {/* 設定檔列表 */}
            <div className="flex-1 overflow-y-auto">
              {state.profiles.length === 0 && (
                <div className="px-6 py-10 text-center text-sm text-zinc-400">
                  <p className="text-zinc-200 font-medium mb-1">建立第一個模型設定檔</p>
                  <p className="text-xs">選一個 pi 內建供應商或 OpenAI Compatible 端點，設定好參數後就能在各環境啟用。</p>
                </div>
              )}
              {state.profiles.map((p) => {
                const enabled = envSel.enabled.includes(p.id);
                const isDefault = envSel.defaultId === p.id;
                const spec = effectiveSpec(p, catalog);
                const chips: string[] = [
                  `上下文 ${formatTokens(spec.contextWindow)}`,
                  `輸出 ${formatTokens(spec.maxTokens)}`,
                ];
                if (p.thinkingLevel) chips.push(`思考 ${p.thinkingLevel}`);
                if (p.samplingParams?.temperature !== undefined && supportsSampling(spec.api)) {
                  chips.push(`temp ${p.samplingParams.temperature}`);
                }
                const warning = spec.missing
                  ? '此環境的 pi 沒有此模型'
                  : p.kind === 'builtin' && !p.apiKey
                    ? '尚未填寫 API Key'
                    : null;
                return (
                  <div
                    key={p.id}
                    className={`px-6 py-3 border-b border-zinc-800/80 flex items-center gap-3 ${enabled ? 'bg-primary/5' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={busy}
                      onChange={() => toggleEnabled(p.id)}
                      title={enabled ? `在「${envLabel(envKey)}」停用` : `在「${envLabel(envKey)}」啟用`}
                      className="rounded border-zinc-700 bg-zinc-900 accent-primary-solid focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-100 truncate">{p.name}</span>
                        {isDefault && (
                          <span className="text-2xs px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60">
                            預設
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-fg-subtle font-mono truncate">
                        {p.kind === 'openai-compatible' ? 'OpenAI Compatible' : providerLabel(p.provider)} · {p.modelId}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {chips.map((c) => (
                          <span key={c} className="text-2xs px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400">
                            {c}
                          </span>
                        ))}
                        {warning && (
                          <span className="text-2xs px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-800/50">
                            {warning}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {enabled && !isDefault && (
                        <button
                          onClick={() => setEnvSelection(envSel.enabled, p.id)}
                          disabled={busy}
                          title="設為此環境新對話的預設"
                          className="p-1.5 rounded-md text-zinc-400 hover:text-amber-300 hover:bg-zinc-800 transition"
                        >
                          <Star size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => setEditing({ ...p })}
                        disabled={busy}
                        title="編輯"
                        className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setEditing({ ...p, id: '', name: `${p.name} 副本` })}
                        disabled={busy}
                        title="複製成新設定檔"
                        className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
                      >
                        <Copy size={14} />
                      </button>
                      {confirmDeleteId === p.id ? (
                        <button
                          onClick={() => deleteProfile(p.id)}
                          disabled={busy}
                          className="px-2 py-1 rounded-md text-2xs bg-danger-solid text-white border border-danger/40 hover:brightness-110 transition"
                        >
                          確認刪除
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          disabled={busy}
                          title="刪除"
                          className="p-1.5 rounded-md text-zinc-400 hover:text-danger hover:bg-zinc-800 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="px-6 py-3">
                <button
                  onClick={() =>
                    setEditing({ id: '', name: '', kind: 'builtin', modelId: '' })
                  }
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800/60 hover:border-zinc-600 transition"
                >
                  <Plus size={14} />
                  <span>新增模型設定檔</span>
                </button>
              </div>
            </div>

            <div className="px-6 py-2.5 border-t border-zinc-800 bg-zinc-900/70 text-2xs text-fg-subtle">
              勾選即在「{envLabel(envKey)}」啟用；變更會立即寫入該環境的 ~/.pi/agent，並重新啟動其對話以套用。
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ==========================================================================
 * 設定檔編輯表單
 * ========================================================================== */

interface ProfileEditorProps {
  initial: ModelProfile;
  catalog: ModelCatalog | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (p: ModelProfile) => void;
}

const inputCls =
  'w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-primary transition';

const numOrUndef = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

const ProfileEditor: React.FC<ProfileEditorProps> = ({ initial, catalog, busy, onCancel, onSave }) => {
  const [p, setP] = useState<ModelProfile>(initial);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');

  const set = (patch: Partial<ModelProfile>) => {
    setP((prev) => ({ ...prev, ...patch }));
    setError('');
  };
  const setSampling = (patch: Partial<SamplingParams>) =>
    set({ samplingParams: { ...(p.samplingParams || {}), ...patch } });

  const isCompat = p.kind === 'openai-compatible';
  const providers = catalog?.providers || [];
  const providerModels = providers.find((x) => x.id === p.provider)?.models || [];
  const base = isCompat ? null : findCatalogModel(catalog, p.provider, p.modelId);

  // 依模型決定可設定的參數
  const defaults = isCompat
    ? COMPAT_DEFAULTS
    : { contextWindow: base?.contextWindow, maxTokens: base?.maxTokens };
  const levels = useMemo(
    () => (isCompat ? supportedThinkingLevels({ reasoning: p.reasoning }) : supportedThinkingLevels(base)),
    [isCompat, p.reasoning, base]
  );
  const showSampling = isCompat || supportsSampling(base?.api);
  const sp = p.samplingParams || {};

  const isModified =
    p.contextWindow !== undefined ||
    p.maxTokens !== undefined ||
    p.thinkingLevel !== undefined ||
    Object.values(sp).some((v) => v !== undefined);

  const resetDefaults = () =>
    set({ contextWindow: undefined, maxTokens: undefined, thinkingLevel: undefined, samplingParams: undefined });

  const selectProvider = (id: string) => {
    const first = providers.find((x) => x.id === id)?.models[0];
    set({ provider: id, modelId: first?.id || '', thinkingLevel: undefined });
  };

  const submit = () => {
    if (!p.name.trim()) return setError('請輸入設定檔名稱');
    if (isCompat && !p.baseUrl?.trim()) return setError('請輸入 Base URL');
    if (!isCompat && !p.provider) return setError('請選擇供應商');
    if (!p.modelId.trim()) return setError('請選擇或輸入模型');
    // 不支援的參數不寫入，避免殘留其他模型的設定
    const clean: ModelProfile = {
      ...p,
      name: p.name.trim(),
      modelId: p.modelId.trim(),
      baseUrl: isCompat ? p.baseUrl?.trim() : undefined,
      provider: isCompat ? undefined : p.provider,
      reasoning: isCompat ? p.reasoning : undefined,
      maxTokensField: isCompat ? p.maxTokensField : undefined,
      thinkingLevel: p.thinkingLevel && levels.includes(p.thinkingLevel) ? p.thinkingLevel : undefined,
      samplingParams: showSampling ? p.samplingParams : undefined,
    };
    onSave(clean);
  };

  const Dot = ({ on }: { on: boolean }) =>
    on ? <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary ml-1 align-middle" title="已修改" /> : null;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm">
        {/* 基本資料 */}
        <section className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1 font-medium">設定檔名稱</label>
            <input
              className={inputCls}
              value={p.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="DeepSeek 寫程式"
              autoFocus
            />
          </div>

          <div className="flex gap-1.5">
            {(['builtin', 'openai-compatible'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set({ kind: k, modelId: '', thinkingLevel: undefined })}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  p.kind === k
                    ? 'bg-primary-solid text-white border-primary'
                    : 'bg-zinc-900/80 text-zinc-400 border-zinc-700/60 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
              >
                {k === 'builtin' ? 'pi 內建供應商' : 'OpenAI Compatible'}
              </button>
            ))}
          </div>

          {isCompat ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs text-zinc-400 mb-1 font-medium">Base URL</label>
                <input
                  className={`${inputCls} font-mono`}
                  value={p.baseUrl || ''}
                  onChange={(e) => set({ baseUrl: e.target.value })}
                  placeholder="https://api.siliconflow.com/v1"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-zinc-400 mb-1 font-medium">模型 ID</label>
                <input
                  className={`${inputCls} font-mono`}
                  value={p.modelId}
                  onChange={(e) => set({ modelId: e.target.value })}
                  placeholder="zai-org/GLM-5.3-Flash"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1 font-medium">供應商</label>
                <select className={inputCls} value={p.provider || ''} onChange={(e) => selectProvider(e.target.value)}>
                  <option value="" disabled>
                    {catalog ? '選擇供應商' : '載入 pi 模型目錄中…'}
                  </option>
                  {providers.map((prov) => (
                    <option key={prov.id} value={prov.id} disabled={!prov.supported}>
                      {providerLabel(prov.id)}
                      {prov.supported ? '' : `（${prov.unsupportedReason}）`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1 font-medium">模型</label>
                <select
                  className={`${inputCls} font-mono`}
                  value={p.modelId}
                  onChange={(e) => set({ modelId: e.target.value, thinkingLevel: undefined })}
                  disabled={!p.provider}
                >
                  {!providerModels.some((m) => m.id === p.modelId) && (
                    <option value={p.modelId}>{p.modelId || '選擇模型'}</option>
                  )}
                  {providerModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-400 mb-1 font-medium">API Key</label>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                className={`${inputCls} font-mono pr-9`}
                value={p.apiKey || ''}
                onChange={(e) => set({ apiKey: e.target.value })}
                placeholder="sk-..."
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 p-1 text-fg-subtle hover:text-zinc-300"
              >
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <p className="text-2xs text-fg-subtle mt-1">也可填 $環境變數名稱，例如 $DEEPSEEK_API_KEY，由執行 pi 的環境提供</p>
          </div>
        </section>

        {/* 參數：只顯示此模型支援的項目 */}
        <section className="space-y-4 p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">參數</span>
            <button
              type="button"
              onClick={resetDefaults}
              disabled={!isModified}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-2xs text-zinc-400 border border-zinc-700/60 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 transition"
            >
              <RotateCcw size={11} />
              <span>恢復預設</span>
            </button>
          </div>

          {isCompat && (
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(p.reasoning)}
                  onChange={(e) => set({ reasoning: e.target.checked, thinkingLevel: undefined })}
                  className="rounded border-zinc-700 bg-zinc-900 accent-primary-solid focus:ring-0 focus:ring-offset-0"
                />
                模型支援推理（思考）
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                最大輸出欄位
                <select
                  className="bg-zinc-900 border border-zinc-700/80 rounded-md px-2 py-1 text-xs text-zinc-200 font-mono"
                  value={p.maxTokensField || ''}
                  onChange={(e) => set({ maxTokensField: (e.target.value || undefined) as ModelProfile['maxTokensField'] })}
                >
                  <option value="">預設 (max_completion_tokens)</option>
                  <option value="max_tokens">max_tokens</option>
                </select>
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">
                上下文長度<Dot on={p.contextWindow !== undefined} />
              </label>
              <input
                type="number"
                className={`${inputCls} font-mono`}
                value={p.contextWindow ?? defaults.contextWindow ?? ''}
                onChange={(e) => set({ contextWindow: numOrUndef(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">
                最大輸出<Dot on={p.maxTokens !== undefined} />
              </label>
              <input
                type="number"
                className={`${inputCls} font-mono`}
                value={p.maxTokens ?? defaults.maxTokens ?? ''}
                onChange={(e) => set({ maxTokens: numOrUndef(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-400 mb-1.5 font-medium">
              思考等級<Dot on={p.thinkingLevel !== undefined} />
              <span className="text-fg-subtle font-normal ml-2">此模型支援：{levels.join(' / ')}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <LevelButton label="預設" selected={!p.thinkingLevel} onClick={() => set({ thinkingLevel: undefined })} />
              {levels.map((lvl) => (
                <LevelButton
                  key={lvl}
                  label={lvl}
                  selected={p.thinkingLevel === lvl}
                  onClick={() => set({ thinkingLevel: lvl as ThinkingLevel })}
                />
              ))}
            </div>
          </div>

          {showSampling ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(
                [
                  ['temperature', 'Temperature', '0.0 – 2.0'],
                  ['top_p', 'Top P', '0.0 – 1.0'],
                  ['top_k', 'Top K', '整數'],
                ] as const
              ).map(([key, label, hint]) => (
                <div key={key}>
                  <label className="block text-xs text-zinc-400 mb-1 font-medium">
                    {label}
                    <Dot on={sp[key] !== undefined} />
                  </label>
                  <input
                    type="number"
                    step={key === 'top_k' ? 1 : 0.05}
                    className={`${inputCls} font-mono`}
                    value={sp[key] ?? ''}
                    onChange={(e) => setSampling({ [key]: numOrUndef(e.target.value) })}
                    placeholder={`不送出（${hint}）`}
                  />
                </div>
              ))}
            </div>
          ) : (
            base && (
              <p className="text-2xs text-fg-subtle">
                此模型使用 {base.api} 格式，不支援 Temperature / Top P 等採樣參數。
              </p>
            )
          )}
        </section>
      </div>

      <div className="px-6 py-3.5 border-t border-zinc-800 bg-zinc-900/70 flex items-center justify-between gap-3">
        <span className="text-xs text-danger">{error}</span>
        <div className="flex items-center space-x-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3.5 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-4 py-1.5 rounded-lg bg-primary-solid hover:brightness-110 disabled:opacity-50 text-white text-xs font-medium flex items-center space-x-1.5 transition shadow"
          >
            {busy ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
            <span>{busy ? '儲存中...' : '儲存'}</span>
          </button>
        </div>
      </div>
    </>
  );
};

const LevelButton: React.FC<{ label: string; selected: boolean; onClick: () => void }> = ({ label, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
      selected
        ? 'bg-primary-solid text-white border-primary'
        : 'bg-zinc-900/80 text-zinc-400 border-zinc-700/60 hover:bg-zinc-800 hover:text-zinc-200'
    }`}
  >
    {label}
  </button>
);
