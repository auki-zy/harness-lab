/** 「页面上发起评测」的接口客户端：dev server 提供 /api/eval/*（见 vite.config.ts） */

export interface EvalToolInfo {
  id: string;
  label: string;
  hint: string;
}

/** 能直接跑评测的能力（已登记的 + candidates/adopted 目录里的），页面据此按类型自动选工具 */
export interface EvalCapability {
  id: string;
  type: string;
  tool: string;
  hasConfig: boolean;
  registered: boolean;
}

/** 本机装了的 skill-up 引擎（agent CLI）与它的登录状态：装了不等于能用 */
export interface EvalEngine {
  name: string;
  ok: boolean;
  detail: string;
}

export interface EvalStatus {
  tools: EvalToolInfo[];
  capabilities: EvalCapability[];
  purposes: string[];
  engines: EvalEngine[];
}

export interface EvalLog {
  ok: boolean;
  code: number | null;
  log: string;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `请求失败（HTTP ${res.status}）`);
  return body;
}

export const evalStatus = (): Promise<EvalStatus> => call<EvalStatus>('/api/eval/status');

export const evalPrepare = (input: { source: string; name?: string }): Promise<EvalLog> =>
  call<EvalLog>('/api/eval/prepare', { method: 'POST', body: JSON.stringify(input) });

export const evalStart = (input: {
  tool: string;
  name: string;
  engine?: string;
  config?: string;
  purpose?: string;
  inspector?: boolean;
}): Promise<{ runId: string }> => call<{ runId: string }>('/api/eval/run', { method: 'POST', body: JSON.stringify(input) });

export const evalRunState = (id: string): Promise<{ status: 'running' | 'done'; code: number | null; log: string }> =>
  call<{ status: 'running' | 'done'; code: number | null; log: string }>(`/api/eval/run?id=${encodeURIComponent(id)}`);

/** 一句话评测：能力名直接用；看着像链接就拉取 + 自动设计用例再跑；带 task 就按用户自己出的题跑 A/B */
export const evalAuto = (input: { input: string; task?: string }): Promise<{ runId: string }> =>
  call<{ runId: string }>('/api/eval/auto', { method: 'POST', body: JSON.stringify(input) });

export const evalImport = (input: { tool: string; name: string; result: string; purpose?: string }): Promise<EvalLog> =>
  call<EvalLog>('/api/eval/import', { method: 'POST', body: JSON.stringify(input) });

/**
 * **按能力起草一条任务提示词**（读 SKILL.md，交付物形态跟着能力走）：
 * 只返回文本，用户改完再提交——不填提示词时自动出的题对"UI / 视觉类"技能常常跑偏。
 * 传 `name` 用已在册的能力；传 `input`（来源链接 / owner/repo）会**先把它拉进候选池**再起草——
 * 从技能市场选出来的那条就是链接，不认这个的话按钮永远是灰的。
 */
export const draftPrompt = (input: { name: string } | { input: string }): Promise<{ prompt: string; pulled?: string }> =>
  call<{ prompt: string; pulled?: string }>('/api/eval/draft-prompt', { method: 'POST', body: JSON.stringify(input) });

/** 技能市场（skillsmp.com）的一条搜索结果 */
export interface MarketSkill {
  id: string;
  name: string;
  author: string;
  description: string;
  /** GitHub 来源（`.../tree/main/<技能目录>`）——正是我们认的来源写法，选它就能直接跑 */
  source: string;
  /** 市场里的详情页 */
  url: string;
  stars: number;
}

/**
 * 按名称 / 描述关键词搜技能市场（**服务端代理**，避开跨域，也方便出错时给一句人话）。
 * 只是"去哪找一个候选"的便利入口：搜不到照旧能手填 `owner/repo` 或链接。
 */
export const searchMarket = (q: string, limit = 8): Promise<{ skills: MarketSkill[] }> =>
  call<{ skills: MarketSkill[] }>(`/api/eval/market?q=${encodeURIComponent(q)}&limit=${limit}`);

/** 人评入口：把一次 👍/👎（可选一句理由）写进某条试用记录，再重新聚合 */
export const saveReview = (input: { trialId: string; verdict: 'up' | 'down'; reason?: string }): Promise<{ ok: true; trialId: string }> =>
  call<{ ok: true; trialId: string }>('/api/review', { method: 'POST', body: JSON.stringify(input) });

/**
 * **人的结论**：采纳 / 不采纳某个能力（这是 adopted / rejected 的唯一入口）。
 * 写进 `evals/capabilities.json` 的 `humanDecision`，并同步状态；机器自己不会采纳。
 */
export const saveCapabilityDecision = (input: { capabilityId: string; verdict: 'adopt' | 'reject'; reason?: string }): Promise<{
  ok: true;
  capabilityId: string;
  status: string;
}> =>
  call<{ ok: true; capabilityId: string; status: string }>('/api/review', {
    method: 'POST',
    body: JSON.stringify({ scope: 'capability', ...input }),
  });

/** dev 里有没有这套写接口（静态构建里没有：页面退回纯展示，人评入口不出现） */
export const writeApiAvailable = (): Promise<boolean> =>
  evalStatus()
    .then(() => true)
    .catch(() => false);
