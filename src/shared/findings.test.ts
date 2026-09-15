import { describe, expect, it } from 'vitest';
import type { Capability, Trial } from './types';
import {
  abView,
  artifactUrl,
  capabilityConclusion,
  capabilityDecisionView,
  capabilityDescription,
  capabilityReasonTitle,
  conditionLabel,
  conditionMeaning,
  decisionView,
  describeEvidence,
  evidenceGroups,
  evidenceList,
  evidenceProofNote,
  evidenceUrl,
  humanDecisionView,
  humanReviewGlyph,
  humanSummary,
  runDuration,
  runKindView,
  runStateView,
  trialDateShort,
  hasEvidenceChain,
  humanReviewLine,
  humanReviewView,
  judgeText,
  measureColumns,
  measureNotes,
  compareDigest,
  measureRows,
  measureRules,
  noEvidenceNote,
  sideResults,
  systemSummary,
  statusView,
  trialKindView,
  trialTitle,
} from './findings';

const trial: Trial = {
  trialId: '2026-09-10-frontend-design',
  capability: { id: 'frontend-design' },
  task: { id: 'page-card', description: '同一个成员卡片页任务，跑两遍' },
  conditions: [
    { name: 'A', withCapability: false, artifact: 'candidates/skills/frontend-design/benchmarks/tasks/page-card/version-a.html' },
    { name: 'B', withCapability: true, artifact: 'candidates/skills/frontend-design/benchmarks/tasks/page-card/version-b.html' },
  ],
  measures: {
    sizeKB: { A: 12.2, B: 14.6 },
    correctness: { A: 1, B: 1 },
    staticChecks: { A: '0 外链', B: '5 断点' },
    notes: '两版都能用；差别在设计主张',
  },
  judge: ['human'],
  humanReview: { mode: 'quick', better: 'B', verdict: 'up', reason: 'B 更像有意设计', scores: null },
  verdict: { decision: 'hold', confidence: 'medium', reason: '受控对比通过，但还没在真实项目用过' },
  evidence: ['candidates/skills/frontend-design/EVIDENCE.md', 'candidates/skills/frontend-design/benchmarks/tasks/page-card/version-a.html'],
  date: '2026-09-10',
};

const cap: Capability = { id: 'frontend-design', status: 'trialing', summary: '值得用：界面更像有意设计。', trials: [trial], latestTrial: trial };

describe('结论文案（脱离上下文也能读懂）', () => {
  it('decisionView / statusView 用人话表达', () => {
    expect(decisionView('adopt').stamp).toBe('采纳');
    expect(decisionView('hold').headline).toContain('先挂着');
    expect(decisionView('hold').detail).toContain('还没在真实项目里用过');
    expect(decisionView('rejected').detail).toContain('没看到收益');
    expect(decisionView(undefined).stamp).toBe('未评估');
    expect(statusView('trialing').label).toBe('试用中');
    expect(statusView('trialing').detail).toContain('收集证据');
    expect(statusView('mystery').label).toBe('mystery');
  });

  it('capabilityDescription / capabilityConclusion / capabilityReasonTitle 各司其职', () => {
    const withBoth: Capability = { ...cap, description: '做界面时的视觉方向与排版主张。' };
    expect(capabilityDescription(withBoth)).toBe('做界面时的视觉方向与排版主张。');
    expect(capabilityConclusion(withBoth)).toBe(withBoth.summary);
    expect(capabilityDescription({ ...cap, description: null })).toContain('还没有写一句话说明');
    // 结论的兜底顺序：summary → 最近一次试用的结论依据 → 印章的通用解释
    expect(capabilityConclusion({ ...cap, summary: null })).toContain('受控对比通过');
    expect(capabilityConclusion({ ...cap, summary: null, latestTrial: null, trials: [] })).toContain('还没有结论');

    expect(capabilityReasonTitle({ ...cap, status: 'adopted' })).toBe('采纳原因');
    expect(capabilityReasonTitle({ ...cap, status: 'rejected' })).toBe('放弃原因');
    expect(capabilityReasonTitle({ ...cap, status: 'trialing' })).toBe('判定依据');
  });

  it('能力级结论来自能力状态，而不是某一次试用的结论', () => {
    expect(capabilityDecisionView({ ...cap, status: 'adopted' }).stamp).toBe('采纳');
    expect(capabilityDecisionView({ ...cap, status: 'rejected' }).stamp).toBe('放弃');
    // 还在试用中时，退回最近一次试用的结论（这里 latestTrial 的 decision 是 hold）
    expect(capabilityDecisionView({ ...cap, status: 'trialing', latestTrial: { ...trial, verdict: { decision: 'hold' } } }).stamp).toBe('挂起');
  });

  it('conditionMeaning 说清 A / B 分别代表什么', () => {
    expect(conditionMeaning({ name: 'A', withCapability: false })).toBe('A：不加载这个能力');
    expect(conditionMeaning({ name: 'B', withCapability: true })).toBe('B：加载了这个能力');
  });
});

describe('A/B 对照与人评', () => {
  it('abView 给出人评选了哪版；没人评/没选时如实说明', () => {
    const view = abView(trial);
    expect(view.winner).toBe('B');
    expect(view.winnerText).toBe('人评选了 B');

    const noReview = abView({ ...trial, humanReview: null });
    expect(noReview.winner).toBeNull();
    expect(noReview.winnerText).toBe('还没有人评');
    expect(abView(null).hasTrial).toBe(false);

    // 只给了赞/踩（没有 better）时不能说谁赢——真实数据里也可能长这样
    const quickOnly = abView({ ...trial, humanReview: { mode: 'quick', verdict: 'up', scores: null } });
    expect(quickOnly.winner).toBeNull();
    expect(quickOnly.winnerText).toBe('人评没选哪版更好');
  });

  it('humanReviewLine 一行说清：赞/踩 + 选了哪版', () => {
    expect(humanReviewLine(trial)).toBe('👍 愿意继续用 · 选了 B');
    expect(humanReviewLine({ ...trial, humanReview: { mode: 'quick', verdict: 'down', scores: null } })).toBe(
      '👎 不想继续用',
    );
    expect(humanReviewLine({ ...trial, humanReview: null })).toBe('没人评');
  });

  it('humanReviewView 解释评审结论', () => {
    const review = humanReviewView(trial);
    expect(review.verdictLabel).toContain('愿意继续用');
    expect(review.betterText).toContain('B 更好');
    expect(review.modeText).toContain('快捷评审');
    expect(humanReviewView({ ...trial, humanReview: null }).hasReview).toBe(false);
    expect(humanReviewView({ ...trial, humanReview: { mode: 'detailed', verdict: 'down', scores: { a: 3 } } }).scores).toEqual([
      { name: 'a', value: 3 },
    ]);
  });

  it('measureRows 用「做到了 / 差别」而不是裸数字', () => {
    const rows = measureRows(trial);
    const size = rows.find((r) => r.label.includes('大小'));
    const correctness = rows.find((r) => r.label.includes('任务要求'));
    expect(size?.values.A).toBe('12.2 KB');
    expect(size?.values.B).toBe('14.6 KB');
    expect(size?.note).toContain('B 比 A 大');
    expect(correctness?.values.A).toBe('做到了');
    expect(correctness?.note).toBe('两版一样');
    expect(rows.find((r) => r.label.includes('静态检查'))?.values.B).toBe('5 断点');
    expect(measureColumns(trial)).toEqual(['A', 'B']);
    expect(measureNotes(trial)).toContain('设计主张');
    expect(measureRows(null)).toEqual([]);
  });

  it('成本与效率维度：token / 耗时 / 轮次 / 工具调用 / 花费都带单位与"谁多谁少"', () => {    const costed: Trial = {
      ...trial,
      measures: {
        correctness: { A: 1, B: 1 },
        tokensIn: { A: 78544, B: 80375 },
        tokensOut: { A: 2187, B: 3076 },
        tokensTotal: { A: 80731, B: 83451 },
        tokensCached: { A: 39511, B: 40128 },
        durationSec: { A: 85.4, B: 85.5 },
        steps: { A: 5, B: 4 },
        toolCalls: { A: 6, B: 8 },
        toolMix: { A: 'Bash 3 / Read 1', B: 'Bash 5 / Write 2' },
        costUsd: { A: 0.012, B: 0.02 },
        staticChecks: { A: '用例 2/2 通过', B: '用例 2/2 通过' },
      },
    };
    const rows = measureRows(costed);
    const row = (label: string) => rows.find((r) => r.label === label);

    // 数字要带单位，别让人猜（80k 是 token 还是字节？）；token 精确到个位 + 千分位
    expect(row('总 token')?.values.A).toBe('80,731');
    expect(row('输出 token')?.values.B).toBe('3,076');
    expect(row('耗时（单条用例）')?.values.A).toBe('85.4 秒');
    expect(row('交互轮次')?.values.B).toBe('4 轮');
    expect(row('工具调用次数')?.values.B).toBe('8 次');
    expect(row('花费')?.values.A).toBe('$0.012');
    expect(row('工具调用构成')?.values.B).toBe('Bash 5 / Write 2');

    // 差别只说事实：谁多、多多少（"越少越省"这类读法统一放在标题的 tooltip 里，不每行重复）
    expect(row('总 token')?.note).toContain('B 比 A 多');
    expect(row('总 token')?.note).not.toContain('越少越省');
    expect(row('缓存命中的 token')?.note).not.toContain('上下文复用');
    expect(row('总 token')?.note).not.toMatch(/更好|更优|推荐/);

    // 规则在 tooltip 里集中说明（每一条都要能对上号）
    const rules = measureRules();
    const flat = rules.map((r) => `${r.group}：${r.items.join('')}`).join('\n');
    expect(flat).toContain('越少越省');
    expect(flat).toContain('上下文复用');
    expect(flat).toContain('唯一参与判定的维度');
    expect(flat).toContain('5% 以内算持平');
  });

  it('没有这些维度时不多摆空行', () => {
    const onlyBasic: Trial = { ...trial, measures: { correctness: { A: 1, B: 1 } } };
    expect(measureRows(onlyBasic).map((r) => r.label)).toEqual(['是否做到任务要求']);
  });

  it('前后对照：两侧的结果、产物、关键数字，以及一句"差在哪"', () => {
    const costed: Trial = {
      ...trial,
      measures: {
        correctness: { A: 1, B: 1 },
        sizeKB: { A: 0.6, B: 0.7 },
        tokensTotal: { A: 80731, B: 83451 },
        durationSec: { A: 85.4, B: 85.5 },
        toolCalls: { A: 6, B: 8 },
        staticChecks: { A: '用例 2/2 通过', B: '用例 2/2 通过' },
      },
      humanReview: { mode: 'quick', verdict: 'up', better: 'B', scores: null },
    };
    const sides = sideResults(costed);
    expect(sides.map((s) => s.name)).toEqual(['A', 'B']);
    expect(sides[0].meaning).toContain('不加载');
    expect(sides[1].meaning).toContain('加载了');
    expect(sides[0].doneLabel).toBe('做到了');
    expect(sides[1].picked).toBe(true);
    expect(sides[0].picked).toBe(false);
    // 产物要能直接打开（文件名 + 链接）
    expect(sides[0].artifact?.name).toBe('version-a.html');
    expect(sides[0].artifact?.url).toContain('/evidence/');
    // 关键数字取前三个（大小 / token / 耗时），带单位
    expect(sides[1].highlights.map((h) => h.label)).toEqual(['产物文件大小', '总 token', '耗时（单条用例）']);
    expect(sides[1].highlights[1].value).toBe('83,451');

    // 一句话对照：只管事实（A → B），不判"哪个更好"
    const digest = compareDigest(costed) ?? '';
    expect(digest).toContain('两版都做到了任务要求');
    expect(digest).toContain('产物 0.6 KB → 0.7 KB');
    expect(digest).toContain('token 80,731 → 83,451');
    expect(digest).toContain('变多');
    expect(digest).toMatch(/耗时 .*基本持平/);
    expect(digest).not.toMatch(/更好|更优|推荐|胜出/);

    // 单条件 / 没有任何可比的数字时，不硬凑一句话
    expect(compareDigest({ ...costed, conditions: [{ name: 'B', withCapability: true }] })).toBeNull();
    expect(compareDigest({ ...costed, measures: {} })).toBeNull();
  });

  it('系统小结：先说正确性，再看人评，最后才比成本；只讲这一次对照', () => {
    const base: Trial = {
      ...trial,
      measures: {
        correctness: { A: 1, B: 1 },
        tokensTotal: { A: 100000, B: 60000 },
        durationSec: { A: 40, B: 30 },
        toolCalls: { A: 8, B: 5 },
        sizeKB: { A: 1.0, B: 1.05 },
      },
      humanReview: null,
    };

    // ① 只有一版做到 → 直接推荐它（成本根本不参与）
    const halfDone = systemSummary({ ...base, measures: { ...base.measures, correctness: { A: 0, B: 1 } } });
    expect(halfDone.recommendedSide).toBe('B');
    expect(halfDone.recommendation ?? '').toContain('只有它做到了任务要求');

    // ② 两版都做到、没人评 → 比成本：token / 耗时 / 工具调用都指向 B；产物差 5% 以内算持平、不算"好"
    const byCost = systemSummary(base);
    expect(byCost.recommendedSide).toBe('B');
    expect(byCost.recommendation ?? '').toContain('更省');
    const sideB = byCost.sides.find((s) => s.name === 'B');
    expect(sideB?.pros.join(' ')).toContain('总 token 少 40%');
    expect(sideB?.pros.join(' ')).not.toContain('产物大小');

    // ③ 有人评就以人评为准（哪怕成本数据指向另一边），依据里写明
    const byHuman = systemSummary({ ...base, humanReview: { mode: 'quick', verdict: 'up', better: 'A', scores: null } });
    expect(byHuman.recommendedSide).toBe('A');
    expect(byHuman.recommendation ?? '').toContain('人评选了这一版');
    expect(byHuman.rationale).toContain('人评优先');
    // 依据是"规则速记"，不重复出现两次同一条规则
    expect(byHuman.rationale.match(/成本与效率/g) ?? []).toHaveLength(1);
    expect(byCost.rationale.match(/成本与效率/g) ?? []).toHaveLength(1);

    // ④ 都没做到 → 不推荐，先修任务说明
    const allFail = systemSummary({ ...base, measures: { ...base.measures, correctness: { A: 0, B: 0 } } });
    expect(allFail.recommendedSide).toBeNull();
    expect(allFail.recommendation ?? '').toContain('不推荐哪一版');

    // ⑤ 差距都在 5% 以内 → 说"差不多"，不硬推
    const even = systemSummary({ ...base, measures: { correctness: { A: 1, B: 1 }, tokensTotal: { A: 100000, B: 102000 } } });
    expect(even.recommendedSide).toBeNull();
    expect(even.recommendation ?? '').toContain('两版差不多');

    // ⑥ 单条件 / 没有试用的不给小结
    expect(systemSummary({ ...base, conditions: [{ name: 'B', withCapability: true }] }).available).toBe(false);
    expect(systemSummary(null).available).toBe(false);
  });

  it('单条件（真实项目使用）也能给出列名与文字结论', () => {
    const realUse: Trial = {
      ...trial,
      conditions: [{ name: 'B', withCapability: true }],
      measures: { correctness: { B: 1 }, staticChecks: { B: '五件套全绿' } },
      humanReview: { mode: 'quick', verdict: 'up', scores: null },
    };
    const view = abView(realUse);
    expect(view.hasControl).toBe(false);
    expect(view.winner).toBeNull();
    expect(view.winnerText).toContain('没有 A/B 对照');
    expect(measureColumns(realUse)).toEqual(['B']);
    expect(conditionLabel(realUse, 'B')).toBe('B 加载了能力');
    expect(conditionLabel(realUse, 'A')).toBe('A');
    expect(measureRows(realUse)[0]?.values.B).toBe('做到了');
  });

  it('只有人评的试用不留证据链，模型评 / 自动检查才留', () => {
    expect(hasEvidenceChain(trial)).toBe(false); // judge: ['human']
    expect(hasEvidenceChain({ ...trial, judge: ['llm'] })).toBe(true);
    expect(hasEvidenceChain({ ...trial, judge: ['auto'] })).toBe(true);
    expect(hasEvidenceChain({ ...trial, judge: ['human', 'llm'] })).toBe(true);
    expect(hasEvidenceChain({ ...trial, judge: [] })).toBe(true); // 没记录 → 默认保留
    expect(hasEvidenceChain(null)).toBe(true);
  });

  it('judgeText 把评判方写成人话', () => {
    expect(judgeText(trial)).toBe('人评');
    expect(judgeText({ ...trial, judge: ['human', 'llm'] })).toBe('人评 + 模型评');
    expect(judgeText({ ...trial, judge: ['auto'] })).toBe('自动检查');
    expect(judgeText({ ...trial, judge: [] })).toBe('没记录');
  });

  it('试用方式：按 kind 给标签，缺省按条件数推断', () => {
    expect(trialKindView({ ...trial, kind: 'controlled' }).label).toBe('受控对比');
    expect(trialKindView({ ...trial, kind: 'mock' }).label).toBe('模拟场景');
    expect(trialKindView({ ...trial, kind: 'live' }).label).toBe('真实项目使用');
    expect(trialKindView({ ...trial, kind: undefined }).kind).toBe('controlled');
    expect(trialKindView({ ...trial, kind: undefined, conditions: [{ name: 'B', withCapability: true }] }).kind).toBe('live');
  });

  it('人评-only 的说明按试用方式给准确说法（不能说没有的东西）', () => {
    expect(noEvidenceNote({ ...trial, kind: 'controlled' })).toContain('「条件」');
    expect(noEvidenceNote({ ...trial, kind: 'mock' })).toContain('仓库');
    expect(noEvidenceNote({ ...trial, kind: 'live' })).toContain('别的仓库');
  });

  it('trialTitle 带上日期、任务与模型', () => {
    expect(trialTitle(trial)).toBe('2026-09-10 · 任务 page-card');
    expect(trialTitle({ ...trial, model: 'deepseek-v4-flash' })).toContain('deepseek-v4-flash');
  });
});

describe('证据文件访问', () => {
  it('describeEvidence 解释每个文件是什么', () => {
    // A / B 由分组表达，kind 只说"这是个什么文件"，别每行都重复一遍"A 版产物"
    expect(describeEvidence('a/version-a.html').kind).toBe('页面产物');
    expect(describeEvidence('a/version-b.html').kind).toBe('页面产物');
    expect(describeEvidence('a/EVIDENCE.md').kind).toBe('试用笔记');
    expect(describeEvidence('a/SCORING.md').kind).toBe('打分标准');
    expect(describeEvidence('src/pages/home.tsx').kind).toBe('实现代码');
    // 判定记录要一眼看出"结论是按它算的"
    expect(describeEvidence('w/iteration-8/result.json').kind).toBe('逐条用例结果');
    expect(describeEvidence('w/iteration-8/benchmark.md').kind).toBe('对照摘要（可读版）');
    expect(describeEvidence('w/iteration-8/report.html').kind).toBe('完整报告');
    // B 侧工作区里的技能自带文件（不是这次跑出来的产物）单独标出来
    expect(describeEvidence('w/with_skill/outputs/workspace/.claude/skills/ponytail/SKILL.md').kind).toBe('技能自带文件');
    expect(describeEvidence('a/unknown.bin').kind).toBe('证据文件');
  });

  it('evidenceGroups 按"它证明什么"分组：A / B / 判定记录 / 技能自带 / 其它', () => {
    const t = {
      trialId: 'x',
      kind: 'controlled',
      evidence: [
        's/ponytail-workspace/iteration-8/result.json',
        's/ponytail-workspace/iteration-8/benchmark.md',
        's/ponytail-workspace/iteration-8/ask/without_skill/outputs/workspace/dedupe.mjs',
        's/ponytail-workspace/iteration-8/ask/with_skill/outputs/workspace/dedupe.mjs',
        's/ponytail-workspace/iteration-8/ask/with_skill/outputs/workspace/.claude/skills/ponytail/SKILL.md',
        'adopted/skills/frontend-design/benchmarks/tasks/page-card/version-a.html',
        'adopted/skills/frontend-design/EVIDENCE.md',
      ],
    } as unknown as Trial;

    const groups = evidenceGroups(t);
    expect(groups.map((g) => g.key)).toEqual(['A', 'B', 'record', 'skill', 'other']);
    expect(groups[0].items.map((i) => i.name)).toEqual(['dedupe.mjs', 'version-a.html']);
    expect(groups[1].items.map((i) => i.name)).toEqual(['dedupe.mjs']);
    expect(groups[2].items.map((i) => i.name)).toEqual(['result.json', 'benchmark.md']);
    // 技能自带的文件不算 B 的产物（一次能占十几个，会把真正要看的淹掉）
    expect(groups[3].items.map((i) => i.name)).toEqual(['SKILL.md']);
    expect(groups[4].items.map((i) => i.name)).toEqual(['EVIDENCE.md']);
    // 不重不漏
    const total = groups.reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBe((t.evidence ?? []).length);
    // 没有证据就不摆空组
    expect(evidenceGroups({ trialId: 'y', evidence: [] } as unknown as Trial)).toEqual([]);
  });

  it('人评汇总：把散在 N 条试用里的人评收成一句话', () => {
    const cap = {
      id: 'x',
      trials: [
        { trialId: 'a', humanReview: { mode: 'quick', verdict: 'up', better: 'B', scores: null } },
        { trialId: 'b', humanReview: { mode: 'quick', verdict: 'down', better: 'A', scores: null, reason: '太啰嗦' } },
        { trialId: 'c' },
      ],
      latestTrial: null,
    } as unknown as Capability;
    const s = humanSummary(cap);
    expect(s.reviewed).toBe(2);
    expect(s.up).toBe(1);
    expect(s.down).toBe(1);
    expect(s.pickedWithCapability).toBe(1);
    expect(s.latest?.reason).toBe('太啰嗦');
    expect(s.line).toContain('2 条试用人评：👍 1 · 👎 1');
    expect(s.line).toContain('1 次选了「加载能力」那版');

    expect(humanSummary({ id: 'y', trials: [], latestTrial: null } as unknown as Capability).line).toContain('还没有人评过');
  });

  it('人的结论：采纳与否只能由人给，机器只到"证据够了"', () => {
    const auto = {
      id: 'x',
      status: 'trialing',
      trials: [],
      latestTrial: { trialId: 't', verdict: { decision: 'ready' } },
    } as unknown as Capability;
    const before = humanDecisionView(auto);
    expect(before.decided).toBe(false);
    expect(before.label).toContain('还没有你的结论');
    expect(before.machineHint).toContain('采不采纳等你说一句');

    const decided = {
      ...auto,
      status: 'adopted',
      humanDecision: { verdict: 'adopt', reason: '省事', reviewedAt: '2026-09-11' },
    } as unknown as Capability;
    const after = humanDecisionView(decided);
    expect(after.decided).toBe(true);
    expect(after.label).toBe('你的结论：采纳');
    expect(after.reason).toBe('省事');
  });

  it('机器判定达标是一档独立结论：待确认，不是采纳', () => {
    const ready = decisionView('ready');
    expect(ready.stamp).toBe('待确认');
    expect(ready.tone).toBe('ready');
    expect(ready.headline).toContain('等你定');
    // 采纳这一档的文案也要说清"是人定的"
    expect(decisionView('adopt').detail).toContain('你已确认');
  });

  it('试用列表的三处缩写：日期只留月-日、方式用短标签、人评只留记号', () => {
    // 日期：2026-09-11 → 09-11（列表里年份没信息量）
    expect(trialDateShort({ trialId: 't', date: '2026-09-11' } as unknown as Trial)).toBe('09-11');
    expect(trialDateShort({ trialId: 't' } as unknown as Trial)).toBe('日期未知');

    // 方式：全称给 hover，表格里只放两个字
    const controlled = { trialId: 't', kind: 'controlled' } as unknown as Trial;
    expect(trialKindView(controlled).label).toBe('受控对比');
    expect(trialKindView(controlled).short).toBe('对比');
    expect(trialKindView({ trialId: 't', kind: 'mock' } as unknown as Trial).short).toBe('模拟');
    expect(trialKindView({ trialId: 't', kind: 'live' } as unknown as Trial).short).toBe('实跑');
    expect(trialKindView({ trialId: 't', kind: 'mock', probeOnly: true } as unknown as Trial).short).toBe('探针');

    // 人评：只有一个记号，完整说法（赞/踩 + 选了哪版）在 humanReviewLine 里
    expect(humanReviewGlyph({ trialId: 't', humanReview: { mode: 'quick', verdict: 'up', better: 'B', scores: null } } as unknown as Trial)).toBe('👍');
    expect(humanReviewGlyph({ trialId: 't', humanReview: { mode: 'quick', verdict: 'down', scores: null } } as unknown as Trial)).toBe('👎');
    expect(humanReviewGlyph({ trialId: 't' } as unknown as Trial)).toBe('—');
  });

  it('evidenceProofNote 按试用方式说清"这些证据怎么证明的"', () => {
    const base = { trialId: 't', evidence: [] } as unknown as Trial;
    expect(evidenceProofNote({ ...base, kind: 'controlled' })).toContain('同一个任务跑两遍');
    expect(evidenceProofNote({ ...base, kind: 'controlled' })).toContain('A / B 的产物可以直接打开对照');
    expect(evidenceProofNote({ ...base, kind: 'mock' })).toContain('任务与输入都固定在仓库里');
    expect(evidenceProofNote({ ...base, kind: 'live' })).toContain('真实项目里的使用记录');
  });

  it('evidenceUrl / artifactUrl 生成可打开的仓库内地址', () => {
    expect(evidenceUrl('candidates/a b/c.html')).toBe('./evidence/candidates/a%20b/c.html');
    expect(artifactUrl({ name: 'A', withCapability: false, artifact: 'x/y.html' })).toBe('./evidence/x/y.html');
    expect(artifactUrl({ name: 'A', withCapability: false })).toBeNull();
    expect(evidenceList(trial)).toHaveLength(2);
    expect(evidenceList(null)).toEqual([]);
  });
});

describe('后台评测的状态文案（「正在评测」那一块）', () => {
  it('跑着 / 跑完成功 / 跑完失败，三种说法分开', () => {
    expect(runStateView({ status: 'running' })).toMatchObject({ stamp: '评测中', tone: 'ready' });
    expect(runStateView({ status: 'running' }).detail).toContain('可以关掉');
    expect(runStateView({ status: 'done', code: 0 })).toMatchObject({ stamp: '完成', tone: 'adopt' });
    expect(runStateView({ status: 'done', code: 0 }).detail).toContain('台账已经更新');
    expect(runStateView({ status: 'done', code: 1 })).toMatchObject({ stamp: '失败', tone: 'reject' });
    expect(runStateView({ status: 'done', code: 1 }).detail).toContain('看日志');
  });

  it('三种发起方式各有一句话', () => {
    expect(runKindView('ask').label).toBe('自己出题');
    expect(runKindView('auto').label).toBe('一键评测');
    expect(runKindView('run').label).toBe('跑已有用例');
    // 认不出的值别抛错，退回最保守的那个说法
    expect(runKindView('???').label).toBe('跑已有用例');
  });

  it('时长按人话写：秒 / 分 / 分秒', () => {
    expect(runDuration(9000)).toBe('9 秒');
    expect(runDuration(120000)).toBe('2 分');
    expect(runDuration(305000)).toBe('5 分 5 秒');
    expect(runDuration(undefined)).toBe('0 秒');
  });
});

describe('重复跑（`--repeat N`）在页面上怎么说', () => {
  const withRepeats = (repeats: Record<string, string>, extra: Record<string, unknown> = {}) =>
    ({ trialId: 't', capability: { id: 'x' }, measures: { correctness: { A: 0.33, B: 1 }, repeats, ...extra } }) as unknown as Trial;

  it('有重复记录时多出一行"全过几次 / 共几次"', () => {
    const row = measureRows(withRepeats({ A: '1/3', B: '3/3' })).find((r) => r.label.includes('重复跑'));
    expect(row).toBeTruthy();
    expect(row?.values).toEqual({ A: '1/3 次全过', B: '3/3 次全过' });
  });

  it('每次都对上 → "每次都过"；有波动 → 明说"单次结果不能当结论"', () => {
    const steady = measureRows(withRepeats({ A: '3/3', B: '3/3' })).find((r) => r.label.includes('重复跑'));
    expect(steady?.note).toBe('每次都过');
    const flaky = measureRows(withRepeats({ A: '1/3', B: '3/3' })).find((r) => r.label.includes('重复跑'));
    expect(flaky?.note).toContain('有波动');
  });

  it('没有重复记录就不出现这一行（单次运行不打扰）', () => {
    const only = { trialId: 't', capability: { id: 'x' }, measures: { correctness: { A: 1, B: 1 } } } as unknown as Trial;
    expect(measureRows(only).some((r) => r.label.includes('重复跑'))).toBe(false);
  });
});
