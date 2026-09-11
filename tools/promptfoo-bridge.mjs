#!/usr/bin/env node
/**
 * promptfoo → 台账 的桥接（零依赖）。用来评"子代理（agent）"这类**行为/输出规范**型能力：
 * 同一个任务跑两遍——A 不给规格、B 带上 AGENT.md 正文，用断言判是否达标。
 *
 *   node tools/promptfoo-bridge.mjs import --name task-scout --result <out.json> [--purpose planning] [--dry-run]
 *   node tools/promptfoo-bridge.mjs run    --name task-scout [--config <promptfooconfig.yaml>]
 *
 * 约定：配置里 prompts 的**第一个是 A（无规格）**，第二个是 B（带规格）；
 * 也可以用 prompt 文件名/标签里的 -a / -b、without / with 来标识，桥接会优先认标签。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { P, conclusionSummary, decide, fail, findCapability, log, readJson, rel, sourceDescription, sourceDescriptionLabel, trialId, upsertCapability, writeTrial } from './lib/trial-record.mjs';
import { openAiCompatEnv } from './lib/engines.mjs';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    } else out._.push(argv[i]);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

/** promptfoo 结果里每条跑分属于哪一侧（A=无规格 / B=带规格） */
function sideOf(entry) {
  const text = `${entry.prompt?.label ?? ''} ${entry.prompt?.raw ?? ''}`.toLowerCase();
  if (/-a\b|prompt-a|without/.test(text)) return 'A';
  if (/-b\b|prompt-b|with[_-]?spec|with[_-]?skill/.test(text)) return 'B';
  return null;
}

function summarize(entries) {
  const passed = entries.filter((e) => e.success).length;
  return { total: entries.length, passed, passRate: entries.length ? passed / entries.length : 0 };
}

function checksOf(entries) {
  if (!entries.length) return '（没有这一侧的结果）';
  const first = entries[0];
  const components = first.gradingResult?.componentResults ?? [];
  const failed = components.filter((c) => !c.pass).map((c) => c.reason ?? c.assertion?.type ?? '未通过');
  const avgLatency = Math.round(entries.reduce((n, e) => n + (e.latencyMs ?? 0), 0) / entries.length);
  return [
    `用例 ${summarize(entries).passed}/${entries.length} 通过`,
    components.length ? `断言 ${components.filter((c) => c.pass).length}/${components.length}` : '',
    `平均耗时 ${avgLatency} ms`,
    failed.length ? `未过：${failed.join(' / ').slice(0, 160)}` : '',
  ]
    .filter(Boolean)
    .join('；');
}

function importResult({ name, resultPath, purpose, description, descriptionSource, dryRun }) {
  const abs = path.resolve(resultPath);
  if (!existsSync(abs)) fail(`找不到 ${resultPath}`);
  const doc = readJson(abs);
  const entries = doc.results?.results ?? doc.results ?? [];
  if (!Array.isArray(entries) || entries.length === 0) fail('这份结果里没有 results 数组（确认是 promptfoo eval -o 的输出）');

  const grouped = { A: [], B: [] };
  const unknown = [];
  for (const e of entries) {
    const side = sideOf(e);
    if (side) grouped[side].push(e);
    else unknown.push(e);
  }
  // 认不出标签时按 promptIdx 顺序兜底：第一个 prompt 是 A，其余是 B
  if (grouped.A.length === 0 && grouped.B.length === 0 && unknown.length) {
    const idxs = [...new Set(unknown.map((e) => e.promptIdx ?? 0))].sort((a, b) => a - b);
    if (idxs.length < 2) fail(`结果里只有 ${idxs.length} 个 prompt：评"子代理"需要 A（无规格）与 B（带规格）两侧`);
    for (const e of unknown) grouped[(e.promptIdx ?? 0) === idxs[0] ? 'A' : 'B'].push(e);
  }
  if (grouped.B.length === 0) fail('没找到 B（带规格）那一侧的结果');

  const sumA = summarize(grouped.A);
  const sumB = summarize(grouped.B);
  // "工具报错"只算**provider 没给出输出**这种（连结果都没有）；断言没过是"能力没做到"，不是工具的锅
  // （promptfoo 会把断言失败的原因也写进 error 字段，别被它带偏）
  const providerFailed = (e) => !e.response || Boolean(e.response.error);
  const errorsB = grouped.B.filter(providerFailed).length;
  const rawText = readFileSync(abs, 'utf8');
  const usesLlmJudge = /llm-rubric|model-graded|g-eval|factuality|context-faithfulness/i.test(rawText);
  const provider = entries[0]?.provider?.label ?? entries[0]?.provider?.id ?? '?';
  // provider 是 stub（离线自检用的假 provider）时，这条记录只能证明链路通，不能当采纳依据
  const selfCheck = /stub/i.test(String(provider));
  const verdict = decide({
    passRateB: sumB.passRate,
    totalB: sumB.total,
    errorsB,
    selfCheck,
    name,
    extra: grouped.A.length ? `对照 A ${sumA.passed}/${sumA.total}` : '本次没有对照',
  });

  log(`—— 映射结果（${name}）${selfCheck ? '｜离线自检（stub provider）' : ''}`);
  log(`  工具 promptfoo｜provider ${provider}｜eval ${doc.evalId ?? '?'}`);
  log(`  正确性：A ${sumA.passed}/${sumA.total}｜B ${sumB.passed}/${sumB.total}`);
  log(`  检查：A ${checksOf(grouped.A)}`);
  log(`        B ${checksOf(grouped.B)}`);
  log(`  结论：${verdict.decision} —— ${verdict.reason}`);

  /** 成本与效率维度：promptfoo 每条结果都带 latencyMs / tokenUsage / cost（provider 不报用量时为 0） */
  const costOf = (entries) => {
    const sum = (pick) => entries.reduce((n, e) => n + (pick(e) ?? 0), 0);
    const latency = entries.length ? Math.round(sum((e) => e.latencyMs) / entries.length) : 0;
    return {
      tokensIn: sum((e) => e.tokenUsage?.prompt),
      tokensOut: sum((e) => e.tokenUsage?.completion),
      tokensTotal: sum((e) => e.tokenUsage?.total),
      cached: sum((e) => e.tokenUsage?.cached),
      costUsd: Math.round(sum((e) => e.cost) * 1e6) / 1e6,
      durationSec: latency ? Math.round(latency / 100) / 10 : null,
    };
  };
  const costA = costOf(grouped.A);
  const costB = costOf(grouped.B);
  const perSide = (pick) => {
    const out = {};
    if (grouped.A.length) out.A = pick(costA);
    if (grouped.B.length) out.B = pick(costB);
    return out;
  };
  const hasTokens = costA.tokensTotal > 0 || costB.tokensTotal > 0;
  const hasCost = costA.costUsd > 0 || costB.costUsd > 0;
  const costMeasures = {
    ...(hasTokens ? { tokensIn: perSide((c) => c.tokensIn), tokensOut: perSide((c) => c.tokensOut), tokensTotal: perSide((c) => c.tokensTotal) } : {}),
    ...(costA.cached || costB.cached ? { tokensCached: perSide((c) => c.cached) } : {}),
    ...(costA.durationSec || costB.durationSec ? { durationSec: perSide((c) => c.durationSec) } : {}),
    ...(hasCost ? { costUsd: perSide((c) => c.costUsd) } : {}),
  };

  const trial = {
    trialId: trialId(name, 'promptfoo'),
    capability: { id: name, type: 'agent' },
    kind: grouped.A.length ? 'controlled' : 'mock',
    task: {
      id: 'promptfoo-eval',
      fixture: rel(path.dirname(abs)),
      description: '提示/行为对照：同一任务跑两遍（A 不给子代理规格 / B 带上 AGENT.md 正文），用断言判定输出是否达标',
    },
    conditions: [
      ...(grouped.A.length ? [{ name: 'A', withCapability: false, artifact: rel(abs) }] : []),
      { name: 'B', withCapability: true, artifact: rel(abs) },
    ],
    measures: {
      correctness: { ...(grouped.A.length ? { A: sumA.passRate } : {}), B: sumB.passRate },
      ...costMeasures,
      staticChecks: { ...(grouped.A.length ? { A: checksOf(grouped.A) } : {}), B: checksOf(grouped.B) },
      notes: `provider ${provider}；promptfoo ${doc.results?.version ?? ''}；结果文件 ${rel(abs)}`,
    },
    judge: usesLlmJudge ? ['auto', 'llm'] : ['auto'],
    humanReview: null,
    verdict,
    evidence: [rel(abs)],
    model: provider,
    date: new Date().toISOString().slice(0, 10),
    recordedAt: new Date().toISOString(),
    source: { tool: 'promptfoo' },
    selfCheck,
  };

  if (dryRun) {
    log('（--dry-run：没有写任何文件）');
    return { trial, wrote: false };
  }

  const found = findCapability(name, 'agent');
  upsertCapability({
    id: name,
    type: 'agent',
    localPath: found ? rel(found.dir) : '',
    purpose: purpose ?? 'planning',
    description,
    descriptionSource,
    autoDescription: sourceDescription(found?.dir) ?? undefined,
    autoDescriptionSource: sourceDescriptionLabel(found?.dir) ?? undefined,
    decision: verdict.decision,
    summary: conclusionSummary(verdict.decision, verdict.reason, {
      adopt: '值得用：带规格那一侧连续通过，输出规范稳定达标。',
      hold: '待观察：带规格这一次全过，再来一次通过即可采纳。',
    }),
    evidenceLine: `${trial.date} promptfoo（A ${sumA.passed}/${sumA.total}｜B ${sumB.passed}/${sumB.total}）→ ${verdict.decision}`,
    stage: verdict.decision === 'adopt' ? 'adopted' : undefined,
  });
  writeTrial(trial);
  return { trial, wrote: true };
}

function runPromptfoo({ name, config }) {
  const found = findCapability(name, 'agent');
  if (!found) fail(`找不到子代理候选：candidates/agents/${name}`);
  const cfg = config ?? path.join(found.dir, 'evals', 'promptfooconfig.yaml');
  if (!existsSync(cfg)) fail(`找不到配置：${cfg}`);
  const outFile = P('evals', 'results', `promptfoo-${name}.json`);
  mkdirSync(path.dirname(outFile), { recursive: true });
  // 内置网关：配置里声明 apiBaseUrl + apiKeyEnvar 时，这里把 key 和 base url 注入子进程
  const gatewayEnv = openAiCompatEnv();
  if (gatewayEnv) log(`🌐 promptfoo 走内部网关 ${gatewayEnv.OPENAI_BASE_URL}`);
  log(`▶ npx -y promptfoo@latest eval -c ${rel(cfg)} -o ${rel(outFile)}`);
  const res = spawnSync('npx', ['-y', 'promptfoo@latest', 'eval', '-c', cfg, '-o', outFile, '--no-progress-bar'], {
    cwd: P(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: gatewayEnv ? { ...process.env, ...gatewayEnv } : process.env,
  });
  if (res.status !== 0) {
    const note = res.status === 100 ? '有用例没通过（正常，不是工具故障）' : '可能没跑完，看上面的输出';
    log(`ℹ️ promptfoo 退出码 ${res.status}：${note}`);
  }
  if (!existsSync(outFile)) fail('promptfoo 没写出结果文件');
  return importResult({ name, resultPath: outFile, purpose: args.purpose, description: args.description, descriptionSource: args["description-source"] });
}

if (command === 'import') {
  const name = args.name;
  if (!name) fail('import 需要 --name <能力名>');
  if (!args.result) fail('import 需要 --result <promptfoo 的 -o 输出>');
  importResult({ name, resultPath: args.result, purpose: args.purpose, description: args.description, descriptionSource: args['description-source'], dryRun: Boolean(args['dry-run']) });
} else if (command === 'run') {
  const name = args.name;
  if (!name) fail('run 需要 --name <能力名>');
  runPromptfoo({ name, config: args.config });
} else {
  log('用法：');
  log('  node tools/promptfoo-bridge.mjs run    --name <子代理> [--config <promptfooconfig.yaml>]');
  log('  node tools/promptfoo-bridge.mjs import --name <子代理> --result <out.json> [--purpose <已登记用途>] [--description "<一句话说明>"] [--description-source "<这句话哪来的>"] [--dry-run]');
  process.exit(command ? 1 : 0);
}
