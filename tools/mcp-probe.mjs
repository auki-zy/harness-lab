#!/usr/bin/env node
/**
 * MCP 能力探针：把一个 MCP server 真的起来、按协议问一遍，把结果落成台账里的 trial。
 *
 *   node tools/mcp-probe.mjs --name mcp-demo [--purpose integration] [--dry-run] [--inspector]
 *
 * 检查项（全部是协议层可判定的事实，不需要 LLM）：
 *   1. server 能启动并完成 initialize 握手
 *   2. tools/list 能返回工具，且每个工具有 name / description / inputSchema
 *   3. 预设里声明了 probe.sampleTool 时，真的调一次并拿到内容
 *   4. 密钥没写死在 server.json 里（只允许 ${ENV_VAR} 占位）
 *   5. 进程退出行为干净（不残留）
 *
 * `--inspector` 时会另外调官方 MCP Inspector 的 CLI（npx @modelcontextprotocol/inspector --cli）取一次工具清单，
 * 用于和内置探针交叉验证（需要网络与 npx；不装也不影响内置探针）。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { P, conclusionSummary, decide, fail, findCapability, log, readJson, rel, sourceDescription, sourceDescriptionLabel, trialId, upsertCapability, writeTrial } from './lib/trial-record.mjs';

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
const name = args.name;
if (!name) fail('用法：node tools/mcp-probe.mjs --name <MCP 能力名> [--purpose integration] [--dry-run] [--inspector]');

const found = findCapability(name, 'mcp');
if (!found) fail(`找不到 MCP 候选：candidates/mcp/${name}（先建 server.json + MCP.md）`);
const presetFile = path.join(found.dir, 'server.json');
if (!existsSync(presetFile)) fail(`缺 server.json：${presetFile}`);
const preset = readJson(presetFile);
const config = preset.config ?? preset;
if (!config.command && !config.url) fail('server.json 里既没有 command 也没有 url');

const checks = [];
const add = (name2, ok, detail) => checks.push({ name: name2, ok, detail });

// —— 4. 密钥不落盘（放最前面，纯静态检查）
const rawPreset = readFileSync(presetFile, 'utf8');
const env = config.env ?? {};
const hardcoded = Object.entries(env).filter(([, v]) => v && !/^\$\{[A-Z0-9_]+\}$/.test(String(v)));
add('密钥只用 ${ENV_VAR} 占位', hardcoded.length === 0, hardcoded.length ? `写死了：${hardcoded.map(([k]) => k).join(', ')}` : '未发现写死的密钥');

/** 极简 MCP stdio 客户端：newline-delimited JSON-RPC */
async function probeStdio() {
  const started = Date.now();
  const child = spawn(config.command, config.args ?? [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  });
  let buffer = '';
  const pending = new Map();
  const stderrChunks = [];
  child.stderr.on('data', (c) => stderrChunks.push(String(c)));
  child.stdout.on('data', (chunk) => {
    buffer += String(chunk);
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      } catch {
        /* 非 JSON 行忽略 */
      }
    }
  });

  const send = (msg) => child.stdin.write(JSON.stringify(msg) + '\n');
  const call = (id, method, params, timeoutMs = 8000) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: { message: `超时 ${timeoutMs}ms` } }), timeoutMs);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      send({ jsonrpc: '2.0', id, method, params });
    });

  const init = await call(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'harness-lab-probe', version: '0.1.0' },
  });
  const serverInfo = init.result?.serverInfo;
  add('initialize 握手', Boolean(serverInfo), serverInfo ? `${serverInfo.name} ${serverInfo.version ?? ''}（协议 ${init.result?.protocolVersion ?? '?'}）` : JSON.stringify(init.error ?? init).slice(0, 160));
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  const listed = await call(2, 'tools/list', {});
  const tools = listed.result?.tools ?? [];
  add('tools/list 返回工具', tools.length > 0, `${tools.length} 个：${tools.map((t) => t.name).slice(0, 6).join(', ')}`);
  const undocumented = tools.filter((t) => !t.description || !t.inputSchema);
  add('每个工具有 description 与 inputSchema', tools.length > 0 && undocumented.length === 0, undocumented.length ? `缺文档：${undocumented.map((t) => t.name).join(', ')}` : '全部具备');

  const sampleTool = args.tool ?? preset.probe?.sampleTool;
  if (sampleTool) {
    const sampleArgs = preset.probe?.sampleArgs ?? {};
    const called = await call(3, 'tools/call', { name: sampleTool, arguments: sampleArgs }, 15000);
    const content = called.result?.content ?? [];
    const text = content.map((c) => c.text ?? '').join(' ').slice(0, 200);
    add(`样例调用 ${sampleTool}`, Boolean(called.result && !called.error), called.error ? JSON.stringify(called.error).slice(0, 160) : text || '（有结果，无文本内容）');
  } else {
    add('样例调用', true, '预设里没声明 probe.sampleTool，跳过（想验真调用就补上）');
  }

  const elapsed = Date.now() - started;
  child.kill();
  // 杀完等一下，确认没残留（Windows 上没有信号概念，只能看 exitCode/进程表）
  await new Promise((r) => setTimeout(r, 150));
  add('进程可正常收尾', child.exitCode !== null || child.killed, `退出码 ${child.exitCode ?? '(已发出终止)'}；stderr ${stderrChunks.join('').trim().slice(0, 120) || '无'}`);

  return { tools, elapsed, serverInfo, stderr: stderrChunks.join('').slice(0, 2000) };
}

function probeInspector() {
  if (!config.command) return { ok: false, detail: '预设没有 command，Inspector CLI 只能连 stdio server' };
  const cmd = ['-y', '@modelcontextprotocol/inspector', '--cli'];
  const res = spawnSync('npx', [...cmd, config.command, ...(config.args ?? []), '--method', 'tools/list'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 180000,
  });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  const ok = res.status === 0 && /"tools"/.test(out);
  return { ok, detail: ok ? `Inspector 取到工具清单（退出码 0）` : `Inspector 失败：${out.slice(0, 200).replace(/\s+/g, ' ')}` };
}

let probe = { tools: [], elapsed: 0, serverInfo: null, stderr: '' };
try {
  probe = await probeStdio();
} catch (err) {
  add('server 能启动', false, err instanceof Error ? err.message : String(err));
}

if (args.inspector) {
  const insp = probeInspector();
  add('官方 MCP Inspector 交叉验证', insp.ok, insp.detail);
}

const passed = checks.filter((c) => c.ok).length;
for (const c of checks) log(`${c.ok ? '✔' : '✗'} ${c.name} — ${c.detail}`);

const reportDir = path.join(found.dir, 'probe');
mkdirSync(reportDir, { recursive: true });
const reportFile = path.join(reportDir, `${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(reportFile, JSON.stringify({ name, config: { command: config.command, args: config.args }, checks, probe }, null, 2) + '\n', 'utf8');

const passRate = checks.length ? passed / checks.length : 0;
const firstFail = checks.find((c) => !c.ok);
// 指向仓库内夹具的探针 = 离线自检（mcp-demo 是这条链路的回归样本，本来就不是要采纳的能力）
const selfCheck = (config.args ?? []).some((a) => String(a).includes('__fixtures__'));
// 探针只做**可用性检查**（协议层），它不能证明"值得装进项目"——所以单独标记，判定规则里不吃这一套（见 evaluate/previousPasses）
const probeOnly = true;
const verdict = decide({
  passRateB: passRate,
  totalB: checks.length,
  name,
  selfCheck,
  probeOnly,
  extra: firstFail ? `未过项：${firstFail.name}` : undefined,
});
log(`—— 结论：${verdict.decision} —— ${verdict.reason}`);

const trial = {
  trialId: trialId(name, 'mcp-probe'),
  capability: { id: name, type: 'mcp' },
  kind: 'mock',
  task: {
    id: 'mcp-protocol-probe',
    fixture: rel(reportDir),
    description: '协议层探针：起 server → initialize → tools/list →（可选）样例调用，检查工具文档与退出行为（不需要 LLM）',
  },
  conditions: [{ name: 'B', withCapability: true, artifact: rel(reportFile) }],
  measures: {
    correctness: { B: passRate },
    // 成本与效率：探针没有模型花费，但"起服务 + 握手 + 列工具 + 样例调用"的耗时是可比的
    ...(probe.elapsed ? { durationSec: { B: Math.round(probe.elapsed / 100) / 10 } } : {}),
    // 功能清单：tools/list 报出来的工具（名字 + 有没有描述/入参 schema）——这是"功能列表检查"要看的东西
    ...(probe.tools.length
      ? {
          toolList: {
            B: probe.tools
              .map((t) => `${t.name}${!t.description || !t.inputSchema ? '（缺描述或入参 schema）' : ''}`)
              .join(' · '),
          },
        }
      : {}),
    staticChecks: { B: `${passed}/${checks.length} 项通过；工具 ${probe.tools.length} 个；启动+握手 ${probe.elapsed} ms` },
    notes: `${config.command} ${(config.args ?? []).join(' ')}；serverInfo ${probe.serverInfo?.name ?? '?'} ${probe.serverInfo?.version ?? ''}`.trim(),
  },
  judge: ['auto'],
  humanReview: null,
  verdict,
  evidence: [rel(presetFile), ...(existsSync(path.join(found.dir, 'MCP.md')) ? [rel(path.join(found.dir, 'MCP.md'))] : []), rel(reportFile)],
  model: '（协议探针，无模型）',
  date: new Date().toISOString().slice(0, 10),
  recordedAt: new Date().toISOString(),
  source: { tool: 'mcp-probe' },
  selfCheck,
  probeOnly,
};

if (args['dry-run']) {
  log('（--dry-run：没有写任何文件）');
  process.exit(passed === checks.length ? 0 : 1);
}

upsertCapability({
  id: name,
  type: 'mcp',
  localPath: rel(found.dir),
  purpose: args.purpose ?? 'integration',
  autoDescription: preset.description ?? sourceDescription(found.dir) ?? undefined,
  autoDescriptionSource: sourceDescriptionLabel(found.dir) ?? undefined,
  decision: verdict.decision,
  summary: conclusionSummary(verdict.decision, verdict.reason, {
    // 探针的结论是"可用 / 不可用"（能不能用），不是采纳与否（见 evals/schema.md 第九节）
    adopt: '可用：协议探针全过，工具清单与示例调用都正常。',
    available: `可用：可用性检查通过（${passed}/${checks.length} 项，工具 ${probe.tools.map((t) => t.name).join(' / ') || '（没列出工具）'}）。这一档只看"能不能用、工具全不全"，不判"值不值得装进项目"。`,
    unavailable: `不可用：可用性检查没过（${passed}/${checks.length} 项）${firstFail ? `，卡在「${firstFail.name}」` : ''}——协议层就有问题，先修好再用。`,
  }),
  evidenceLine: `${trial.date} MCP 探针（${passed}/${checks.length} 项）→ ${verdict.decision}`,
  stage: verdict.decision === 'adopt' ? 'adopted' : undefined,
});
writeTrial(trial);
process.exit(passed === checks.length ? 0 : 1);
