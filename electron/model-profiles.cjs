const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');

/* ==========================================================================
 * 模型設定檔 (Model Profiles)
 *
 * 設定檔是 Pi-UI 自己的概念：一張「供應商 + 模型 + 參數 + 金鑰」的卡片，全域共用。
 * 每個環境（本機 / SSH 主機）可啟用多張，並指定一張為預設。
 *
 * 套用到環境時，每張啟用的設定檔會在該環境的 ~/.pi/agent/models.json 中變成
 * 一個獨立供應商 `pui-<id>`（從 pi 內建目錄複製 API 格式、端點與模型規格，再
 * 疊上設定檔的參數），所以同一個模型的多種參數組合可以並存，對話中也能用
 * set_model 切換。注意：執行中的 pi 不會重新讀取 models.json，套用後需重啟該
 * 環境的對話程序。
 * ========================================================================== */

const PROFILE_PROVIDER_PREFIX = 'pui-';

// 需要 OAuth 或特殊雲端認證，無法複製成獨立供應商的內建供應商
const UNSUPPORTED_PROVIDERS = {
  'github-copilot': 'requires /login with GitHub',
  'openai-codex': 'requires /login with ChatGPT',
  radius: 'requires /login',
  'amazon-bedrock': 'uses AWS credentials',
  'google-vertex': 'uses Google Cloud credentials',
  azure: 'requires Azure resource setup',
  'cloudflare-ai-gateway': 'requires a Cloudflare account',
  'cloudflare-workers-ai': 'requires a Cloudflare account',
  typesafe: 'classification models only',
};

// 只有這些 API 格式會送出 samplingParams（其他格式 pi 會忽略）
const SAMPLING_APIS = ['openai-completions', 'openai-responses', 'azure-openai-responses'];

// 讀取 pi 內建模型目錄的函式原始碼：本機直接執行，遠端透過 execRemoteNode 執行。
// payload.coreDir 為 pi-coding-agent 套件目錄；未提供時（遠端）由 PATH 上的 pi 推算。
const READ_CATALOG_FN = `async ({ coreDir }) => {
  const fs = require('fs');
  const path = require('path');
  const { execSync } = require('child_process');

  let pkgDir = coreDir || null;
  if (!pkgDir) {
    let bin = '';
    try {
      bin = execSync('command -v pi', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], shell: '/bin/sh' }).trim();
    } catch {}
    if (!bin) throw new Error('pi command not found; make sure pi is installed in this environment');
    let dir = path.dirname(fs.realpathSync(bin));
    while (dir && dir !== path.dirname(dir)) {
      const pj = path.join(dir, 'package.json');
      if (fs.existsSync(pj)) {
        try {
          if (JSON.parse(fs.readFileSync(pj, 'utf-8')).name === '@earendil-works/pi-coding-agent') { pkgDir = dir; break; }
        } catch {}
      }
      dir = path.dirname(dir);
    }
    if (!pkgDir) throw new Error('Could not locate the pi install directory');
  }

  // pi-ai 的 exports 不開放 package.json，改沿 node_modules 向上尋找（可能被提升到上層）
  let dataDir = null;
  for (let dir = pkgDir; dir && dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const cand = path.join(dir, 'node_modules', '@earendil-works', 'pi-ai', 'dist', 'providers', 'data');
    if (fs.existsSync(cand)) { dataDir = cand; break; }
  }
  if (!dataDir) throw new Error('Could not find the pi model catalog (pi-ai)');
  const version = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')).version; } catch { return null; }
  })();

  const KEEP = ['id', 'name', 'api', 'baseUrl', 'reasoning', 'thinkingLevelMap', 'input', 'inputLimits',
    'contextWindow', 'maxTokens', 'cost', 'promptCache', 'compat', 'headers'];
  const providers = {};
  for (const file of fs.readdirSync(dataDir)) {
    if (!file.endsWith('.json') || file.startsWith('.')) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8')); } catch { continue; }
    // 目錄結構：{ <api>: { "<type>:<id>": model } }，只取對話模型
    for (const byKey of Object.values(data)) {
      for (const [key, m] of Object.entries(byKey || {})) {
        if (!key.startsWith('chat:') || !m || !m.provider) continue;
        const slim = {};
        for (const k of KEEP) if (m[k] !== undefined) slim[k] = m[k];
        (providers[m.provider] = providers[m.provider] || []).push(slim);
      }
    }
  }
  return { version, providers };
}`;

class ModelProfileManager {
  constructor(app, sshManager, coreManager) {
    this.app = app;
    this.sshManager = sshManager;
    this.coreManager = coreManager;
    this.catalogCache = new Map(); // envKey -> catalog
  }

  /* ---- 儲存 ----------------------------------------------------------- */

  getStoreFile() {
    const dir = this.app
      ? this.app.getPath('userData')
      : path.join(process.env.APPDATA || process.env.HOME || '.', '.pi-ui');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'model-profiles.json');
  }

  loadState() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.getStoreFile(), 'utf-8'));
      return { profiles: Array.isArray(raw.profiles) ? raw.profiles : [], envs: raw.envs || {} };
    } catch {
      return { profiles: [], envs: {} };
    }
  }

  saveState(state) {
    // 檔案含 API Key，限定只有目前使用者可讀寫（Windows 上 mode 會被忽略）
    fs.writeFileSync(this.getStoreFile(), JSON.stringify(state, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }

  envKeyOf(ssh) {
    if (!ssh) return 'local';
    const norm = this.sshManager.normalizeSshConfig(ssh);
    return norm ? `ssh:${norm.id}` : 'local';
  }

  /* ---- pi 內建模型目錄 ------------------------------------------------- */

  async getCatalog(ssh, { refresh = false } = {}) {
    const key = this.envKeyOf(ssh);
    if (!refresh && this.catalogCache.has(key)) return this.catalogCache.get(key);

    let res;
    if (ssh) {
      res = await this.sshManager.execRemoteNode(ssh, READ_CATALOG_FN, {}, 30000);
      if (!res.success) return { success: false, error: res.error };
      res = res.data;
    } else {
      const core = this.coreManager.resolveCore();
      const coreDir = core.baseDir || this.coreManager.getBundledCoreDir();
      if (!coreDir) return { success: false, error: 'Local pi core directory not found' };
      try {
        // eslint-disable-next-line no-eval
        res = await eval(`(${READ_CATALOG_FN})`)({ coreDir });
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    const catalog = {
      success: true,
      version: res.version,
      providers: Object.entries(res.providers)
        .map(([id, models]) => ({
          id,
          supported: !UNSUPPORTED_PROVIDERS[id],
          unsupportedReason: UNSUPPORTED_PROVIDERS[id] || undefined,
          models: models.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id))),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
    this.catalogCache.set(key, catalog);
    return catalog;
  }

  /* ---- 設定檔 CRUD ----------------------------------------------------- */

  upsertProfile(profile) {
    const state = this.loadState();
    const next = { ...profile, id: profile.id || randomUUID().slice(0, 8), updatedAt: Date.now() };
    const idx = state.profiles.findIndex((p) => p.id === next.id);
    if (idx >= 0) state.profiles[idx] = next;
    else state.profiles.push(next);
    this.saveState(state);
    return { state, profile: next };
  }

  deleteProfile(id) {
    const state = this.loadState();
    state.profiles = state.profiles.filter((p) => p.id !== id);
    const affected = [];
    for (const [envKey, env] of Object.entries(state.envs)) {
      if (!env.enabled?.includes(id)) continue;
      env.enabled = env.enabled.filter((x) => x !== id);
      if (env.defaultId === id) env.defaultId = env.enabled[0] || null;
      affected.push(envKey);
    }
    this.saveState(state);
    return { state, affected };
  }

  setEnvSelection(envKey, { enabled, defaultId }) {
    const state = this.loadState();
    const valid = new Set(state.profiles.map((p) => p.id));
    const list = (enabled || []).filter((id) => valid.has(id));
    state.envs[envKey] = {
      enabled: list,
      defaultId: list.includes(defaultId) ? defaultId : list[0] || null,
    };
    this.saveState(state);
    return state;
  }

  // 有啟用此設定檔的環境
  envsUsingProfile(id) {
    const state = this.loadState();
    return Object.entries(state.envs)
      .filter(([, env]) => env.enabled?.includes(id))
      .map(([envKey]) => envKey);
  }

  /* ---- 設定檔 → pi 設定 ------------------------------------------------ */

  providerKeyOf(profile) {
    return `${PROFILE_PROVIDER_PREFIX}${profile.id}`;
  }

  // 把一張設定檔轉成 models.json 的供應商項目
  buildProviderEntry(profile, catalog) {
    const sampling = cleanSampling(profile.samplingParams);

    if (profile.kind === 'openai-compatible') {
      const model = {
        id: profile.modelId,
        name: profile.name,
        contextWindow: profile.contextWindow || 128000,
        maxTokens: profile.maxTokens || 8192,
        reasoning: Boolean(profile.reasoning),
      };
      if (sampling) model.samplingParams = sampling;
      if (profile.maxTokensField) model.compat = { maxTokensField: profile.maxTokensField };
      return {
        api: 'openai-completions',
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey || 'none',
        models: [model],
      };
    }

    const prov = catalog.providers.find((p) => p.id === profile.provider);
    if (!prov) throw new Error(`Provider ${profile.provider} is not available in this pi`);
    if (!prov.supported) throw new Error(`${profile.provider} ${prov.unsupportedReason}; it can't be used in a profile`);
    const base = prov.models.find((m) => m.id === profile.modelId);
    if (!base) throw new Error(`Model ${profile.provider}/${profile.modelId} is not available in this pi`);

    const { api, baseUrl, ...spec } = base;
    const model = { ...spec, name: profile.name };
    if (profile.contextWindow) model.contextWindow = profile.contextWindow;
    if (profile.maxTokens) model.maxTokens = profile.maxTokens;
    if (sampling && SAMPLING_APIS.includes(api)) model.samplingParams = sampling;
    return { api, baseUrl, apiKey: profile.apiKey || 'none', models: [model] };
  }

  // 將某環境啟用的設定檔寫入該環境的 models.json / settings.json
  async applyEnv(envKey, ssh) {
    const state = this.loadState();
    const envSel = state.envs[envKey] || { enabled: [], defaultId: null };
    const profiles = envSel.enabled
      .map((id) => state.profiles.find((p) => p.id === id))
      .filter(Boolean);

    const needsCatalog = profiles.some((p) => p.kind !== 'openai-compatible');
    const catalog = needsCatalog ? await this.getCatalog(ssh) : null;
    if (catalog && !catalog.success) return { success: false, error: `Could not read the pi model catalog: ${catalog.error}` };

    const entries = {};
    const errors = [];
    for (const p of profiles) {
      try {
        entries[this.providerKeyOf(p)] = this.buildProviderEntry(p, catalog);
      } catch (e) {
        errors.push(`${p.name}: ${e.message}`);
      }
    }

    const current = ssh
      ? await this.sshManager.readRemoteAgentConfig(ssh)
      : readLocalAgentConfig();
    if (!current.success) return { success: false, error: current.error };

    // 只替換 Pi-UI 管理的 pui-* 供應商，保留使用者手寫的其他設定
    const modelsConfig = { ...current.modelsConfig, providers: {} };
    for (const [k, v] of Object.entries(current.modelsConfig.providers || {})) {
      if (!k.startsWith(PROFILE_PROVIDER_PREFIX)) modelsConfig.providers[k] = v;
    }
    Object.assign(modelsConfig.providers, entries);

    const settingsConfig = { ...current.settingsConfig };
    const def = profiles.find((p) => p.id === envSel.defaultId && entries[this.providerKeyOf(p)]);
    if (def) {
      settingsConfig.defaultProvider = this.providerKeyOf(def);
      settingsConfig.defaultModel = def.modelId;
      // 預設由設定檔決定；設定檔未指定思考等級時交回 pi 預設，避免沿用上一張設定檔的值
      if (def.thinkingLevel) settingsConfig.defaultThinkingLevel = def.thinkingLevel;
      else delete settingsConfig.defaultThinkingLevel;
    } else if (String(settingsConfig.defaultProvider || '').startsWith(PROFILE_PROVIDER_PREFIX)) {
      // 原本的預設設定檔已被停用：移除指向不存在供應商的預設
      delete settingsConfig.defaultProvider;
      delete settingsConfig.defaultModel;
    }

    const writeRes = ssh
      ? await this.sshManager.writeRemoteAgentConfig(ssh, { modelsConfig, settingsConfig })
      : writeLocalAgentConfig({ modelsConfig, settingsConfig });
    if (!writeRes.success) return { success: false, error: writeRes.error };
    return { success: true, errors };
  }
}

function cleanSampling(sp) {
  if (!sp) return null;
  const out = {};
  for (const [k, v] of Object.entries(sp)) {
    if (v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v))) out[k] = Number(v);
  }
  return Object.keys(out).length ? out : null;
}

function readLocalAgentConfig() {
  const agentDir = path.join(os.homedir(), '.pi', 'agent');
  const readJson = (file, fallback) => {
    const p = path.join(agentDir, file);
    if (!fs.existsSync(p)) return fallback;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (e) {
      console.error(`[model-profiles] ${file} 解析錯誤:`, e);
      return fallback;
    }
  };
  return {
    success: true,
    agentDir,
    modelsConfig: readJson('models.json', { providers: {} }),
    settingsConfig: readJson('settings.json', {}),
  };
}

function writeLocalAgentConfig({ modelsConfig, settingsConfig }) {
  const agentDir = path.join(os.homedir(), '.pi', 'agent');
  if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
  if (modelsConfig) {
    fs.writeFileSync(path.join(agentDir, 'models.json'), JSON.stringify(modelsConfig, null, 2), 'utf-8');
  }
  if (settingsConfig) {
    fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify(settingsConfig, null, 2), 'utf-8');
  }
  return { success: true, agentDir };
}

module.exports = { ModelProfileManager, PROFILE_PROVIDER_PREFIX, SAMPLING_APIS };
