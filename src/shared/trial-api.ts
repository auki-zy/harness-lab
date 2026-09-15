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

/** 这次跑的是哪条路：用户自己出题（ask）/ 一键评测（auto）/ 直接跑已有用例（run） */
export type EvalRunKind = 'ask' | 'auto' | 'run';

/**
 * 一次后台评测（页面「正在评测」那一块用它）。
 *
 * 发起评测是**后台任务**：提交完弹窗就关，任务在服务端继续跑，列表里挂着这一条、
 * 点「看进度」能看日志。所以这里只有一行进度（`tail`），日志正文另走 `evalRunState(id)`。
 */
export interface EvalRunInfo {
  id: string;
  /** 跑的是哪个能力（填链接发起时就是那段链接） */
  name: string;
  tool: string;
  /** 工具的人话名字（服务端按 TOOLS 给的，页面不用再抄一套） */
  toolLabel: string;
  kind: EvalRunKind;
  /** 重复跑次数（同一条用例跑几遍）；1 = 不重复。跑完的结论里会给"全过几次" */
  repeat?: number;
  status: 'running' | 'done';
  code: number | null;
  startedAt: number;
  durationMs: number;
  /** 日志最后一行：列表里一眼看出跑到哪了 */
  tail: string;
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

/** 发起：直接跑某个能力已有的用例（服务端立刻返回，任务在后台跑） */
export const evalStart = (input: {
  tool: string;
  name: string;
  engine?: string;
  config?: string;
  purpose?: string;
  inspector?: boolean;
  /** 重复跑次数（1–5）：同一条用例跑 N 遍，结论里给"全过几次"，免得拿一次运行当结论 */
  repeat?: number;
}): Promise<{ runId: string; run: EvalRunInfo }> =>
  call<{ runId: string; run: EvalRunInfo }>('/api/eval/run', { method: 'POST', body: JSON.stringify(input) });

export const evalRunState = (id: string): Promise<{ status: 'running' | 'done'; code: number | null; log: string; run?: EvalRunInfo }> =>
  call<{ status: 'running' | 'done'; code: number | null; log: string; run?: EvalRunInfo }>(
    `/api/eval/run?id=${encodeURIComponent(id)}`,
  );

/** 后台在跑 / 最近跑过的评测：关掉弹窗、刷新页面之后，列表里照样能看到并点进去看进度 */
export const evalRuns = (): Promise<{ runs: EvalRunInfo[] }> => call<{ runs: EvalRunInfo[] }>('/api/eval/runs');

/** 一句话评测：能力名直接用；看着像链接就拉取 + 自动设计用例再跑；带 task 就按用户自己出的题跑 A/B */
export const evalAuto = (input: { input: string; task?: string; repeat?: number }): Promise<{ runId: string; run: EvalRunInfo }> =>
  call<{ runId: string; run: EvalRunInfo }>('/api/eval/auto', { method: 'POST', body: JSON.stringify(input) });

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
