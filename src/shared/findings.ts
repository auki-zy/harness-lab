import type { Capability, Trial, TrialCondition } from './types';
import type { Tone } from './tags';

/** 结论 → 印章词 + 一句话解释（脱离上下文也能读懂） */
export interface DecisionView {
  /** 印章上的短词：采纳 / 挂起 / 放弃 / 重试 / 未评估 */
  stamp: string;
  /** 口语结论：可以采纳 / 先挂着 … */
  headline: string;
  /** 为什么是这个结论 */
  detail: string;
  tone: Tone;
}

export function decisionView(decision?: string): DecisionView {
  switch (decision) {
    case 'adopt':
      return { stamp: '采纳', headline: '可以采纳', detail: '你已确认采纳：证据够了，也符合你的用法', tone: 'adopt' };
    // 机器跑完最后一步给的是这一档：**证据够了，但采不采纳由人定**（不再自动采纳）
    case 'ready':
      return {
        stamp: '待确认',
        headline: '机器判定达标，等你定',
        detail: '客观检查连续全过、无退步；采不采纳由你在能力详情里给结论',
        tone: 'ready',
      };
    case 'hold':
      return { stamp: '挂起', headline: '先挂着', detail: '受控对比通过了，但还没在真实项目里用过', tone: 'hold' };
    // MCP 专用的一档：可用性检查的结论（问的是"能不能用"，不是"值不值得装"）
    case 'available':
      return { stamp: '可用', headline: '这个 server 能用', detail: '可用性检查通过：起得来、握手、列得出工具、样例调用有结果', tone: 'adopt' };
    case 'unavailable':
      return { stamp: '不可用', headline: '这个 server 用不了', detail: '可用性检查没通过：协议层就有问题，先修好再用', tone: 'reject' };
    case 'rejected':
      return { stamp: '放弃', headline: '不采纳', detail: '试过之后没看到收益，或者表现更差', tone: 'reject' };
    case 'retry':
      return { stamp: '重试', headline: '要再试一次', detail: '这次证据不够或者中途卡住，结论还下不了', tone: 'retry' };
    default:
      return { stamp: '未评估', headline: '还没有结论', detail: '收录了，但还没跑过试用', tone: 'none' };
  }
}

/** 能力状态 → 短标签 + 解释 */
export interface StatusView {
  label: string;
  detail: string;
}

export function statusView(status?: string): StatusView {
  switch (status) {
    case 'candidate':
      return { label: '候选', detail: '已经收录，但还没开始试' };
    case 'trialing':
      return { label: '试用中', detail: '正在收集证据，还没下最终结论' };
    case 'adopted':
      return { label: '已采纳', detail: '已经放进内置能力，默认可用' };
    case 'rejected':
      return { label: '已放弃', detail: '不再考虑用它' };
    default:
      return { label: status ?? '未知状态', detail: '数据里没有这个状态的定义' };
  }
}

/** A / B 条件 → 人话 */
export function conditionMeaning(condition: TrialCondition): string {
  return `${condition.name}：${condition.withCapability ? '加载了这个能力' : '不加载这个能力'}`;
}

/** 一句话说明（台账行显示）：这个能力是干什么的 */
export function capabilityDescription(cap: Capability): string {
  return cap.description ?? '还没有写一句话说明。';
}

/** 一句话结论（详情「采纳/放弃原因」显示） */
export function capabilityConclusion(cap: Capability): string {
  if (cap.summary) return cap.summary;
  if (cap.latestTrial?.verdict?.reason) return cap.latestTrial.verdict.reason;
  const decision = capabilityDecisionView(cap);
  return `${decision.headline}——${decision.detail}。`;
}

/** 原因模块的标题：采纳 / 放弃 / 还在试用 */
export function capabilityReasonTitle(cap: Capability): string {
  if (cap.status === 'adopted') return '采纳原因';
  if (cap.status === 'rejected') return '放弃原因';
  return '判定依据';
}

/**
 * **能力级**结论：由能力状态决定（adopted / rejected），否则退回最近一次试用的结论。
 * 它与"单条试用的结论"是两回事——试用的结论只评那一次，不替能力下结论。
 */
export function capabilityDecisionView(cap: Capability): DecisionView {
  if (cap.status === 'adopted') return decisionView('adopt');
  if (cap.status === 'rejected') return decisionView('rejected');
  return decisionView(cap.latestTrial?.verdict?.decision);
}

function sizeNote(trial?: Trial | null): string | null {
  const size = trial?.measures?.sizeKB;
  if (!size || typeof size.A !== 'number' || typeof size.B !== 'number') return null;
  const diff = Math.round((size.B - size.A) * 10) / 10;
  if (Math.abs(diff) < 0.05) return `体积：两版一样大（各 ${size.A} KB）`;
  return `体积：B 比 A ${diff > 0 ? '大' : '小'} ${Math.abs(diff)} KB`;
}

/** 对照条要用的信息：人评选了哪版 */
export interface AbView {
  hasTrial: boolean;
  /** 是否有 A/B 两个对照条件——没有对照条件时杆子只显示状态 */
  hasControl: boolean;
  hasReview: boolean;
  winner: 'A' | 'B' | 'tie' | null;
  /** 「人评选了 B」（无障碍标签与 hover 提示用；杆子上只用对勾表达） */
  winnerText: string;
}

export function abView(trial?: Trial | null): AbView {
  const conditions = trial?.conditions ?? [];
  const hasControl = conditions.length >= 2;
  const review = trial?.humanReview ?? null;
  const better = review?.better;
  const winner = better === 'A' || better === 'B' ? better : better === 'tie' ? 'tie' : null;

  let winnerText: string;
  if (!review) winnerText = '还没有人评';
  else if (winner === 'tie') winnerText = '人评认为打平';
  else if (winner === 'A' || winner === 'B') winnerText = `人评选了 ${winner}`;
  else winnerText = hasControl ? '人评没选哪版更好' : '这次没有 A/B 对照';

  return {
    hasTrial: Boolean(trial),
    hasControl,
    hasReview: Boolean(review),
    winner,
    winnerText,
  };
}

/** 条件名 → 带人话的列名（指标表表头用） */
export function conditionLabel(trial: Trial | null | undefined, name: string): string {
  const condition = (trial?.conditions ?? []).find((c) => c.name === name);
  if (!condition) return name;
  return `${name} ${condition.withCapability ? '加载了能力' : '不加载能力'}`;
}

/** 人评 → 结构化的人话 */
export interface HumanReviewView {
  hasReview: boolean;
  /** 👍 愿意继续用 / 👎 不想继续用 / 评审人没表态 */
  verdictLabel: string;
  verdictTone: 'up' | 'down' | 'none';
  /** 认为哪一版更好 */
  betterText: string;
  reason: string | null;
  modeText: string;
  /** 人评是什么时候记的（页面上的人评入口会在提交时写 reviewedAt） */
  reviewedAt: string | null;
  scores: { name: string; value: number }[];
}

export function humanReviewView(trial?: Trial | null): HumanReviewView {
  const review = trial?.humanReview;
  if (!review) {
    return {
      hasReview: false,
      verdictLabel: '这次试用没有人评审',
      verdictTone: 'none',
      betterText: '没有人工比较过 A / B 两版',
      reason: null,
      modeText: '人评是可选环节：没跑的话，结论只靠客观指标',
      reviewedAt: null,
      scores: [],
    };
  }
  const verdictLabel =
    review.verdict === 'up' ? '👍 愿意继续用' : review.verdict === 'down' ? '👎 不想继续用' : '评审人没表态';
  const betterText =
    review.better === 'A'
      ? '认为 A 更好：不加载能力的版本'
      : review.better === 'B'
        ? '认为 B 更好：加载了能力的版本'
        : review.better === 'tie'
          ? '认为两版打平'
          : '没有比较两版';
  return {
    hasReview: true,
    verdictLabel,
    verdictTone: review.verdict === 'up' ? 'up' : review.verdict === 'down' ? 'down' : 'none',
    betterText,
    reason: review.reason ?? null,
    modeText:
      review.mode === 'detailed' ? '详细评审：按多个维度分别打 1–5 分' : '快捷评审：只判了好坏，没有逐项打分',
    reviewedAt: review.reviewedAt ?? null,
    scores: Object.entries(review.scores ?? {}).map(([name, value]) => ({ name, value })),
  };
}

/** 人评 → 一行短句（试用列表用）：赞/踩 + 选了哪版 */
export function humanReviewLine(trial?: Trial | null): string {
  const view = humanReviewView(trial);
  if (!view.hasReview) return '没人评';
  const winner = abView(trial).winner;
  const pick = winner === 'A' || winner === 'B' ? `选了 ${winner}` : winner === 'tie' ? '认为打平' : '';
  return [view.verdictLabel, pick].filter(Boolean).join(' · ');
}

/**
 * 试用列表那一格只放一个记号：👍 / 👎 / —（完整说法在 hover 的 title 里）。
 * 表格里一行挤六个字段时，"👍 愿意继续用 · 选了 B"这种长句会把表格撑得没法扫（用户反馈）。
 */
export function humanReviewGlyph(trial?: Trial | null): string {
  const verdict = trial?.humanReview?.verdict;
  return verdict === 'up' ? '👍' : verdict === 'down' ? '👎' : '—';
}

/**
 * **能力级人评汇总**：每次试用可以各评各的，但页面得有"到目前为止人怎么看这个能力"的一句话，
 * 否则结论散在 N 条试用里，人还得自己数（用户反馈："人评虽然是每一条评价更细，但应该有一个汇总的总结"）。
 */
export interface HumanSummary {
  /** 评过几次 */
  reviewed: number;
  up: number;
  down: number;
  /** 其中"选了加载能力那版"的次数 */
  pickedWithCapability: number;
  /** 最近一条评价 */
  latest: { trialId: string; date: string; verdictLabel: string; betterText: string; reason: string | null } | null;
  /** 汇总成一句人话（没人评过就给一句说明） */
  line: string;
}

export function humanSummary(cap: Capability): HumanSummary {
  const reviewed = cap.trials.filter((t) => t.humanReview);
  const up = reviewed.filter((t) => t.humanReview?.verdict === 'up').length;
  const down = reviewed.filter((t) => t.humanReview?.verdict === 'down').length;
  const pickedWithCapability = reviewed.filter((t) => abView(t).winner === 'B').length;
  const last = reviewed[reviewed.length - 1] ?? null;
  const latest = last
    ? {
        trialId: last.trialId,
        date: last.date ?? '日期未知',
        verdictLabel: humanReviewView(last).verdictLabel,
        betterText: humanReviewView(last).betterText,
        reason: humanReviewView(last).reason,
      }
    : null;

  const parts: string[] = [];
  if (reviewed.length === 0) parts.push('还没有人评过（每条试用都能单独评，评完这里会汇总）');
  else {
    parts.push(`${reviewed.length} 条试用人评：👍 ${up} · 👎 ${down}`);
    if (pickedWithCapability > 0) parts.push(`其中 ${pickedWithCapability} 次选了「加载能力」那版`);
  }
  return { reviewed: reviewed.length, up, down, pickedWithCapability, latest, line: parts.join('；') };
}

/** **人的结论**（采纳与否）——这是 adopted / rejected 的唯一来源 */
export interface HumanDecisionView {
  decided: boolean;
  verdict: 'adopt' | 'reject' | null;
  label: string;
  reason: string | null;
  reviewedAt: string | null;
  /** 机器现在建议什么（证据够不够） */
  machineHint: string;
}

export function humanDecisionView(cap: Capability): HumanDecisionView {
  const d = cap.humanDecision ?? null;
  const latest = decisionView(cap.latestTrial?.verdict?.decision);
  const machineHint =
    cap.status === 'adopted'
      ? '你已确认采纳。'
      : cap.status === 'rejected'
        ? '你已经给了「不采纳」的结论。'
        : cap.latestTrial?.verdict?.decision === 'ready'
          ? '机器判定达标（连续通过、无退步），采不采纳等你说一句。'
          : `机器目前没有给出"达标"的判断（最近一次：${latest.stamp}）——采纳与否仍然由你定。`;
  return {
    decided: Boolean(d),
    verdict: (d?.verdict as 'adopt' | 'reject') ?? null,
    label: d?.verdict === 'adopt' ? '你的结论：采纳' : d?.verdict === 'reject' ? '你的结论：不采纳' : '还没有你的结论',
    reason: d?.reason ?? null,
    reviewedAt: d?.reviewedAt ?? null,
    machineHint,
  };
}

/** 评判方 → 人话（人评 / 模型评 / 自动检查） */
export function judgeText(trial?: Trial | null): string {
  const judges = (trial?.judge ?? []).map((j) => (j === 'human' ? '人评' : j === 'llm' ? '模型评' : j === 'auto' ? '自动检查' : j));
  return judges.length > 0 ? judges.join(' + ') : '没记录';
}

/**
 * 要不要展示"对比证据链"：只有可复现的评判（模型评 / 自动检查）才值得留链；
 * 只由人评的试用是主观判断，不摆证据模块（产物仍在「条件」里可直接打开）。
 */
export function hasEvidenceChain(trial?: Trial | null): boolean {
  const judges = trial?.judge ?? [];
  if (judges.length === 0) return true;
  return judges.some((j) => j === 'llm' || j === 'auto');
}

/** 试用方式 → 标签与说明（页面上要一眼看出"这次是怎么试的"） */
export interface TrialKindView {
  kind: 'controlled' | 'mock' | 'live';
  label: string;
  /** 表格里用的超短标签（对比 / 模拟 / 实跑 / 探针）——完整说法在 `label` 与 `detail` 里 */
  short: string;
  detail: string;
}

export function trialKindView(trial?: Trial | null): TrialKindView {
  // 只做了可用性检查（MCP 协议探针）的，按"这是什么"来说，别混进"试用方式"里
  if (trial?.probeOnly) {
    return {
      kind: 'mock',
      label: '可用性检查',
      short: '探针',
      detail: '协议探针：起服务 → 握手 → 列工具 → 样例调用，只说明这个 server 能用，不代表值得装进项目',
    };
  }
  const kind = trial?.kind ?? ((trial?.conditions ?? []).length >= 2 ? 'controlled' : 'live');
  switch (kind) {
    case 'controlled':
      return { kind, label: '受控对比', short: '对比', detail: '同一任务跑两遍：一遍不加载能力、一遍加载能力，产物都留在仓库里' };
    case 'mock':
      return { kind, label: '模拟场景', short: '模拟', detail: '固定任务与输入都 mock 在仓库里，看跑出来的结果' };
    default:
      return { kind, label: '真实项目使用', short: '实跑', detail: '在真实项目里用过一次；项目可能不在本仓库，产物不一定留得下' };
  }
}

/** 试用日期 → 短写法（列表里只留「月-日」；`2026-09-11` → `09-11`） */
export function trialDateShort(trial?: Trial | null): string {
  const date = trial?.date ?? '';
  const m = date.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : date || '日期未知';
}

/** 后台评测的三种发起方式 → 一句话（列表里显示"这次是怎么发起的"） */
export function runKindView(kind?: string): { label: string; detail: string } {
  switch (kind) {
    case 'ask':
      return { label: '自己出题', detail: '按你写的那段提示词跑 A/B：A 只给提示词，B 再附上技能' };
    case 'auto':
      return { label: '一键评测', detail: '拉取 →（按技能出题）→ 跑 A/B → 落账，一条龙' };
    default:
      return { label: '跑已有用例', detail: '用这个能力自己的 evals/ 配置跑一遍' };
  }
}

/** 后台评测的状态 → 印章 + 说明（列表里的进度、进度弹窗的抬头都用它） */
export function runStateView(run: { status: string; code?: number | null }): { stamp: string; tone: Tone; detail: string } {
  if (run.status === 'running') {
    return { stamp: '评测中', tone: 'ready', detail: '后台正在跑，可以关掉这个窗口；进度在这儿看' };
  }
  if (run.code === 0) {
    return { stamp: '完成', tone: 'adopt', detail: '跑完了，台账已经更新（试用记录在对应能力的详情里）' };
  }
  return {
    stamp: '失败',
    tone: 'reject',
    detail: '跑完了但有失败项：看日志，或按 evals/schema.md 的判定规则决定下一步',
  };
}

/** 时长 → 「3 分 12 秒」这种一眼能读的写法（跑着的任务显示"已跑 X"，跑完显示"用了 X"） */
export function runDuration(ms?: number | null): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  if (total < 60) return `${total} 秒`;
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return sec === 0 ? `${min} 分` : `${min} 分 ${sec} 秒`;
}

/** 人评-only 试用里那句"为什么不摆证据链"的说明（按试用方式给准确的说法） */
export function noEvidenceNote(trial?: Trial | null): string {
  const { kind } = trialKindView(trial);
  if (kind === 'controlled') {
    return '这次只有人评——人评是主观判断，不摆证据链；A/B 两版产物在上面「条件」里可以直接打开。';
  }
  if (kind === 'mock') {
    return '这次只有人评——人评是主观判断，不摆证据链；产物留在仓库里，需要复核时按上面的路径打开。';
  }
  return '这次只有人评——人评是主观判断，不摆证据链；真实项目可能在别的仓库，这里只留结论。';
}

/** 客观指标 → 逐行对照（详情页用）；值是"按条件名"给的，条件数不限 */
export interface MeasureRow {
  label: string;
  values: Record<string, string>;
  note: string;
}

/** 指标表要显示哪些条件列（按条件声明顺序，缺数据的不显示） */
export function measureColumns(trial?: Trial | null): string[] {
  const seen = new Set<string>();
  for (const row of measureRows(trial)) for (const key of Object.keys(row.values)) seen.add(key);
  const declared = (trial?.conditions ?? []).map((c) => c.name).filter((name) => seen.has(name));
  const rest = [...seen].filter((name) => !declared.includes(name)).sort();
  return [...declared, ...rest];
}

export function measureRows(trial?: Trial | null): MeasureRow[] {
  const rows: MeasureRow[] = [];
  const measures = trial?.measures;
  if (!measures) return rows;

  const size = measures.sizeKB;
  const sizeEntries = size ? Object.entries(size) : [];
  if (sizeEntries.length > 0) {
    rows.push({
      label: '产物文件大小',
      values: Object.fromEntries(sizeEntries.map(([name, kb]) => [name, `${kb} KB`])),
      note: sizeNote(trial)?.replace('体积：', '') ?? '',
    });
  }

  const correctness = measures.correctness;
  const correctnessEntries = correctness ? Object.entries(correctness) : [];
  if (correctnessEntries.length > 0) {
    const word = (v: number) => (v >= 1 ? '做到了' : v > 0 ? `部分做到（${Math.round(v * 100)}%）` : '没做到');
    const same = new Set(correctnessEntries.map(([, v]) => v)).size === 1;
    rows.push({
      label: '是否做到任务要求',
      values: Object.fromEntries(correctnessEntries.map(([name, v]) => [name, word(v)])),
      note: correctnessEntries.length > 1 ? (same ? '两版一样' : '两版有差别') : '',
    });
  }

  const checks = measures.staticChecks;
  if (checks && Object.keys(checks).length > 0) {
    rows.push({ label: '静态检查（脚本、结构、断点等）', values: { ...checks }, note: '' });
  }

  // 重复跑（`--repeat N`）：一行"全过几次 / 共几次"，方差直接摆在脸上
  //（实测同一条用例两次跑，A 侧从 1/1 翻成 0/1——不写出来就会被当成"技能有效"）
  const repeats = measures.repeats;
  const repeatEntries = repeats ? Object.entries(repeats) : [];
  if (repeatEntries.length > 0) {
    const values = Object.fromEntries(repeatEntries.map(([name, v]) => [name, `${v} 次全过`]));
    const both = repeatEntries.every(([, v]) => String(v).split('/')[0] === String(v).split('/')[1]);
    rows.push({
      label: '重复跑（同一条用例跑几遍）',
      values,
      note: both ? '每次都过' : '有波动——单次结果不能当结论',
    });
  }

  // ── 成本与效率：从 2026-09 起成为默认对照维度（token / 耗时 / 轮次 / 工具调用 / 花费）──
  const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const push = (label: string, map: Record<string, number> | undefined, fmt: (v: number) => string, better: 'less' | 'more' | 'none') => {
    const entries = Object.entries(map ?? {}).filter(([, v]) => n(v) !== null) as [string, number][];
    if (entries.length === 0) return;
    rows.push({
      label,
      values: Object.fromEntries(entries.map(([name, v]) => [name, fmt(v)])),
      note: compareNote(entries, fmt, better),
    });
  };

  push('输入 token', measures.tokensIn, countTokens, 'less');
  push('输出 token', measures.tokensOut, countTokens, 'less');
  push('总 token', measures.tokensTotal, countTokens, 'less');
  push('缓存命中的 token', measures.tokensCached, countTokens, 'more');
  push('耗时（单条用例）', measures.durationSec, (v) => `${v} 秒`, 'less');
  push('交互轮次', measures.steps, (v) => `${v} 轮`, 'less');
  push('工具调用次数', measures.toolCalls, (v) => `${v} 次`, 'less');
  push('花费', measures.costUsd, (v) => `$${v}`, 'less');

  const mix = measures.toolMix;
  if (mix && Object.keys(mix).length > 0) {
    rows.push({ label: '工具调用构成', values: { ...mix }, note: '' });
  }

  // MCP：探针从 tools/list 读到的功能清单（名字 + 有没有描述/入参 schema）
  const toolList = measures.toolList;
  if (toolList && typeof toolList === 'object' && Object.keys(toolList).length > 0) {
    rows.push({ label: '功能清单（tools/list）', values: { ...(toolList as Record<string, string>) }, note: '' });
  }

  return rows;
}

/** token 数：精确到个位、带千分位（对照表里"78.5k vs 80.1k"看不出差在哪，"78,544 vs 80,375"看得出） */
const countTokens = (v: number): string => `${Math.round(v)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 两版数字对照的一句话：只说事实（谁多谁少、差多少）——"越少越省"这类判断规则统一放在标题的 tooltip 里 */
function compareNote(entries: [string, number][], fmt: (v: number) => string, _better: 'less' | 'more' | 'none'): string {
  if (entries.length !== 2) return '';
  const [[nameA, a], [nameB, b]] = entries;
  if (a === b) return `两版一样（各 ${fmt(a)}）`;
  const big = a > b ? { name: nameA, v: a } : { name: nameB, v: b };
  const small = a > b ? { name: nameB, v: b } : { name: nameA, v: a };
  const pct = small.v === 0 ? null : Math.round(((big.v - small.v) / small.v) * 100);
  const gap = pct === null ? '（一个为 0）' : `，多 ${pct}%`;
  return `${big.name} 比 ${small.name} 多${gap}`;
}

/**
 * 每个维度该怎么读（放在「客观指标（全部维度）」标题的 tooltip 里）。
 * 以前把"（越少越省）"这类话跟在每一行后面——**同一句话说十几遍**，表格反而更难扫（用户反馈）。
 */
export function measureRules(): { group: string; items: string[] }[] {
  return [
    { group: '是否做到任务要求', items: ['唯一参与判定的维度：判定只看 B 侧（带能力）的通过率。'] },
    { group: '产物文件大小', items: ['越小越轻，但别为小而牺牲正确性——两者冲突时以正确性为准。'] },
    { group: 'token（输入 / 输出 / 总）', items: ['越少越省；输出 token 也能看出啰嗦程度。'] },
    { group: '缓存命中的 token', items: ['越多说明上下文复用越好（取单轮最高值，不是累加）。'] },
    { group: '耗时', items: ['越短越利落（单条用例的墙上时间）。'] },
    { group: '交互轮次 / 工具调用次数', items: ['越少越利落，说明没在来回试探。'] },
    { group: '花费', items: ['越少越省；只有工具真报了价格才有这一行。'] },
    { group: '静态检查明细 / 功能清单', items: ['摆事实用，不参与"哪个更好"的比较。'] },
    { group: '共同前提', items: ['这些维度只用于对照，不改判定；差 5% 以内算持平。'] },
  ];
}

/** 指标备注（数据里手写的那句） */
export function measureNotes(trial?: Trial | null): string | null {
  const notes = trial?.measures?.notes;
  return typeof notes === 'string' && notes.trim() ? notes : null;
}

/* ───────────────── 试用详情的主角：A/B 前后对照 ───────────────── */

/** 详情里每侧要突出的数字，按这个优先级取前三项（没有的跳过） */
const HIGHLIGHT_LABELS = ['产物文件大小', '总 token', '耗时（单条用例）', '工具调用次数', '输出 token'];

export interface SideResult {
  name: string;
  /** 「不加载能力」/「加载了能力：ponytail」 */
  meaning: string;
  /** 这一版有没有做到任务要求；没记就是 null */
  done: boolean | null;
  doneLabel: string;
  /** 产物文件（能打开就给链接） */
  artifact: { url: string; name: string } | null;
  /** 人评选了这一版 */
  picked: boolean;
  highlights: { label: string; value: string }[];
}

/** 对照的两侧（A 不加载能力 / B 加载了能力）：结果、产物、关键数字 */
export function sideResults(trial?: Trial | null): SideResult[] {
  const conditions = trial?.conditions ?? [];
  const rows = measureRows(trial);
  const correctness = trial?.measures?.correctness ?? {};
  const picked = abView(trial).winner;
  return conditions.map((c) => {
    const score = correctness[c.name];
    const done = typeof score === 'number' ? score >= 1 : null;
    const url = artifactUrl(c);
    const highlights = HIGHLIGHT_LABELS.map((label) => rows.find((r) => r.label === label))
      .filter((r): r is MeasureRow => Boolean(r))
      .map((r) => ({ label: r.label, value: r.values[c.name] }))
      .filter((h) => Boolean(h.value))
      .slice(0, 3);
    return {
      name: c.name,
      meaning: conditionMeaning(c),
      done,
      doneLabel: done === null ? '没有记录结果' : done ? '做到了' : '没做到',
      artifact: url && c.artifact ? { url, name: c.artifact.split('/').pop() ?? c.artifact } : null,
      picked: picked === c.name,
      highlights,
    };
  });
}

/** 数值型维度 → 一句话对照（只讲事实：谁变多谁变少、差多少） */
const DIGEST_DIMS: { label: string; short: string; fmt: (v: number) => string; up: string; down: string }[] = [
  { label: '产物文件大小', short: '产物', fmt: (v) => `${v} KB`, up: '变大', down: '变小' },
  { label: '总 token', short: 'token', fmt: (v) => `${Math.round(v).toLocaleString('en-US')}`, up: '变多', down: '变少' },
  { label: '耗时（单条用例）', short: '耗时', fmt: (v) => `${v} 秒`, up: '变慢', down: '变快' },
  { label: '工具调用次数', short: '工具调用', fmt: (v) => `${v} 次`, up: '变多', down: '变少' },
];

/**
 * 「这次前后对照到底差在哪」的一句话：`A → B（变多/变少多少）`。
 * 只陈述事实，**不替人下"哪个更好"的结论**；没有可比的数字时返回 null（页面就不显示这一行）。
 */
export function compareDigest(trial?: Trial | null): string | null {
  const sides = trial?.conditions ?? [];
  if (!trial || sides.length !== 2) return null;
  const parts: string[] = [];

  const correctness = trial.measures?.correctness ?? {};
  const [a, b] = sides.map((c) => c.name);
  const passed = (name: string) => (typeof correctness[name] === 'number' ? correctness[name] >= 1 : null);
  const okA = passed(a);
  const okB = passed(b);
  if (okA !== null && okB !== null) {
    parts.push(okA && okB ? '两版都做到了任务要求' : okA ? `${a} 做到了、${b} 没做到` : okB ? `${b} 做到了、${a} 没做到` : '两版都没做到');
  }

  for (const dim of DIGEST_DIMS) {
    const rawA = rawNumber(trial, dim.label, a);
    const rawB = rawNumber(trial, dim.label, b);
    if (rawA === null || rawB === null) continue;
    if (rawA === rawB) {
      parts.push(`${dim.short} 两版一样（${dim.fmt(rawA)}）`);
      continue;
    }
    const diff = Math.abs(rawB - rawA);
    const base = Math.max(Math.abs(rawA), Math.abs(rawB));
    const flat = base > 0 && diff / base < 0.02;
    const pct = rawA === 0 ? null : Math.round((diff / Math.abs(rawA)) * 100);
    const amount = flat ? '' : pct === null ? ` ${dim.fmt(diff)}` : ` ${pct}%`;
    parts.push(`${dim.short} ${dim.fmt(rawA)} → ${dim.fmt(rawB)}（${flat ? '基本持平' : rawB > rawA ? dim.up : dim.down}${amount}）`);
    if (parts.length >= 4) break;
  }

  return parts.length ? parts.join('；') : null;
}

/** 从 measures 里按"页面标签 → 字段"取原始数字（digest 要算差值，不能拿格式化后的字符串） */
function rawNumber(trial: Trial, label: string, side: string): number | null {
  const field: Record<string, string> = {
    产物文件大小: 'sizeKB',
    '总 token': 'tokensTotal',
    '耗时（单条用例）': 'durationSec',
    工具调用次数: 'toolCalls',
  };
  const map = trial.measures?.[field[label]] as Record<string, number> | undefined;
  const v = map?.[side];
  return typeof v === 'number' ? v : null;
}

/* ───────────── 系统小结：A/B 各自好在哪 + 一句推荐 ─────────────
 * 这是**这一次对照**里"哪一版更好"的判断，和"这个能力值不值得采纳"是两件事（后者由 `decide()` 的客观通过率决定）。
 * 规则写死在下面，页面上也照原样写出来，免得看起来像凭空冒出来的意见：
 *   1. 正确性优先：一版做到、另一版没做到 → 直接推荐做到的那版；
 *   2. 两版都没做到 → 不给推荐，先修任务说明或判据；
 *   3. 两版都做到时**人评优先**——审美这类主观维度只有人能判；
 *   4. 没有（有效）人评时比成本与效率：总 token → 耗时 → 工具调用 → 产物大小，差 5% 以内算持平；
 *      两边各有胜负就如实说各有胜负，不硬挑赢家。
 */

const FLAT_RATIO = 0.05;

const SUMMARY_DIMS: { label: string; field: string; less: string; more: string; fmt: (v: number) => string }[] = [
  { label: '总 token', field: 'tokensTotal', less: '少', more: '多', fmt: (v) => `${Math.round(v).toLocaleString('en-US')} token` },
  { label: '耗时', field: 'durationSec', less: '快', more: '慢', fmt: (v) => `${v} 秒` },
  { label: '工具调用', field: 'toolCalls', less: '少', more: '多', fmt: (v) => `${v} 次` },
  { label: '产物大小', field: 'sizeKB', less: '小', more: '大', fmt: (v) => `${v} KB` },
];

export interface SystemSummary {
  /** A/B 两侧齐全、能给出小结 */
  available: boolean;
  sides: { name: string; meaning: string; pros: string[]; cons: string[] }[];
  /** 推荐结论（一句话）；给不出推荐时为 null */
  recommendation: string | null;
  /** 推荐的是哪一侧（条件名，通常是 A / B）；不推荐时为 null */
  recommendedSide: string | null;
  /** 依据（规则速记），页面照原样显示 */
  rationale: string;
}

export function systemSummary(trial?: Trial | null): SystemSummary {
  const conditions = trial?.conditions ?? [];
  if (!trial || conditions.length !== 2) {
    return { available: false, sides: [], recommendation: null, recommendedSide: null, rationale: '' };
  }
  const [a, b] = conditions.map((c) => c.name);
  const correctness = trial.measures?.correctness ?? {};
  const okA = typeof correctness[a] === 'number' ? correctness[a] >= 1 : null;
  const okB = typeof correctness[b] === 'number' ? correctness[b] >= 1 : null;
  const better = trial.humanReview?.better;
  const picked = better === a || better === b ? better : null;

  const pros: Record<string, string[]> = { [a]: [], [b]: [] };
  const cons: Record<string, string[]> = { [a]: [], [b]: [] };

  if (okA !== null && okB !== null) {
    if (okA && okB) {
      pros[a].push('做到了任务要求');
      pros[b].push('做到了任务要求');
    } else if (okA) {
      pros[a].push('做到了任务要求');
      cons[b].push('没做到任务要求');
    } else if (okB) {
      pros[b].push('做到了任务要求');
      cons[a].push('没做到任务要求');
    } else {
      cons[a].push('没做到任务要求');
      cons[b].push('没做到任务要求');
    }
  }

  // 成本与效率：谁明显更省/更快/更小（只有超过阈值的维度才算数）
  const wins: Record<string, string[]> = { [a]: [], [b]: [] };
  for (const dim of SUMMARY_DIMS) {
    const map = trial.measures?.[dim.field] as Record<string, number> | undefined;
    const va = map?.[a];
    const vb = map?.[b];
    if (typeof va !== 'number' || typeof vb !== 'number' || va === vb) continue;
    const base = Math.max(Math.abs(va), Math.abs(vb));
    if (base === 0) continue;
    const diff = Math.abs(vb - va);
    if (diff / base < FLAT_RATIO) continue;
    const winner = vb < va ? b : a;
    const loser = winner === a ? b : a;
    const winnerValue = winner === a ? va : vb;
    // 百分比以**另一侧**为基数（A=100k、B=60k → "B 少 40%"），跟人的直觉一致；用较小值当基数会变成"少 67%"
    const baseValue = winner === a ? vb : va;
    const pct = baseValue === 0 ? null : Math.round((diff / baseValue) * 100);
    const pctText = pct === null ? '' : ` ${pct}%`;
    const phrase = `${dim.label} ${dim.less}${pctText}（${dim.fmt(winnerValue)}）`;
    pros[winner].push(phrase);
    cons[loser].push(`${dim.label} ${dim.more}${pctText}`);
    wins[winner].push(dim.label);
  }

  const sides = conditions.map((c) => ({
    name: c.name,
    meaning: conditionMeaning(c),
    pros: pros[c.name].slice(0, 3),
    cons: cons[c.name].slice(0, 2),
  }));

  let recommendedSide: string | null = null;
  let recommendation: string;
  if (okA !== null && okB !== null && okA !== okB) {
    recommendedSide = okA ? a : b;
    recommendation = `推荐 ${recommendedSide}：只有它做到了任务要求。`;
  } else if (okA === false && okB === false) {
    recommendation = '两版都没做到任务要求——先改任务说明或判据；这次不推荐哪一版。';
  } else if (picked) {
    recommendedSide = picked;
    recommendation = `推荐 ${recommendedSide}：人评选了这一版（主观维度以人评为准）。`;
  } else if (wins[a].length === 0 && wins[b].length === 0) {
    recommendation = '两版差不多：能比的维度差距都在 5% 以内，按你自己的偏好选。';
  } else if (wins[a].length > 0 && wins[b].length > 0) {
    // 各有胜负：如实说，别硬挑一个赢家
    recommendation = `两版各有胜负：${a} 在 ${wins[a].join('、')} 上更好，${b} 在 ${wins[b].join('、')} 上更好——按你更看重哪一项来选。`;
  } else {
    recommendedSide = wins[a].length > 0 ? a : b;
    recommendation = `推荐 ${recommendedSide}：两版都做到了任务要求，它在 ${wins[recommendedSide].join('、')} 上更省。`;
  }

  const rationale =
    [
      '依据：正确性优先（一版做到、另一版没做到，就选做到的那版）',
      '两版都达标时人评优先——审美这类主观维度只有人能判',
      '没有人评就比成本与效率（总 token → 耗时 → 工具调用 → 产物大小，差 5% 以内算持平）',
      '这里判的只是这次对照里哪一版更好，「值不值得采纳」另由客观通过率决定',
    ].join('；') + '。';

  return { available: true, sides, recommendation, recommendedSide, rationale };
}

/** 试用标题：日期 + 任务 + 模型 */
export function trialTitle(trial: Trial): string {
  const parts = [trial.date ?? '日期未知'];
  if (trial.task?.id) parts.push(`任务 ${trial.task.id}`);
  if (trial.model) parts.push(trial.model);
  return parts.join(' · ');
}

/** 试用的日期（列表行用） */
export function trialDate(trial?: Trial | null): string {
  return trial?.date ?? '日期未知';
}

/** 试用跑的是哪个任务（列表行用） */
export function trialTask(trial: Trial): string {
  return trial.task?.id ?? trial.trialId;
}

/** 证据文件 → 这是什么（一句话，界面只显示这个 + 文件名） */
export function describeEvidence(relPath: string): { name: string; kind: string } {
  const name = relPath.split('/').pop() ?? relPath;
  const rules: { test: RegExp; kind: string }[] = [
    // 先认判定记录：这几个文件是"结论怎么算出来的"，别被 .json / .md / .html 的通用说法盖过去
    { test: /(^|\/)result\.json$/i, kind: '逐条用例结果' },
    { test: /(^|\/)benchmark\.json$/i, kind: '对照摘要（数据）' },
    { test: /(^|\/)benchmark\.md$/i, kind: '对照摘要（可读版）' },
    { test: /(^|\/)report\.html$/i, kind: '完整报告' },
    // 这一条要在 A/B 之前：技能自带的文件也在 B 侧工作区里
    { test: /\/\.claude\/skills\//i, kind: '技能自带文件' },
    { test: /EVIDENCE\.md$/i, kind: '试用笔记' },
    { test: /SCORING\.md$/i, kind: '打分标准' },
    // A / B 由分组表达，这里只说"这是个什么文件"，免得每行都重复一遍"A 版产物"
    { test: /\.html$/i, kind: '页面产物' },
    { test: /\.(tsx|ts|mjs|js|jsx)$/i, kind: '实现代码' },
    { test: /\.(sh|bash)$/i, kind: '判分脚本' },
    { test: /\.(yaml|yml)$/i, kind: '用例配置' },
    { test: /\.md$/i, kind: '说明文档' },
    { test: /\.json$/i, kind: '数据文件' },
    { test: /\.txt$/i, kind: '文本文件' },
    { test: /\.(png|jpe?g|webp|gif)$/i, kind: '截图' },
  ];
  const hit = rules.find((rule) => rule.test.test(relPath));
  return { name, kind: hit?.kind ?? '证据文件' };
}

/** 仓库内相对路径 → 页面可打开的地址（dev 与 preview 都由 /evidence 提供） */
export function evidenceUrl(relPath: string): string {
  return `./evidence/${relPath.split('/').map((seg) => encodeURIComponent(seg)).join('/')}`;
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'ico', 'svg']);
const TEXT_EXT = new Set([
  'md', 'markdown', 'txt', 'text', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'lock',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'mjs', 'cjs', 'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java',
  'c', 'h', 'cpp', 'cs', 'php', 'sql', 'r', 'lua', 'kt', 'swift',
  'css', 'scss', 'less', 'html', 'htm', 'xml', 'csv', 'tsv', 'log', 'diff', 'patch', 'map', 'gitignore',
]);

/**
 * 证据文件"能不能当文本读"→ 决定右侧是代码块、图片预览还是只能外开。
 * 认不出的扩展名按 `other` 处理（宁可让人点「新窗口打开」，也不要摆一屏乱码）。
 */
export function evidenceBodyKind(relPath: string): 'text' | 'image' | 'other' {
  const name = relPath.split('/').pop() ?? relPath;
  const ext = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (TEXT_EXT.has(ext)) return 'text';
  return 'other';
}

export interface EvidenceView {
  path: string;
  name: string;
  kind: string;
  url: string;
}

export function evidenceList(trial?: Trial | null): EvidenceView[] {
  return (trial?.evidence ?? []).map((path) => ({ path, ...describeEvidence(path), url: evidenceUrl(path) }));
}

/* ───────────────── 证据分组：先把"这条是 A 的还是 B 的"说清楚 ─────────────────
 * 一次跑下来十几个文件，平铺在一起看不出哪个属于哪一边，更看不出"这些文件怎么就能证明结论"。
 * 所以按**它证明什么**分四组：A 侧产物、B 侧产物、判定记录（工具报告）、其它留档。
 * 分组只认路径特征——skill-up 的产物路径长这样：
 *   <技能>-workspace/iteration-6/wc-cli/without_skill/outputs/workspace/wc.mjs   ← A
 *   <技能>-workspace/iteration-6/wc-cli/with_skill/outputs/workspace/wc.mjs      ← B
 *   <技能>-workspace/iteration-6/{result.json,benchmark.md,report.html}          ← 判定记录
 */

export type EvidenceGroupKey = 'A' | 'B' | 'record' | 'skill' | 'other';

export interface EvidenceGroup {
  key: EvidenceGroupKey;
  title: string;
  /** 这组是什么、能证明什么（一句话） */
  hint: string;
  items: EvidenceView[];
}

/** 判定记录：工具写的"逐条用例过没过"，结论就是按它算的 */
const RECORD_FILES = /(^|\/)(result\.json|benchmark\.(json|md)|report\.html|result\.md)$/i;

export function evidenceGroupOf(relPath: string): EvidenceGroupKey {
  // B 侧工作区里那份"技能自己"（`.claude/skills/<名字>/…`）不算这次跑的产物：它跟着技能一起进去，
  // 一次能占十几个文件——不挑出来，真正要看的产物就被淹了
  if (/\/\.claude\/skills\//i.test(relPath)) return 'skill';
  if (/\/without_skill\//i.test(relPath)) return 'A';
  if (/\/with_skill\//i.test(relPath)) return 'B';
  // 早期手工 mock 试用的产物是 version-a/ 、version-b/ 这种目录（或 version-a.html 这种文件名）
  if (/(^|\/)version-a([./]|$)/i.test(relPath)) return 'A';
  if (/(^|\/)version-b([./]|$)/i.test(relPath)) return 'B';
  if (RECORD_FILES.test(relPath)) return 'record';
  return 'other';
}

const GROUP_TITLE: Record<EvidenceGroupKey, string> = {
  A: 'A 版产物（不加载能力）',
  B: 'B 版产物（加载能力）',
  record: '判定记录（工具报告）',
  skill: '随技能一起进去的文件',
  other: '其它留档',
};

const GROUP_HINT: Record<EvidenceGroupKey, string> = {
  A: '同一个任务、不加载技能这一版留下的东西',
  B: '同一个任务、加载了技能这一版留下的东西',
  record: '工具逐条跑用例的结果：哪条过、哪条没过、为什么——结论就是按它算的',
  skill: 'B 侧工作区里那份技能目录本身（SKILL.md、许可、自带脚本…）：它本来就会跟着技能一起进去，不是这次跑出来的东西',
  other: '不属于上面几类的留档（笔记、素材等）',
};

/** 证据 → 分组（组内保持原顺序；空组不返回。顺序 = 读者该看的顺序，噪音放最后） */
export function evidenceGroups(trial?: Trial | null): EvidenceGroup[] {
  const buckets: Record<EvidenceGroupKey, EvidenceView[]> = { A: [], B: [], record: [], skill: [], other: [] };
  for (const item of evidenceList(trial)) buckets[evidenceGroupOf(item.path)].push(item);
  return (['A', 'B', 'record', 'skill', 'other'] as EvidenceGroupKey[])
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, title: GROUP_TITLE[key], hint: GROUP_HINT[key], items: buckets[key] }));
}

/**
 * 一句话说清"这些证据怎么证明的"——不同试用方式证明链条不一样，别用同一套说法：
 * 受控对比是"同一任务跑两遍、用同一套用例判"，模拟场景是"固定任务与输入"，真实使用是"人用过"。
 */
export function evidenceProofNote(trial?: Trial | null): string {
  const { kind } = trialKindView(trial);
  if (kind === 'mock' && trial?.probeOnly) {
    return '怎么证明的：协议探针按 MCP 规范走了一遍（起服务 → 握手 → 列工具 → 样例调用），通过就说明这个 server 能用。';
  }
  if (kind === 'controlled') {
    return '怎么证明的：同一个任务跑两遍——一遍不给技能（A）、一遍加载技能（B）；两边都用同一套用例与检查脚本判，逐条结果写在工具报告里，A / B 的产物可以直接打开对照。';
  }
  if (kind === 'mock') {
    return '怎么证明的：任务与输入都固定在仓库里，同一套检查脚本判过没过；A / B 两版产物直接对照。';
  }
  return '怎么证明的：真实项目里的使用记录——项目可能不在本仓库，这里通常只有结论与笔记。';
}

/** 条件产物 → 可打开的地址 */
export function artifactUrl(condition: TrialCondition): string | null {
  return condition.artifact ? evidenceUrl(condition.artifact) : null;
}
