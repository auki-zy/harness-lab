/**
 * 各种评测工具共用的记账逻辑：找能力 → 校验标签 → 下结论 → 写 trial → 聚合。
 * 评测本身由外部工具跑（skill-up / promptfoo / MCP 探针…），这里只负责"落账"。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const P = (...p) => path.join(root, ...p);
export const CAPS = P('evals', 'capabilities.json');
export const TAGS = P('evals', 'tags.json');
export const TRIALS = P('evals', 'trials');

/**
 * 诊断信息一律走 **stderr**：**stdout 是载荷通道**。
 *
 * 踩过的坑（2026-09-11）：draft-prompt 端点把子进程的 stdout 整段当成"生成的提示词"，
 * 而 log() 当时写的是 stdout —— 于是 `ℹ 这份 SKILL.md 是转发壳，内容取自它引用的 grilling…`
 * 这句话被当成提示词灌进了页面的输入框，用户一提交，**A 侧直接读到评测内部设定**，那次 A/B 就废了。
 * 页面上显示日志的地方（`runScriptSync` / `runScriptAsync`）是 stdout + stderr 合并的，不受影响。
 */
export const log = (m) => console.error(m);
export const fail = (m) => {
  console.error(m);
  process.exit(1);
};
/** 读 JSON：手工编辑过的文件常带 UTF-8 BOM（Windows 记事本 / PowerShell），先剥掉再解析 */
export const readJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
export const writeJson = (f, v) => writeFileSync(f, JSON.stringify(v, null, 2) + '\n', 'utf8');
export const rel = (p) => path.relative(root, p).replace(/\\/g, '/');

/** 类型 → 目录名（注意 mcp 目录是单数，跟 candidates/mcp 的既有约定一致） */
export const TYPE_DIRS = { skill: 'skills', agent: 'agents', mcp: 'mcp' };

export function findCapability(name, type) {
  const types = type ? [TYPE_DIRS[type]] : Object.values(TYPE_DIRS);
  for (const pool of ['candidates', 'adopted']) {
    for (const t of types) {
      const dir = P(pool, t, name);
      if (existsSync(dir)) return { dir, pool, type: t };
    }
  }
  return null;
}

export function registeredPurposes() {
  return Object.keys(readJson(TAGS).dimensions?.purpose?.values ?? {});
}

/**
 * 能力自带的"一句话说明"：取它自己的描述字段，而不是由评测过程归纳。
 *   技能 → SKILL.md 的 `description:`；子代理 → AGENT.md 的 `description:`；MCP → server.json 的 `description`
 */
export function sourceDescription(dir) {
  const found = locateDescription(dir);
  return found?.text ?? null;
}

/** 上面那句取自哪个文件（写给台账的「说明来源」；第三方那句的中文译文由人补，所以这里只说"原文未翻译"） */
export function sourceDescriptionLabel(dir) {
  const found = locateDescription(dir);
  if (!found) return null;
  return found.file === 'server.json'
    ? '取自本仓库 server.json 的 description（原文照抄）'
    : found.file === 'AGENT.md'
      ? '取自本仓库 AGENT.md 的 description（原文照抄）'
      : '取自 SKILL.md 的 description（上游原文，未翻译）';
}

function locateDescription(dir) {
  if (!dir || !existsSync(dir)) return null;
  for (const file of ['SKILL.md', 'AGENT.md']) {
    const p = path.join(dir, file);
    const text = existsSync(p) ? frontmatterValue(readFileSync(p, 'utf8'), 'description') : null;
    if (text) return { file, text };
  }
  const serverJson = path.join(dir, 'server.json');
  if (existsSync(serverJson)) {
    const text = readJson(serverJson).description;
    if (typeof text === 'string' && text.trim()) return { file: 'server.json', text: text.trim() };
  }
  return null;
}

/** 只认文件开头的 `---` frontmatter；`key: >` 折叠写法会把后续缩进行拼成一行 */
function frontmatterValue(text, key) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  const block = lines.slice(1, end === -1 ? lines.length : end);
  const start = block.findIndex((l) => l.startsWith(`${key}:`));
  if (start === -1) return null;
  const inline = block[start].slice(key.length + 1).trim();
  if (inline && !/^[>|][-+]?$/.test(inline)) {
    return inline.replace(/^["']|["']$/g, '').trim();
  }
  const rest = [];
  for (const line of block.slice(start + 1)) {
    if (line.trim() && !/^\s/.test(line)) break;
    rest.push(line.trim());
  }
  const folded = rest.join(' ').replace(/\s+/g, ' ').trim();
  return folded || null;
}

/**
 * 上游来源：读能力目录里的 `SOURCE.json`（`skillup-bridge prepare` 拉技能时写的）。
 * 拿不到就返回空对象——**不许猜**：来源写错比空着更糟。
 */
function readUpstreamSource(localPath) {
  if (!localPath) return {};
  const file = path.join(root, localPath, 'SOURCE.json');
  if (!existsSync(file)) return {};
  try {
    const src = readJson(file);
    const out = {};
    for (const key of ['repo', 'path', 'license', 'commit']) if (src[key]) out[key] = src[key];
    return out;
  } catch {
    return {};
  }
}

/**
 * 能力登记：不在册就建（必须给已登记的用途标签），在册就补充说明/来源/证据与结论。
 * `decision: 'retry'` 表示"这次评测没跑起来"——**那不是对能力的结论**，所以既不改 summary 也不追加
 * priorEvidence（曾经在这里踩过：环境缺引擎的一次 retry 把能力级结论覆盖成了"暂不采纳：这次评测本身报错了"）。
 */
export function upsertCapability({
  id,
  type,
  localPath,
  purpose,
  description,
  descriptionSource,
  autoDescription,
  autoDescriptionSource,
  summary,
  evidenceLine,
  stage,
  decision,
}) {
  const doc = readJson(CAPS);
  if (!Array.isArray(doc.capabilities)) fail('evals/capabilities.json 结构不对：capabilities 应该是数组');
  let cap = doc.capabilities.find((c) => c.id === id);
  if (!cap) {
    const purposes = registeredPurposes();
    if (!purpose || !purposes.includes(purpose)) {
      fail(`能力 ${id} 不在册；登记时需要 --purpose <已登记用途> 之一：${purposes.join(', ')}`);
    }
    cap = {
      id,
      type,
      // 来源从能力目录里的 SOURCE.json 自动取（`skillup-bridge prepare` 拉的技能都写了它）
      source: readUpstreamSource(localPath),
      localPath,
      status: 'trialing',
      priorEvidence: '',
      addedAt: new Date().toISOString().slice(0, 10),
      tags: { type, purpose: [purpose], stage: 'trialing', source: 'community' },
      description: description ?? '',
      descriptionSource: descriptionSource ?? '',
      summary: '',
      howToUse: type === 'skill' ? `harness-tool add ${id}` : '',
    };
    doc.capabilities.push(cap);
  }
  const conclusive = decision !== 'retry';
  if (conclusive && summary) cap.summary = summary;
  // 说明：人给的直接写；从能力自身描述字段自动取来的**只用来兜底**（不覆盖已经写好的译文）
  if (description) {
    cap.description = description;
    if (descriptionSource) cap.descriptionSource = descriptionSource;
  } else if (autoDescription && !cap.description) {
    cap.description = autoDescription;
    cap.descriptionSource = autoDescriptionSource ?? '取自能力自身的描述字段（原文）';
  }
  if (conclusive && evidenceLine) cap.priorEvidence = cap.priorEvidence ? `${cap.priorEvidence} ｜ ${evidenceLine}` : evidenceLine;
  // 能力级状态跟着结论走（页面上的印章读的就是它，只改 tags.stage 会让数据和页面说法不一致）
  if (decision === 'adopt') {
    // 机器不再直接给 adopt（decide() 现在给 `ready`）；这里保留分支是为了兼容历史数据与人工写回的记录
    cap.status = 'adopted';
    cap.tags = { ...cap.tags, stage: 'adopted' };
  } else if (decision === 'ready') {
    // 机器判定达标 ≠ 采纳：状态停在 trialing，等人在能力详情里给结论
    if (cap.status === 'candidate') cap.status = 'trialing';
    cap.tags = { ...cap.tags, stage: 'trialing' };
  } else if (decision === 'reject') {
    cap.status = 'rejected';
    cap.tags = { ...cap.tags, stage: 'rejected' };
  } else if (decision === 'hold' && cap.status !== 'adopted') {
    cap.status = 'trialing';
    cap.tags = { ...cap.tags, stage: 'trialing' };
  } else if (decision === 'available' || decision === 'unavailable') {
    // 可用性检查的结论不改生命周期状态：MCP 不走采纳流程，印章读的是"最近一次可用性检查"的结果。
    // stage 保持在 candidate / trialing（它反映"还没采纳"，不是"用不了"）。
    if (cap.status !== 'adopted') cap.status = cap.status === 'candidate' ? 'trialing' : cap.status;
  } else if (stage) {
    cap.tags = { ...cap.tags, stage };
  }
  doc.updatedAt = new Date().toISOString().slice(0, 10);
  writeJson(CAPS, doc);
  return cap;
}

/**
 * 能力级"一句话结论"的文案：adopt / hold / available / unavailable 由各能力类型自己说，
 * reject 直接用判定理由，**retry 返回 undefined**（这次评测没跑起来，对能力没有结论可写）。
 * `available` / `unavailable` 是 MCP 可用性检查的两档结果（能不能用），和采纳与否不是一回事。
 */
export function conclusionSummary(decision, reason, texts) {
  if (decision === 'adopt') return texts.adopt;
  if (decision === 'ready') return texts.ready ?? `机器判定达标${reason ? `（${reason}）` : ''}——采纳与否等你给结论。`;
  if (decision === 'available') return texts.available;
  if (decision === 'unavailable') return texts.unavailable ?? `不可用：${reason}`;
  if (decision === 'hold') return texts.hold;
  if (decision === 'reject') return `暂不采纳：${reason}`;
  return undefined;
}

/**
 * **人的结论**：采纳 / 不采纳某个能力。这是 adopted / rejected 的唯一入口
 * （机器跑到"证据够了"只会给 `ready`，不再自动采纳——"值不值得装进项目"是人的判断）。
 * 写 `humanDecision` 并同步 status / tags.stage，然后重新聚合。
 */
export function applyHumanDecision({ id, verdict, reason = '' }) {
  if (verdict !== 'adopt' && verdict !== 'reject') fail(`人的结论只能是 adopt / reject，收到：${verdict}`);
  const doc = readJson(CAPS);
  const cap = doc.capabilities.find((c) => c.id === id);
  if (!cap) fail(`不在册的能力：${id}`);
  cap.status = verdict === 'adopt' ? 'adopted' : 'rejected';
  cap.tags = { ...cap.tags, stage: cap.status };
  cap.humanDecision = {
    verdict,
    reason: String(reason ?? '').slice(0, 300),
    reviewedAt: new Date().toISOString().slice(0, 10),
  };
  // 人给了结论之后，能力级那句话也要跟着改说法（别留着"等你看"的机器话）
  cap.summary =
    verdict === 'adopt'
      ? `值得用：你自己确认采纳了${cap.humanDecision.reason ? `——${cap.humanDecision.reason}` : '。'}`
      : `不采纳：你自己给的结论${cap.humanDecision.reason ? `——${cap.humanDecision.reason}` : '。'}`;
  doc.updatedAt = new Date().toISOString().slice(0, 10);
  writeJson(CAPS, doc);
  aggregate();
  return cap;
}

/**
 * 该能力此前有多少次"可复核试用且 B 达标"。
 * 两类记录不算：
 *   - `selfCheck`：stub 引擎 / 夹具跑出来的离线自检（验证链路，不验证能力）；
 *   - `probeOnly`：只做了可用性检查（MCP 协议探针）——它能证明"能用"，证明不了"值得装"。
 * 拿它们去凑"连续两次通过"等于用假数据 / 冒烟测试换采纳。
 */
export function previousPasses(name) {
  if (!existsSync(TRIALS)) return 0;
  return readdirSync(TRIALS)
    .filter((f) => f.endsWith('.json') && f.includes(name))
    .map((f) => readJson(path.join(TRIALS, f)))
    .filter(
      (t) =>
        !t.selfCheck &&
        !t.probeOnly &&
        ['controlled', 'mock'].includes(t.kind ?? 'controlled') &&
        (t.measures?.correctness?.B ?? 0) >= 1,
    ).length;
}

/**
 * 判定规则（各处统一，别各写一套）：
 * - 评测工具本身报错（没跑起来）→ retry（别把工具的锅算到能力头上）
 * - B（带能力）没全过 → reject；B 结果缺失 → retry
 * - **重复跑里 B 只过了一部分 → retry（"不稳定"，不是能力不行也不是达标）**（2026-09-15 加）
 * - 离线自检（stub 引擎 / 夹具）→ hold，且**不**参与"连续两次"计数
 * - B 全过且此前已有 ≥1 次真实通过 → adopt（现在是 ready）；否则 hold
 *
 * `runs` / `perfectRuns` 是重复跑（`--repeat N`）带来的：结论里要写清"B 在几次里过了几次"，
 * 单次运行不再是默认口径——实测同一条用例两次跑，A 侧结果会翻转（1/1 → 0/1）。
 */
export function decide({
  passRateB,
  totalB,
  name,
  extra,
  errorsB = 0,
  errorNote,
  selfCheck = false,
  probeOnly = false,
  runs = 1,
  perfectRunsB,
  perfectRunsA,
}) {
  const because = errorNote ? `：${errorNote}` : '';
  const repeated = runs > 1;
  const perfectB = perfectRunsB ?? (passRateB >= 1 ? runs : 0);
  const evidence = repeated ? `（${runs} 次重复里 B 全过 ${perfectB}/${runs}${perfectRunsA !== undefined ? `、A 全过 ${perfectRunsA}/${runs}` : ''}）` : '';
  /**
   * 区分度提示（2026-09-15 加）：B 全过固然"达标"，但**对照 A 也全过**时，这条题说明不了技能有用
   * ——react-best-practices 三次重复就是 B 3/3、A 3/3。这不是"能力不行"，是**题不行**。
   * 口径：只提示、不改判定（达标依旧是达标），但必须让人看见"该换题了"。
   */
  const discrimination =
    perfectRunsA === undefined
      ? ''
      : perfectRunsA === runs
        ? repeated
          ? `；但对照 A 也 ${runs}/${runs} 全过——**这条题分不出技能的作用**，要证明它有用得换一条能区分 A/B 的用例`
          : '；不过对照 A 这次也过了——这条题可能分不出技能的作用（重复跑几次再看）'
        : repeated
          ? `；对照 A 只全过 ${perfectRunsA}/${runs}，两边有区别`
          : '';
  if (!totalB) {
    return { decision: 'retry', confidence: 'low', reason: `报告里没有"带能力"的结果${because}——先确认评测真的跑了` };
  }
  if (errorsB >= totalB) {
    return {
      decision: 'retry',
      confidence: 'low',
      reason: `这次评测本身报错了（不是能力没做到）${because}——先修配置或环境再跑；这一次不算对能力的结论`,
    };
  }
  if (repeated && perfectB < runs && perfectB > 0) {
    return {
      decision: 'retry',
      confidence: 'low',
      reason: `重复跑不稳定${evidence}——B 在 ${runs} 次里只全过了 ${perfectB} 次，这既不能算达标也不能算能力不行；先看是不是用例/环境有抖动（比如两侧都会偶发跑偏），重复次数加上去再下结论`,
    };
  }
  if (passRateB < 1) {
    return {
      decision: 'reject',
      confidence: 'medium',
      reason: `带能力的这次没全过（${Math.round(passRateB * 100)}%）${evidence}——没把任务做对`,
    };
  }
  const prev = previousPasses(name);
  if (prev >= 1 && !selfCheck && !probeOnly) {
    // **机器只给建议，采纳由人拍板**（2026-09-11 改）：跑到这一步说明客观证据已经够了，
    // 但"值不值得装进项目"是人的判断（团队的规范、维护成本、和自己的习惯合不合），
    // 所以这一档叫 `ready`（达标·待你定），能力状态仍是 trialing：
    // 只有人在能力详情里点了「采纳」才会变 adopted（`applyHumanDecision()`）。
    return {
      decision: 'ready',
      // 重复跑全过 → 证据更硬；单次运行仍旧只是"中等"
      confidence: repeated && perfectB === runs ? 'high' : 'medium',
      reason: `机器判定达标${evidence}：可复核试用已通过 ${prev + 1} 次、无退步${extra ? `；${extra}` : ''}${discrimination}——采纳与否由你定（在能力详情里给结论）`,
    };
  }
  if (probeOnly) {
    // MCP 这类"只做可用性检查"的记录：结论就是**可用 / 不可用**，不是采纳与否的挂起
    if (passRateB >= 1) {
      return {
        decision: 'available',
        confidence: 'high',
        reason: `可用性检查通过${extra ? `（${extra}）` : ''}：协议层没问题（起得来、握手、列得出工具、样例调用有结果）。这一档只看"能不能用"，不判"值不值得装进项目"。`,
      };
    }
    return {
      decision: 'unavailable',
      confidence: 'high',
      reason: `可用性检查没通过（${Math.round(passRateB * 100)}% 的检查项过了）${extra ? `：${extra}` : ''}——协议层就有问题，先修好再用；这不是"值不值得装"的判断，而是"现在用不了"。`,
    };
  }
  if (selfCheck) {
    return {
      decision: 'hold',
      confidence: 'low',
      reason: `带能力这一次全过${evidence}${extra ? `（${extra}）` : ''}；但这是离线自检（stub 引擎 / 夹具，脚本扮演 agent），只证明评测链路通、不证明能力有效——不算采纳计数，要用真实引擎再跑一次`,
    };
  }
  return {
    decision: 'hold',
    confidence: 'medium',
    reason:
      `带能力这一次全过${evidence}${extra ? `（${extra}）` : ''}${discrimination}；` +
      (repeated
        ? `重复 ${runs} 次都对上了，但这是第一次可复核试用——再来一次（换一条用例更值）就能采纳`
        : '按规则只有 1 次可复核试用，再跑一次且全过即可采纳——换一条用例更值（新场景的证明力比同一条重跑强）'),
  };
}

/** 重新聚合：页面只读 `evals/results/app-data.json`，所以写完数据都要跑一次 */
export function aggregate() {
  execFileSync(process.execPath, [P('tools', 'aggregate.mjs')], { stdio: 'inherit' });
}

export function writeTrial(trial) {
  mkdirSync(TRIALS, { recursive: true });
  const file = path.join(TRIALS, `${trial.trialId}.json`);
  writeJson(file, trial);
  log(`✔ 已写试用记录：${rel(file)}`);
  aggregate();
  return file;
}

/**
 * trial 文件名：`<日期>-<能力>-<工具>`；同一天对同一能力再跑一次会加 `-2`、`-3`……
 * （不覆盖：每次运行都是一条独立记录，"连续两次通过"才是采纳依据）
 */
export function trialId(name, tool) {
  const base = `${new Date().toISOString().slice(0, 10)}-${name}-${tool}`;
  if (!existsSync(path.join(TRIALS, `${base}.json`))) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!existsSync(path.join(TRIALS, `${candidate}.json`))) return candidate;
  }
}
