import type { CatalogModel, ModelCatalog, ModelProfile, ThinkingLevel } from '../types';

export const ALL_THINKING_LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

// 只有這些 API 格式會送出 samplingParams（與 electron/model-profiles.cjs 一致）
const SAMPLING_APIS = ['openai-completions', 'openai-responses', 'azure-openai-responses'];

// OpenAI Compatible 沒有 pi 內建值可回復，這是它的「預設」
export const COMPAT_DEFAULTS = { contextWindow: 128000, maxTokens: 8192 };

// pi 目錄沒有供應商顯示名稱，常見的在此對照（取自 pi 文件），其餘顯示 id
const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google Gemini',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  mistral: 'Mistral',
  xai: 'xAI',
  cerebras: 'Cerebras',
  nvidia: 'NVIDIA NIM',
  huggingface: 'Hugging Face',
  fireworks: 'Fireworks',
  together: 'Together AI',
  baseten: 'Baseten',
  meta: 'Meta',
  minimax: 'MiniMax',
  'minimax-cn': 'MiniMax (China)',
  moonshotai: 'Moonshot AI',
  'moonshotai-cn': 'Moonshot AI (China)',
  'kimi-coding': 'Kimi For Coding',
  zai: 'ZAI Coding Plan',
  'zai-coding-cn': 'ZAI Coding Plan (China)',
  'qwen-token-plan': 'Qwen Token Plan',
  'qwen-token-plan-cn': 'Qwen Token Plan (China)',
  'qwen-token-plan-individual': 'Qwen Token Plan (Individual)',
  xiaomi: 'Xiaomi MiMo',
  'xiaomi-token-plan-cn': 'Xiaomi MiMo Token Plan (China)',
  'xiaomi-token-plan-ams': 'Xiaomi MiMo Token Plan (Amsterdam)',
  'xiaomi-token-plan-sgp': 'Xiaomi MiMo Token Plan (Singapore)',
  'ant-ling': 'Ant Ling',
  opencode: 'OpenCode Zen',
  'opencode-go': 'OpenCode Go',
  'vercel-ai-gateway': 'Vercel AI Gateway',
  'github-copilot': 'GitHub Copilot',
  'openai-codex': 'OpenAI Codex (ChatGPT)',
  radius: 'Radius',
  'amazon-bedrock': 'Amazon Bedrock',
  'google-vertex': 'Google Vertex AI',
  azure: 'Azure OpenAI',
  'cloudflare-ai-gateway': 'Cloudflare AI Gateway',
  'cloudflare-workers-ai': 'Cloudflare Workers AI',
};

export const providerLabel = (id?: string) => (id ? PROVIDER_NAMES[id] || id : '');

export const findCatalogModel = (catalog: ModelCatalog | null, provider?: string, modelId?: string) =>
  catalog?.providers.find((p) => p.id === provider)?.models.find((m) => m.id === modelId) || null;

// 模型支援的思考等級：off～high 除非標為 null 都支援；xhigh / max 需明確對應
export function supportedThinkingLevels(model: { reasoning?: boolean; thinkingLevelMap?: CatalogModel['thinkingLevelMap'] } | null): ThinkingLevel[] {
  if (!model?.reasoning) return ['off'];
  const map = model.thinkingLevelMap || {};
  return ALL_THINKING_LEVELS.filter((lvl) => {
    if (map[lvl] === null) return false;
    if (lvl === 'xhigh' || lvl === 'max') return typeof map[lvl] === 'string';
    return true;
  });
}

export const supportsSampling = (api?: string) => !!api && SAMPLING_APIS.includes(api);

// 設定檔目前生效的規格（未覆寫的欄位取預設）
export function effectiveSpec(profile: ModelProfile, catalog: ModelCatalog | null) {
  if (profile.kind === 'openai-compatible') {
    return {
      api: 'openai-completions',
      contextWindow: profile.contextWindow || COMPAT_DEFAULTS.contextWindow,
      maxTokens: profile.maxTokens || COMPAT_DEFAULTS.maxTokens,
      levels: supportedThinkingLevels({ reasoning: profile.reasoning }),
      missing: false,
    };
  }
  const base = findCatalogModel(catalog, profile.provider, profile.modelId);
  return {
    api: base?.api,
    contextWindow: profile.contextWindow || base?.contextWindow,
    maxTokens: profile.maxTokens || base?.maxTokens,
    levels: supportedThinkingLevels(base),
    missing: !!catalog && !base,
  };
}

export const formatTokens = (n?: number) => {
  if (!n) return '—';
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
};
