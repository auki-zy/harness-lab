/**
 * skill-up 的"引擎"（真正干活的 agent CLI）在本机是否可用。
 * 用来在跑评测之前就发现"引擎没装"——否则 skill-up 会把每个用例判成 exit 127 的 ERROR，
 * 报告照出、结论只能是 retry，白跑一轮还留下一条没信息量的记录。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** skill-up 认识的引擎 → 本机命令名；不在表里的自定义引擎按名字当命令用 */
export const KNOWN_ENGINES = { qodercli: 'qodercli', claude_code: 'claude', codex: 'codex', qwen_code: 'qwen' };

export function whichBin(bin) {
  if (!bin) return null;
  const res = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
  const first = (res.stdout ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)[0];
  return res.status === 0 && first ? first : null;
}

/**
 * eval.yaml 里的 `engine.name` / `engine.model.name`。
 *
 * 两个坑（都踩过）：
 *   1. **值后面允许跟行内注释**——脚手架模板就是 `name: claude_code   # 换成你本机装了的引擎：…`，
 *      旧正则要求"值必须顶到行尾"，于是匹配不到这一行、继续往下找，把 `model.name: auto` 读成了引擎名，
 *      跑前检查报"引擎「auto」在本机不可用"（能力拉进来了、用例也出好了，却卡在这）。
 *   2. `model:` 必须限定在 `engine:` 块里——`eval.ask.yaml` 里还有一个 `judge.model`。
 */

/** 取一个顶格块（`engine:` 到下一个顶格键之前）的原文 */
function topLevelBlock(text, key) {
  const start = new RegExp(`^${key}:\\s*$`, 'm').exec(text);
  if (!start) return '';
  const rest = text.slice(start.index + start[0].length);
  const end = rest.search(/^\S/m);
  return end === -1 ? rest : rest.slice(0, end);
}

/** 块里第一个缩进的 `name:`（值可带引号、可带行内注释）；给了 key 就只认该子块里的 name */
function indentName(text, key = null) {
  const value = '^\\s+name:\\s*["\']?([^\\s"\'#]+)["\']?\\s*(?:#.*)?$';
  const pattern = key === null ? value : `^\\s+${key}:\\s*$[\\s\\S]*?${value}`;
  const m = text.match(new RegExp(pattern, 'm'));
  return m?.[1] ?? '';
}

/** eval.yaml 里的 engine.name（只认 engine: 块里的第一个 name:） */
export function configuredEngine(evalConfig) {
  if (!evalConfig || !existsSync(evalConfig)) return '';
  return indentName(topLevelBlock(readFileSync(evalConfig, 'utf8'), 'engine'));
}

export function availableEngines() {
  return Object.entries(KNOWN_ENGINES)
    .filter(([, bin]) => whichBin(bin))
    .map(([name]) => name);
}

/** 这次会用哪个引擎、它在本机是否可用、本机有哪些可用 */
export function engineStatus(evalConfig, override) {
  const name = (override ?? configuredEngine(evalConfig) ?? '').trim();
  const bin = KNOWN_ENGINES[name] ?? name;
  return { name, bin, path: whichBin(bin), available: availableEngines() };
}

/** codex 本地凭据里的 API key（只读长度做健全性检查，不打印内容）；读不到返回 null */
function storedCodexKey() {
  const file = join(homedir(), '.codex', 'auth.json');
  if (!existsSync(file)) return null;
  try {
    const key = JSON.parse(readFileSync(file, 'utf8')).OPENAI_API_KEY;
    return typeof key === 'string' ? key : null;
  } catch {
    return null;
  }
}

/**
 * 引擎的登录状态。**装了不等于能用**：没登录时引擎会以 401 / "Not logged in" 失败，
 * 每个用例都变成 ERROR，白跑一轮。检查都是本地命令，不花额度。
 *   claude_code → 先看内部网关（Athen）的 key 在不在；不在才查 `claude auth status`
 *   codex       → `codex login status` + 本地 key 的健全性检查
 */
export function engineAuth(name) {
  const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32', timeout: 20000 });

  if (name === 'claude_code') {
    if (athenKey()) {
      return { ok: true, detail: `走内部网关 ${ATHEN_HOST}（模型 ${athenModel()}）：key 来自 ${athenKeySource()}` };
    }
    const res = run('claude', ['auth', 'status']);
    const text = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    try {
      const info = JSON.parse((res.stdout ?? '').trim());
      return info.loggedIn === true
        ? { ok: true, detail: `已登录 Anthropic 官方账号（${info.authMethod ?? 'unknown'}）` }
        : { ok: false, detail: '装了，但既没有内部网关的 key，也没登录官方账号 —— 设 DEEPSEEK_API_KEY（Athen）或运行 `claude auth login`' };
    } catch {
      return { ok: false, detail: `拿不到登录状态（claude auth status 没返回 JSON）：${text.trim().slice(0, 120)}` };
    }
  }

  if (name === 'codex') {
    const res = run('codex', ['login', 'status']);
    const text = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    const line = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] ?? '';
    // 注意 "Not logged in" 里也含 "logged in"，别用 /Logged in/ 直接判
    if (!/logged in/i.test(text) || /not logged in/i.test(text)) {
      return { ok: false, detail: '装了但没登录 —— 运行 `codex login`，或设 OPENAI_API_KEY' };
    }
    // `login status` 只看"有没有凭据"，不看凭据是否有效：占位/失效的 key 会在真跑时报 401
    if (/API key/i.test(line)) {
      const key = storedCodexKey();
      if (key !== null && key.length < 20) {
        return { ok: false, detail: `凭据是占位值（OPENAI_API_KEY 长度只有 ${key.length}）——运行 \`codex login\`，或把真的 key 写进 ~/.codex/auth.json` };
      }
      return { ok: true, detail: '登录状态：API key（凭据无效时会在跑评测时报 401）' };
    }
    return { ok: true, detail: line.replace(/\*+/g, '…') };
  }

  // 自定义引擎没法通用判断，交给它自己报错
  return { ok: true, detail: '自定义引擎：不检查登录状态' };
}

/** 本机装了哪些引擎 + 各自的登录状态（页面和跑前检查共用） */
export function engineInventory() {
  return availableEngines().map((name) => ({ name, ...engineAuth(name) }));
}

/* ────────────────────────── 内部网关（Athen） ──────────────────────────
 * 公司内网的 LLM 网关，OpenAI / Anthropic / Responses 三种形状都支持
 * （`/v1/chat/completions`、`/v1/messages`、`/v1/responses` 都实测通过）。
 * 走它就不需要 claude/codex 的官方登录：给 Claude Code 注入下面这组环境变量即可。
 * key 只从环境变量或 DSH 已经存好的凭据文件里读，**不落进本仓库、也不打印**。
 */
export const ATHEN_HOST = 'https://athenai.mihoyo.com';
/** 默认模型：走网关时用它（可用 ATHEN_MODEL 覆盖）。deepseek-v4-flash 实测能被 Claude Code 正常驱动（含工具调用） */
const ATHEN_DEFAULT_MODEL = 'deepseek-v4-flash';
const ATHEN_DEFAULT_SMALL_MODEL = 'deepseek-v4-flash';
const DSH_CREDENTIALS = join(homedir(), '.dsh', '.credentials.yaml');

export function athenModel() {
  return process.env.ATHEN_MODEL || ATHEN_DEFAULT_MODEL;
}

/** 网关地址（可用 ATHEN_BASE_URL 覆盖，方便指向别的环境） */
export function athenHost() {
  return (process.env.ATHEN_BASE_URL || ATHEN_HOST).replace(/\/+$/, '');
}

/** 取 key：环境变量优先，其次 DSH 的凭据文件（里面就是网关的 key，harness 自己也在用） */
export function athenKey() {
  if (process.env.ANTHROPIC_AUTH_TOKEN) return process.env.ANTHROPIC_AUTH_TOKEN;
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  if (!existsSync(DSH_CREDENTIALS)) return null;
  const m = readFileSync(DSH_CREDENTIALS, 'utf8').match(/^\s*DEEPSEEK_API_KEY:\s*(\S+)\s*$/m);
  return m?.[1] ?? null;
}

export function athenKeySource() {
  if (process.env.ANTHROPIC_AUTH_TOKEN) return '$ANTHROPIC_AUTH_TOKEN';
  if (process.env.ANTHROPIC_API_KEY) return '$ANTHROPIC_API_KEY';
  if (process.env.DEEPSEEK_API_KEY) return '$DEEPSEEK_API_KEY';
  return '~/.dsh/.credentials.yaml';
}

/**
 * 给子进程注入的环境变量：把 Claude Code 指向内部网关。
 * 非 claude_code 引擎、或没有 key 时返回 null（调用方就不改环境）。
 */
export function engineEnv(name) {
  if (name !== 'claude_code') return null;
  const key = athenKey();
  if (!key) return null;
  return {
    ANTHROPIC_BASE_URL: athenHost(),
    ANTHROPIC_AUTH_TOKEN: key,
    ANTHROPIC_MODEL: athenModel(),
    ANTHROPIC_SMALL_FAST_MODEL: process.env.ATHEN_SMALL_MODEL || ATHEN_DEFAULT_SMALL_MODEL,
    // 官方账号相关的旁路请求（统计/上报）在内网走不通，关掉免得拖慢或报错
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    // 网关上的模型名不在 Claude Code 自带的模型表里，它会按 200k 上下文去猜并每轮提示一次；
    // 关掉这个"未知模型也强行限窗"的开关，让它照常等 API 返回（否则报告里全是这条 warning）
    CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT: '1',
  };
}

/** eval.yaml 里 engine.model.name（`auto` 表示"用引擎默认"，这时由我们给出网关的模型名） */
export function configuredModel(evalConfig) {
  if (!evalConfig || !existsSync(evalConfig)) return '';
  return indentName(topLevelBlock(readFileSync(evalConfig, 'utf8'), 'engine'), 'model');
}

/**
 * 给"走 OpenAI 兼容接口"的工具（promptfoo 的 `openai:` provider）注入网关环境，
 * 这样子代理评测也是**真模型**在跑，而不是本地 stub 假扮的。
 */
export function openAiCompatEnv() {
  const key = athenKey();
  if (!key) return null;
  return {
    OPENAI_BASE_URL: `${athenHost()}/v1`,
    OPENAI_API_BASE: `${athenHost()}/v1`,
    OPENAI_API_KEY: key,
    DEEPSEEK_API_KEY: key,
  };
}
