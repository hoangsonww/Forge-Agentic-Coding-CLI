/**
 * Local-model catalogue: one place to map a model id → Forge's routing
 * metadata. Used by every local-runtime provider (Ollama, llama.cpp, vLLM,
 * LM Studio, LocalAI, OpenAI-compatible generic) so they stay consistent.
 *
 * The matcher intentionally handles both Ollama-style ids (`llama3.1:8b`,
 * `qwen2.5-coder:14b`) and HF-style ids (`meta-llama/Llama-3.1-8B-Instruct`)
 * without a hard dependency on either.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import { ModelDescriptor, ModelRole } from '../types';

export type ModelClass = ModelDescriptor['class'];

export interface LocalModelMeta {
  class: ModelClass;
  roles: ModelRole[];
  contextTokens: number;
}

const norm = (id: string): string => id.toLowerCase().replace(/[_/]/g, '-').replace(/\s+/g, '');

const extractParamsB = (id: string): number | null => {
  // "llama3.1:8b", "qwen2.5:14b", "mixtral-8x7b" etc.
  const m = /[^0-9](\d{1,3})(?:\.\d+)?b\b/.exec(norm(id));
  if (!m) return null;
  return Number(m[1]);
};

const extractMoeTotal = (id: string): number | null => {
  // "mixtral-8x7b" → 56, "8x22b" → 176
  const m = /(\d+)x(\d+)b\b/.exec(norm(id));
  if (!m) return null;
  return Number(m[1]) * Number(m[2]);
};

const sizeB = (id: string): number | null => extractMoeTotal(id) ?? extractParamsB(id);

/**
 * Family detection — ordered by specificity so the most accurate hit wins.
 * Every entry returns the *canonical* family tag which the metadata table
 * then resolves into class/roles/context.
 */
type Family =
  | 'llama4'
  | 'llama3'
  | 'llama2'
  | 'codellama'
  | 'deepseek-r1'
  | 'deepseek-v3'
  | 'deepseek-coder'
  | 'deepseek'
  | 'qwen3'
  | 'qwen25-coder'
  | 'qwen25'
  | 'qwen2'
  | 'qwen'
  | 'gemma3'
  | 'gemma2'
  | 'gemma'
  | 'phi4'
  | 'phi3'
  | 'phi'
  | 'mixtral'
  | 'mistral-nemo'
  | 'mistral-small'
  | 'mistral-large'
  | 'mistral'
  | 'command-r-plus'
  | 'command-r'
  | 'starcoder'
  | 'codegemma'
  | 'codestral'
  | 'granite-code'
  | 'granite'
  | 'yi'
  | 'solar'
  | 'zephyr'
  | 'minicpm'
  | 'llava'
  | 'openchat'
  | 'wizardcoder'
  | 'aya'
  | 'nemotron'
  | 'smollm'
  | 'orca'
  | 'tinyllama'
  | 'gpt4'
  | 'gpt35'
  | 'o-series'
  | 'claude-opus'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'unknown';

const detect = (rawId: string): Family => {
  const id = norm(rawId);
  // --- hosted (OpenAI, Anthropic) — still useful for openai-compat providers ---
  if (/claude.*opus/.test(id)) return 'claude-opus';
  if (/claude.*sonnet/.test(id)) return 'claude-sonnet';
  if (/claude.*haiku/.test(id)) return 'claude-haiku';
  if (/^o1\b|^o3\b|^o4\b/.test(id)) return 'o-series';
  if (/^gpt-?4/.test(id)) return 'gpt4';
  if (/^gpt-?3\.5/.test(id)) return 'gpt35';

  // --- code-specialists (highest specificity) ---
  if (/qwen-?2\.5-?coder|qwen2\.5-coder|qwen-coder/.test(id)) return 'qwen25-coder';
  if (/deepseek-?coder|deepseek-?v2-?coder/.test(id)) return 'deepseek-coder';
  if (/codellama/.test(id)) return 'codellama';
  if (/codestral/.test(id)) return 'codestral';
  if (/codegemma/.test(id)) return 'codegemma';
  if (/starcoder/.test(id)) return 'starcoder';
  if (/wizardcoder/.test(id)) return 'wizardcoder';
  if (/granite.*code|granite-code/.test(id)) return 'granite-code';

  // --- DeepSeek ---
  if (/deepseek-?r1|deepseek.*r1/.test(id)) return 'deepseek-r1';
  if (/deepseek-?v3/.test(id)) return 'deepseek-v3';
  if (/deepseek/.test(id)) return 'deepseek';

  // --- Qwen ---
  if (/qwen-?3|qwen3/.test(id)) return 'qwen3';
  if (/qwen-?2\.5|qwen2\.5/.test(id)) return 'qwen25';
  if (/qwen-?2\b|qwen2/.test(id)) return 'qwen2';
  if (/qwen/.test(id)) return 'qwen';

  // --- Llama ---
  if (/llama-?4|llama4/.test(id)) return 'llama4';
  if (/llama-?3|llama3/.test(id)) return 'llama3';
  if (/llama-?2|llama2/.test(id)) return 'llama2';

  // --- Gemma ---
  if (/gemma-?3|gemma3/.test(id)) return 'gemma3';
  if (/gemma-?2|gemma2/.test(id)) return 'gemma2';
  if (/gemma/.test(id)) return 'gemma';

  // --- Phi ---
  if (/phi-?4|phi4/.test(id)) return 'phi4';
  if (/phi-?3|phi3/.test(id)) return 'phi3';
  if (/phi/.test(id)) return 'phi';

  // --- Mistral family ---
  if (/mixtral/.test(id)) return 'mixtral';
  if (/mistral.*nemo|nemotron/.test(id)) return 'mistral-nemo';
  if (/mistral.*small/.test(id)) return 'mistral-small';
  if (/mistral.*large/.test(id)) return 'mistral-large';
  if (/mistral|mistal/.test(id)) return 'mistral';
  if (/nemotron/.test(id)) return 'nemotron';

  // --- Cohere ---
  if (/command-?r-?plus|c4ai.*plus/.test(id)) return 'command-r-plus';
  if (/command-?r|c4ai-command/.test(id)) return 'command-r';
  if (/aya/.test(id)) return 'aya';

  // --- IBM Granite ---
  if (/granite/.test(id)) return 'granite';

  // --- misc. common local models ---
  if (/^yi[-:]|yi-\d/.test(id)) return 'yi';
  if (/^solar/.test(id)) return 'solar';
  if (/zephyr/.test(id)) return 'zephyr';
  if (/minicpm/.test(id)) return 'minicpm';
  if (/llava/.test(id)) return 'llava';
  if (/openchat/.test(id)) return 'openchat';
  if (/smollm/.test(id)) return 'smollm';
  if (/orca/.test(id)) return 'orca';
  if (/tinyllama/.test(id)) return 'tinyllama';

  return 'unknown';
};

/**
 * Per-family metadata. Context windows reflect the most common public
 * release of each family; per-id overrides (below) handle exceptions.
 */
const FAMILY_META: Record<Family, LocalModelMeta> = {
  // Hosted
  'claude-opus': {
    class: 'heavy',
    roles: ['architect', 'planner', 'reviewer', 'debugger'],
    contextTokens: 200_000,
  },
  'claude-sonnet': {
    class: 'mid',
    roles: ['planner', 'executor', 'reviewer'],
    contextTokens: 200_000,
  },
  'claude-haiku': { class: 'mid', roles: ['fast', 'executor'], contextTokens: 200_000 },
  'o-series': {
    class: 'heavy',
    roles: ['architect', 'planner', 'reviewer', 'debugger'],
    contextTokens: 128_000,
  },
  gpt4: {
    class: 'heavy',
    roles: ['planner', 'architect', 'reviewer', 'executor'],
    contextTokens: 128_000,
  },
  gpt35: { class: 'mid', roles: ['fast', 'executor'], contextTokens: 16_000 },

  // Llama
  llama4: {
    class: 'heavy',
    roles: ['architect', 'planner', 'reviewer', 'executor'],
    contextTokens: 128_000,
  },
  llama3: { class: 'mid', roles: ['planner', 'executor', 'reviewer'], contextTokens: 128_000 },
  llama2: { class: 'mid', roles: ['executor'], contextTokens: 4096 },
  codellama: { class: 'specialized', roles: ['executor', 'fast'], contextTokens: 16_000 },

  // DeepSeek
  'deepseek-r1': {
    class: 'heavy',
    roles: ['architect', 'planner', 'reviewer', 'debugger'],
    contextTokens: 128_000,
  },
  'deepseek-v3': {
    class: 'heavy',
    roles: ['architect', 'planner', 'reviewer'],
    contextTokens: 128_000,
  },
  'deepseek-coder': { class: 'specialized', roles: ['executor', 'fast'], contextTokens: 16_000 },
  deepseek: { class: 'mid', roles: ['planner', 'executor'], contextTokens: 32_000 },

  // Qwen
  qwen3: { class: 'mid', roles: ['planner', 'executor', 'reviewer'], contextTokens: 128_000 },
  'qwen25-coder': { class: 'specialized', roles: ['executor', 'fast'], contextTokens: 128_000 },
  qwen25: { class: 'mid', roles: ['planner', 'executor', 'reviewer'], contextTokens: 128_000 },
  qwen2: { class: 'mid', roles: ['planner', 'executor'], contextTokens: 32_000 },
  qwen: { class: 'mid', roles: ['planner', 'executor'], contextTokens: 32_000 },

  // Gemma
  gemma3: { class: 'mid', roles: ['planner', 'executor', 'fast'], contextTokens: 128_000 },
  gemma2: { class: 'mid', roles: ['fast', 'executor'], contextTokens: 8192 },
  gemma: { class: 'micro', roles: ['fast'], contextTokens: 8192 },

  // Phi
  phi4: { class: 'mid', roles: ['planner', 'executor'], contextTokens: 16_000 },
  phi3: { class: 'micro', roles: ['fast', 'executor'], contextTokens: 128_000 },
  phi: { class: 'micro', roles: ['fast'], contextTokens: 4096 },

  // Mistral family
  mixtral: {
    class: 'heavy',
    roles: ['architect', 'planner', 'reviewer', 'executor'],
    contextTokens: 64_000,
  },
  'mistral-nemo': { class: 'mid', roles: ['planner', 'executor'], contextTokens: 128_000 },
  'mistral-small': { class: 'mid', roles: ['planner', 'executor'], contextTokens: 32_000 },
  'mistral-large': {
    class: 'heavy',
    roles: ['architect', 'planner', 'reviewer'],
    contextTokens: 128_000,
  },
  mistral: { class: 'mid', roles: ['planner', 'executor'], contextTokens: 32_000 },
  nemotron: { class: 'heavy', roles: ['planner', 'architect', 'reviewer'], contextTokens: 128_000 },

  // Code specialists
  codestral: { class: 'specialized', roles: ['executor', 'fast'], contextTokens: 32_000 },
  codegemma: { class: 'specialized', roles: ['executor', 'fast'], contextTokens: 8192 },
  starcoder: { class: 'specialized', roles: ['executor'], contextTokens: 16_000 },
  wizardcoder: { class: 'specialized', roles: ['executor'], contextTokens: 16_000 },
  'granite-code': { class: 'specialized', roles: ['executor', 'fast'], contextTokens: 128_000 },

  // Cohere
  'command-r-plus': {
    class: 'heavy',
    roles: ['planner', 'architect', 'reviewer'],
    contextTokens: 128_000,
  },
  'command-r': { class: 'mid', roles: ['planner', 'executor'], contextTokens: 128_000 },
  aya: { class: 'mid', roles: ['planner', 'executor'], contextTokens: 32_000 },

  // Misc
  granite: { class: 'mid', roles: ['planner', 'executor'], contextTokens: 8192 },
  yi: { class: 'mid', roles: ['planner', 'executor'], contextTokens: 32_000 },
  solar: { class: 'mid', roles: ['executor'], contextTokens: 4096 },
  zephyr: { class: 'mid', roles: ['executor'], contextTokens: 32_000 },
  minicpm: { class: 'micro', roles: ['fast'], contextTokens: 4096 },
  llava: { class: 'mid', roles: ['executor'], contextTokens: 4096 },
  openchat: { class: 'mid', roles: ['executor'], contextTokens: 8192 },
  smollm: { class: 'micro', roles: ['fast'], contextTokens: 2048 },
  orca: { class: 'mid', roles: ['executor'], contextTokens: 4096 },
  tinyllama: { class: 'micro', roles: ['fast'], contextTokens: 2048 },

  // Fallback: accept any unknown model as a mid-range executor so Forge
  // still gives it a chance rather than refusing to route.
  unknown: { class: 'mid', roles: ['executor', 'planner'], contextTokens: 8192 },
};

/**
 * Parameter-count overrides. A 70B model is "heavy" even if its family
 * baseline is "mid"; a 1B model is "micro" even if its family is "mid".
 */
const classForSize = (b: number | null): ModelClass | null => {
  if (b === null) return null;
  if (b <= 4) return 'micro';
  if (b <= 13) return 'mid';
  if (b >= 30) return 'heavy';
  return null;
};

/**
 * Classify any local/hosted model id.
 *
 * The function is deterministic and side-effect free so it's safe to call
 * from anywhere (registry, router, doctor, UI).
 */
export const classifyModel = (id: string): LocalModelMeta => {
  const family = detect(id);
  const base = FAMILY_META[family];
  const sized = classForSize(sizeB(id));
  const cls = sized ?? base.class;
  // For code-specialists, keep the specialist tag even at large sizes.
  const klass: ModelClass = base.class === 'specialized' ? 'specialized' : cls;
  return { class: klass, roles: base.roles, contextTokens: base.contextTokens };
};

/**
 * Given a list of models available on a provider, pick the best match
 * for a role. Preference order:
 *   1. models whose classifier roles explicitly include the desired role
 *   2. specialized (for 'executor') or heavy (for architect/reviewer)
 *   3. largest parameter count as a tiebreaker
 *   4. any model at all as a last resort
 */
export const pickModelForRole = (
  installed: Array<{ id: string; meta?: LocalModelMeta }>,
  role: ModelRole,
): string | null => {
  if (!installed.length) return null;
  const enriched = installed.map((m) => ({
    id: m.id,
    meta: m.meta ?? classifyModel(m.id),
    size: sizeB(m.id) ?? 0,
  }));

  const score = (m: (typeof enriched)[number]): number => {
    let s = 0;
    if (m.meta.roles.includes(role)) s += 100;
    if (role === 'executor' && m.meta.class === 'specialized') s += 30;
    if (
      (role === 'architect' || role === 'reviewer' || role === 'debugger') &&
      m.meta.class === 'heavy'
    )
      s += 25;
    if ((role === 'fast' || role === 'executor') && m.meta.class === 'micro' && role === 'fast')
      s += 15;
    // Prefer newer families over older; cheap proxy via context window size.
    s += Math.log2(Math.max(1, m.meta.contextTokens / 4096));
    // Size: for heavy roles, bigger is better; for fast, smaller wins.
    if (role === 'fast') s -= m.size * 0.5;
    else s += m.size * 0.1;
    return s;
  };

  const ranked = [...enriched].sort((a, b) => score(b) - score(a));
  return ranked[0]?.id ?? null;
};

export const _sizeBForTest = sizeB;
export const _detectFamilyForTest = detect;
