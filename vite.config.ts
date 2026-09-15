import { copyFileSync, closeSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { engineInventory } from './tools/lib/engines.mjs';
import type { Trial } from './src/shared/types';

const root = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_PREFIX = '/evidence/';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.tsx': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * 页面要打开的仓库内文件：试用证据、A/B 产物、评测规范、聚合数据。
 * 只放白名单后缀，且只允许仓库内的相对路径。
 */
function evidenceFiles(): string[] {
  const files = new Set<string>(['evals/schema.md']);
  const dataFile = path.join(root, 'evals', 'results', 'app-data.json');
  if (existsSync(dataFile)) {
    const data = JSON.parse(readFileSync(dataFile, 'utf8')) as {
      capabilities?: { trials?: { evidence?: string[]; conditions?: { artifact?: string }[] }[] }[];
    };
    for (const cap of data.capabilities ?? []) {
      for (const trial of cap.trials ?? []) {
        for (const file of trial.evidence ?? []) files.add(file);
        for (const condition of trial.conditions ?? []) if (condition.artifact) files.add(condition.artifact);
      }
    }
  }
  return [...files].filter((file) => {
    const abs = path.resolve(root, file);
    return (
      abs.startsWith(root + path.sep) &&
      existsSync(abs) &&
      statSync(abs).isFile() &&
      Boolean(MIME[path.extname(abs).toLowerCase()])
    );
  });
}

/** dev：/evidence/<仓库内相对路径> → 仓库文件；只放行"被登记为证据"的文件，别的一律 404 */
function evidenceDevPlugin(): Plugin {
  return {
    name: 'harness-lab:evidence-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith(EVIDENCE_PREFIX)) return next();
        const rel = decodeURIComponent(url.slice(EVIDENCE_PREFIX.length).split('?')[0]).replace(/\\/g, '/');
        const abs = path.resolve(root, rel);
        const ext = path.extname(abs).toLowerCase();
        const allowed =
          abs.startsWith(root + path.sep) &&
          Boolean(MIME[ext]) &&
          existsSync(abs) &&
          statSync(abs).isFile() &&
          evidenceFiles().includes(rel);
        if (!allowed) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        res.setHeader('Content-Type', MIME[ext]);
        createReadStream(abs).pipe(res);
      });
    },
  };
}

/** build：把同样的文件复制进 dist/evidence，`npm run preview` 和静态托管也能打开 */
function evidenceBuildPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'harness-lab:evidence-build',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const target = path.resolve(root, outDir, 'evidence');
      const files = evidenceFiles();
      for (const rel of files) {
        const dest = path.join(target, rel);
        mkdirSync(path.dirname(dest), { recursive: true });
        copyFileSync(path.join(root, rel), dest);
      }
      this.info(`证据文件已复制 ${files.length} 个 → ${path.relative(root, target)}/`);
    },
  };
}

/**
 * 「页面上发起评测」的接口（只在 dev 提供）。评测本身交给三套开源工具：
 *   skill-up（技能） / promptfoo（子代理） / MCP 探针（MCP server）
 * 这里只做参数校验、进程管理与日志轮询；结果由各自的 bridge 落进 evals/trials/。
 */
const EVAL_RUNS = path.join(root, '.trial-runs');
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SOURCE_RE = /^(https?:\/\/\S+|[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?::\S+)?)$/;
const TOOLS: Record<string, { script: string; needs?: 'source' | 'result' }> = {
  'skill-up': { script: 'tools/skillup-bridge.mjs', needs: 'source' },
  promptfoo: { script: 'tools/promptfoo-bridge.mjs', needs: 'result' },
  'mcp-probe': { script: 'tools/mcp-probe.mjs' },
};

/** 工具的人话名字。状态端点（页面「按类型选工具」）与「正在评测」列表共用这一份——
 * 抄两套的话，页面上同一个工具会出现两种叫法。
 */
const TOOL_LABELS: Record<string, string> = {
  'skill-up': '技能（skill-up）',
  promptfoo: '子代理（promptfoo）',
  'mcp-probe': 'MCP（协议探针）',
};

/** 重复跑次数（同一条用例跑几遍）：1–5，别的值一律当 1 —— 一次 A/B 十几分钟，别让人误填 50 */
function repeatArg(body: Record<string, unknown>): number {
  const n = Number(body.repeat);
  return Number.isInteger(n) && n > 1 && n <= 5 ? n : 1;
}

/** 能力类型 → 该用哪套评测工具；配置文件名决定"能不能直接跑" */
const TYPE_TOOL: Record<string, string> = { skill: 'skill-up', agent: 'promptfoo', mcp: 'mcp-probe' };
/**
 * 入口开关（与 `src/shared/entries.ts` 保持一致）：目前只开放技能评测。
 * 子代理 / MCP 的工具与桥接都还在，想好口径后把 'promptfoo' / 'mcp-probe' 加回来即可。
 */
const OPEN_TOOLS = new Set<string>([
  'skill-up',
  // 'promptfoo',  // 子代理入口：等 A/B 口径定下来再放开
  // 'mcp-probe',  // MCP 入口：只做收录 + 可用性检查（可用 / 不可用），先不开放
]);
const TYPE_DIR: Record<string, string> = { skill: 'skills', agent: 'agents', mcp: 'mcp' };
const CONFIG_FILE: Record<string, string> = {
  skill: 'evals/eval.yaml',
  agent: 'evals/promptfooconfig.yaml',
  mcp: 'server.json',
};

const TRIAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const REVIEW_REASON_MAX = 300;

/** 人评入口：把一次 👍/👎（可选一句理由）写进对应的 trial，再重新聚合 */
/**
 * 技能市场（skillsmp.com）搜索：**服务端代理**。
 * 页面拿关键词来 → 这里去问市场 → 归一化成"能力名 / 作者 / 描述 / 来源链接"。
 * 选中的结果直接填进「能力」那一格：市场给的是 `github.com/…/tree/main/<技能目录>`，
 * 正好是我们认的来源写法（`evals/schema.md` 3.1.1），所以选中即可开跑。
 * 市场抽风不该拖垮页面：失败就返回错误，界面照旧能手填。
 */
const MARKET_API = 'https://skillsmp.com/api/v1/skills/search';

async function searchMarket(q: string, limit: number): Promise<{ skills: unknown[] } | { error: string }> {
  try {
    const res = await fetch(`${MARKET_API}?q=${encodeURIComponent(q)}&limit=${limit}`, {
      headers: { 'user-agent': 'harness-lab', accept: 'application/json' },
    });
    if (!res.ok) return { error: `技能市场返回 HTTP ${res.status}` };
    const body = (await res.json()) as { data?: { skills?: Record<string, unknown>[] } };
    const skills = (body.data?.skills ?? [])
      .map((s) => ({
        id: String(s.id ?? ''),
        name: String(s.name ?? ''),
        author: String(s.author ?? ''),
        description: String(s.description ?? ''),
        source: String(s.githubUrl ?? ''),
        url: String(s.skillUrl ?? ''),
        stars: Number(s.stars ?? 0),
      }))
      .filter((s) => s.name && s.source);
    return { skills };
  } catch (e) {
    return { error: `连不上技能市场：${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * **人的结论**：采纳 / 不采纳某个能力。这是 adopted / rejected 的唯一入口——
 * 机器跑到"证据够了"只会停在 `ready`（待确认），采不采纳由人拍板。
 * 写 `evals/capabilities.json` 的 `humanDecision` 并同步状态（与试用记录的人评分开存）。
 */
function saveCapabilityDecision(body: Record<string, unknown>): { ok: true; capabilityId: string; status: string } | { error: string } {
  const capabilityId = String(body.capabilityId ?? '');
  const verdict = String(body.verdict ?? '');
  const reasonRaw = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!NAME_RE.test(capabilityId)) return { error: '能力名不合法' };
  if (verdict !== 'adopt' && verdict !== 'reject') return { error: '人的结论只能是 adopt（采纳）或 reject（不采纳）' };
  if (reasonRaw.length > REVIEW_REASON_MAX) return { error: `理由最多 ${REVIEW_REASON_MAX} 字（现在 ${reasonRaw.length}）` };

  const file = path.join(root, 'evals', 'capabilities.json');
  const doc = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as {
    capabilities: { id: string; status?: string; tags?: Record<string, unknown>; summary?: string }[];
  };
  const cap = doc.capabilities.find((c) => c.id === capabilityId);
  if (!cap) return { error: `不在册的能力：${capabilityId}` };

  cap.status = verdict === 'adopt' ? 'adopted' : 'rejected';
  cap.tags = { ...(cap.tags ?? {}), stage: cap.status };
  (cap as Record<string, unknown>).humanDecision = {
    verdict,
    ...(reasonRaw ? { reason: reasonRaw } : {}),
    reviewedAt: new Date().toISOString().slice(0, 10),
  };
  cap.summary =
    verdict === 'adopt'
      ? `值得用：你自己确认采纳了${reasonRaw ? `——${reasonRaw}` : '。'}`
      : `不采纳：你自己给的结论${reasonRaw ? `——${reasonRaw}` : '。'}`;
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  spawnSync(process.execPath, [path.join(root, 'tools', 'aggregate.mjs')], { cwd: root, stdio: 'ignore' });
  return { ok: true, capabilityId, status: cap.status };
}

function saveHumanReview(body: Record<string, unknown>): { ok: true; trialId: string } | { error: string } {
  const trialId = String(body.trialId ?? '');
  const verdict = String(body.verdict ?? '');
  const reasonRaw = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!TRIAL_ID_RE.test(trialId)) return { error: '试用记录 id 不合法' };
  if (verdict !== 'up' && verdict !== 'down') return { error: '人评只能是 up（👍）或 down（👎）' };
  if (reasonRaw.length > REVIEW_REASON_MAX) return { error: `理由最多 ${REVIEW_REASON_MAX} 字（现在 ${reasonRaw.length}）` };

  const file = path.join(root, 'evals', 'trials', `${trialId}.json`);
  if (!existsSync(file)) return { error: `找不到这条试用记录：evals/trials/${trialId}.json` };

  // 类型直接用页面那份，避免两边字段漂移（这里只读它需要的几个字段）
  // 手工编辑过的 JSON 常带 UTF-8 BOM（记事本 / PowerShell 默认就这么存），先剥掉再解析
  const trial = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as Trial;
  const prev = trial.humanReview ?? null;
  // 只写人真的给过的东西：没写新理由时，若结论没变就保留他上次写的那句，否则不替他想一句
  const keepPrevReason = !reasonRaw && prev?.reason && prev.verdict === verdict;
  trial.humanReview = {
    mode: 'quick',
    verdict,
    ...(reasonRaw ? { reason: reasonRaw } : keepPrevReason ? { reason: prev.reason } : {}),
    scores: null,
    reviewedAt: new Date().toISOString(),
  };
  const judge = new Set([...(trial.judge ?? []), 'human']);
  trial.judge = [...judge];
  writeFileSync(file, JSON.stringify(trial, null, 2) + '\n', 'utf8');
  spawnSync(process.execPath, [path.join(root, 'tools', 'aggregate.mjs')], { cwd: root, stdio: 'ignore' });
  return { ok: true, trialId };
}

/** 页面里能直接跑评测的能力：已登记的 + 候选/已采纳目录里的（新拉进来的技能还没登记） */
function knownCapabilities(): { id: string; type: string; tool: string; hasConfig: boolean; registered: boolean }[] {
  const out = new Map<string, { id: string; type: string; tool: string; hasConfig: boolean; registered: boolean }>();
  for (const pool of ['candidates', 'adopted']) {
    for (const [type, dir] of Object.entries(TYPE_DIR)) {
      const base = path.join(root, pool, dir);
      if (!existsSync(base)) continue;
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        // 跳过存放许可等约定的下划线目录，以及评测工具自己的运行目录（<名字>-workspace）
        if (entry.name.startsWith('_') || entry.name.endsWith('-workspace')) continue;
        out.set(entry.name, {
          id: entry.name,
          type,
          tool: TYPE_TOOL[type],
          hasConfig: existsSync(path.join(base, entry.name, CONFIG_FILE[type])),
          registered: false,
        });
      }
    }
  }
  const capsFile = path.join(root, 'evals', 'capabilities.json');
  if (existsSync(capsFile)) {
    const doc = JSON.parse(readFileSync(capsFile, 'utf8')) as { capabilities?: { id: string; type?: string }[] };
    for (const cap of doc.capabilities ?? []) {
      const existing = out.get(cap.id);
      out.set(cap.id, {
        id: cap.id,
        type: cap.type ?? existing?.type ?? 'skill',
        tool: TYPE_TOOL[cap.type ?? 'skill'],
        hasConfig: existing?.hasConfig ?? false,
        registered: true,
      });
    }
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** 用途标签只认已登记的（新取值必须先由人确认，见 evals/schema.md） */
function registeredPurposes(): string[] {
  const tagsFile = path.join(root, 'evals', 'tags.json');
  if (!existsSync(tagsFile)) return [];
  const doc = JSON.parse(readFileSync(tagsFile, 'utf8')) as { dimensions?: { purpose?: { values?: Record<string, string> } } };
  return Object.keys(doc.dimensions?.purpose?.values ?? {});
}

interface EvalRun {
  id: string;
  status: 'running' | 'done';
  code: number | null;
  logFile: string;
  /** 展示用：跑的是哪个能力 / 哪套工具 / 哪条路（页面「正在评测」那一块靠这些信息） */
  name: string;
  tool: string;
  kind: EvalRunKind;
  /** 重复跑次数（同一条用例跑几遍）；1 = 不重复 */
  repeat: number;
  startedAt: number;
  finishedAt: number | null;
}

/** 这次跑的是哪条路：用户自己出题（ask）/ 一键评测（auto）/ 直接跑已有用例（run） */
type EvalRunKind = 'ask' | 'auto' | 'run';

const evalRuns = new Map<string, EvalRun>();

/** 跑完的任务在列表里留 2 小时（页面刷新 / 关弹窗后还能看到刚才那次的结果） */
const RUN_KEEP_MS = 2 * 60 * 60 * 1000;

function runScriptSync(script: string, args: string[]): { ok: boolean; code: number | null; log: string } {
  const res = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
  return { ok: res.status === 0, code: res.status, log: `${res.stdout ?? ''}${res.stderr ?? ''}`.trim() };
}

/** 日志尾巴：跑久了的日志可能好几 MB，只读最后一段（列表里只显示最后一行） */
function logTail(logFile: string, maxBytes = 8192): string {
  try {
    const size = statSync(logFile).size;
    const from = Math.max(0, size - maxBytes);
    const fd = openSync(logFile, 'r');
    const buf = Buffer.alloc(size - from);
    readSync(fd, buf, 0, buf.length, from);
    closeSync(fd);
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

function lastLine(text: string, max = 160): string {
  const line = text.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? '';
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/** 给页面看的一次运行（不含日志正文：正文走 /api/eval/run?id=，列表只要一行进度） */
function runInfo(run: EvalRun) {
  return {
    id: run.id,
    name: run.name,
    tool: run.tool,
    /** 工具的人话名字（TOOLS 里那份，别让页面再抄一套） */
    toolLabel: TOOL_LABELS[run.tool] ?? run.tool,
    kind: run.kind,
    repeat: run.repeat,
    status: run.status,
    code: run.code,
    startedAt: run.startedAt,
    durationMs: (run.finishedAt ?? Date.now()) - run.startedAt,
    tail: lastLine(logTail(run.logFile)),
  };
}

function runScriptAsync(script: string, args: string[], meta: { name: string; tool: string; kind: EvalRunKind; repeat?: number }): EvalRun {
  mkdirSync(EVAL_RUNS, { recursive: true });
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const logFile = path.join(EVAL_RUNS, `${id}.log`);
  writeFileSync(logFile, `$ node ${script} ${args.join(' ')}\n\n`, 'utf8');
  const run: EvalRun = {
    id,
    status: 'running',
    code: null,
    logFile,
    startedAt: Date.now(),
    finishedAt: null,
    ...meta,
    repeat: meta.repeat && meta.repeat > 1 ? meta.repeat : 1,
  };
  evalRuns.set(id, run);
  const fd = openSync(logFile, 'a');
  const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: ['ignore', fd, fd] });
  child.on('exit', (code) => {
    run.status = 'done';
    run.code = code;
    run.finishedAt = Date.now();
  });
  return run;
}

function evalApiPlugin(): Plugin {
  return {
    name: 'harness-lab:eval-api',
    configureServer(server) {
      const readBody = (req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> =>
        new Promise((resolve) => {
          let raw = '';
          req.on('data', (c) => (raw += c));
          req.on('end', () => {
            try {
              resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
            } catch {
              resolve({});
            }
          });
        });

      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith('/api/eval/') && url !== '/api/review') return next();
        const send = (code: number, body: unknown): void => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(body));
        };
        const nameArg = (body: Record<string, unknown>): string | null => {
          const name = String(body.name ?? '');
          return NAME_RE.test(name) ? name : null;
        };

        try {
          if (url === '/api/eval/status') {
            const skillUpBin =
              process.env.SKILL_UP_BIN ??
              ['D:\\learning\\deepseek-harness-workspace\\.tools\\skill-up\\skill-up.exe'].find((p) => existsSync(p)) ??
              null;
            let skillUpVersion = '';
            if (skillUpBin) {
              const v = spawnSync(skillUpBin, ['--version'], { encoding: 'utf8' });
              skillUpVersion = (v.stdout ?? '').trim();
            }
            const engines = engineInventory();
            const usable = engines.filter((e) => e.ok);
            return send(200, {
              tools: [
                {
                  id: 'skill-up',
                  label: TOOL_LABELS['skill-up'],
                  hint: !skillUpBin
                    ? '未安装：仍可导入别人跑好的 result.json'
                    : usable.length
                      ? `已就绪：${skillUpVersion}｜引擎 ${usable.map((e) => e.name).join(' / ')}`
                      : engines.length
                        ? `已就绪：${skillUpVersion}｜⚠ 引擎装了但都没登录（${engines.map((e) => e.name).join(' / ')}）`
                        : `已就绪：${skillUpVersion}｜⚠ 没有引擎（qodercli / claude_code / codex / qwen_code 都没装）`,
                },
                { id: 'promptfoo', label: TOOL_LABELS.promptfoo, hint: '用 npx 现场拉取；也可以只导入 out.json' },
                { id: 'mcp-probe', label: TOOL_LABELS['mcp-probe'], hint: '零依赖，直接起 server 按协议问一遍' },
              ],
              capabilities: knownCapabilities(),
              purposes: registeredPurposes(),
              engines,
            });
          }

          // 一颗按钮背后：能力名直接用，看着像链接就拉取＋自动设计用例，然后跑；
          // 带了 task（用户自己出的题）就按那段提示词跑 A/B（LLM 裁判）
          if (url === '/api/eval/auto' && req.method === 'POST') {
            const body = await readBody(req);
            const input = String(body.input ?? '').trim();
            if (!NAME_RE.test(input) && !SOURCE_RE.test(input)) {
              return send(400, { error: '填能力名，或 owner/repo / GitHub 链接' });
            }
            if (body.engine) return send(400, { error: '引擎内置（走内部网关），不需要指定' });
            const task = typeof body.task === 'string' ? body.task.trim() : '';
            if (task.length > 4000) return send(400, { error: `任务提示词最多 4000 字（现在 ${task.length}）` });
            const args = ['auto', '--input', input];
            if (task) args.push('--prompt', task);
            if (body.taskId && NAME_RE.test(String(body.taskId))) args.push('--task', String(body.taskId));
            const repeat = repeatArg(body);
            if (repeat > 1) args.push('--repeat', String(repeat));
            const run = runScriptAsync(TOOLS['skill-up'].script, args, {
              name: input.length > 60 ? `${input.slice(0, 60)}…` : input,
              tool: 'skill-up',
              kind: task ? 'ask' : 'auto',
              repeat,
            });
            return send(200, { runId: run.id, run: runInfo(run) });
          }

          if (url === '/api/review' && req.method === 'POST') {
            const body = await readBody(req);
            // scope=capability → 人的结论（采纳 / 不采纳）；默认是给某条试用打 👍/👎
            const result = body.scope === 'capability' ? saveCapabilityDecision(body) : saveHumanReview(body);
            return 'error' in result ? send(400, result) : send(200, result);
          }

          if (url === '/api/eval/data' && req.method === 'GET') {
            // 写完数据后页面**就地重读聚合产物**（不再整页 reload，抽屉状态得以保留）。
            // 读的就是页面原本打包进去的那一份，只是取个新鲜的。
            const file = path.join(root, 'evals', 'results', 'app-data.json');
            if (!existsSync(file)) return send(404, { error: '还没有聚合产物：先 npm run data' });
            try {
              return send(200, JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')));
            } catch (e) {
              return send(500, { error: `聚合产物读不了：${e instanceof Error ? e.message : String(e)}` });
            }
          }

          if (url === '/api/eval/market' && req.method === 'GET') {
            const params = new URL(req.url ?? '', 'http://localhost').searchParams;
            const q = (params.get('q') ?? '').trim();
            if (q.length < 2) return send(400, { error: '至少输入两个字，才好按名称 / 描述搜' });
            const limit = Math.min(Math.max(Number(params.get('limit') ?? 8) || 8, 1), 20);
            const result = await searchMarket(q, limit);
            return 'error' in result ? send(502, result) : send(200, result);
          }

          if (url === '/api/eval/draft-prompt' && req.method === 'POST') {
            // 「根据能力生成」提示词：读 SKILL.md 起草一条任务（交付物形态跟着能力走），
            // 只返回文本、不写文件、不跑评测——用户改完再点「提交」才真的跑。
            // 传 name = 已在册的能力；传 input（链接 / owner/repo）= 先拉进候选池再起草。
            const body = await readBody(req);
            let name = nameArg(body);
            let pulled: string | undefined;
            const input = String(body.input ?? '').trim();
            if (!name) {
              if (!SOURCE_RE.test(input)) return send(400, { error: '先填已在册的能力名，或 owner/repo / GitHub 链接' });
              const prep = spawnSync(process.execPath, [path.join(root, TOOLS['skill-up'].script), 'prepare', '--source', input, '--json'], {
                cwd: root,
                encoding: 'utf8',
              });
              const line = (prep.stdout ?? '').trim().split('\n').pop() ?? '';
              try {
                const parsed = JSON.parse(line) as { name?: string };
                if (!parsed.name) throw new Error('没拿到技能名');
                name = parsed.name;
                pulled = parsed.name;
              } catch {
                const why = `${prep.stderr ?? ''}${prep.stdout ?? ''}`.trim().split('\n').slice(-2).join(' ').slice(0, 300);
                return send(400, { error: why || '拉取这个来源失败（看 bridge 的输出）' });
              }
            }
            const res = spawnSync(process.execPath, [path.join(root, 'tools', 'gen-eval.mjs'), '--name', name, '--draft-prompt'], {
              cwd: root,
              encoding: 'utf8',
            });
            if (res.status !== 0) {
              const why = `${res.stderr ?? ''}${res.stdout ?? ''}`.trim().split('\n').slice(-3).join(' ').slice(0, 300);
              return send(400, { error: why || '生成提示词失败' });
            }
            return send(200, { prompt: (res.stdout ?? '').trim(), pulled });
          }

          if (url === '/api/eval/prepare' && req.method === 'POST') {
            const body = await readBody(req);
            const source = String(body.source ?? '');
            if (!SOURCE_RE.test(source)) return send(400, { error: '技能源要写成 owner/repo 或完整 URL' });
            const args = ['prepare', '--source', source];
            const name = nameArg(body);
            if (name) args.push('--name', name);
            return send(200, runScriptSync(TOOLS['skill-up'].script, args));
          }

          if (url === '/api/eval/run' && req.method === 'POST') {
            const body = await readBody(req);
            const tool = String(body.tool ?? '');
            const spec = TOOLS[tool];
            if (!spec) return send(400, { error: `未知工具：${tool}（支持 ${Object.keys(TOOLS).join(' / ')}）` });
            if (!OPEN_TOOLS.has(tool)) return send(400, { error: `${tool} 的评测入口暂未开放（先只开放技能）` });
            const name = nameArg(body);
            if (!name) return send(400, { error: '能力名不合法' });
            const args = tool === 'mcp-probe' ? ['--name', name] : ['run', '--name', name];
            if (tool === 'skill-up') {
              if (body.engine) args.push('--engine', String(body.engine));
              if (body.eval) args.push('--eval', String(body.eval));
              if (body.purpose) args.push('--purpose', String(body.purpose));
            }
            if (tool === 'promptfoo') {
              if (body.config) args.push('--config', String(body.config));
              if (body.purpose) args.push('--purpose', String(body.purpose));
            }
            if (tool === 'mcp-probe') {
              if (body.purpose) args.push('--purpose', String(body.purpose));
              if (body.inspector) args.push('--inspector');
            }
            const kind: EvalRunKind = body.eval && /ask/i.test(String(body.eval)) ? 'ask' : 'run';
            const repeat = repeatArg(body);
            if (repeat > 1) args.push('--repeat', String(repeat));
            const run = runScriptAsync(spec.script, args, { name, tool, kind, repeat });
            return send(200, { runId: run.id, run: runInfo(run) });
          }

          // 「正在评测」那一块的数据源：关掉弹窗、刷新页面都还能看到刚才发起的那次
          if (url === '/api/eval/runs' && req.method === 'GET') {
            const now = Date.now();
            const runs = [...evalRuns.values()]
              .filter((r) => r.status === 'running' || now - (r.finishedAt ?? r.startedAt) < RUN_KEEP_MS)
              .sort((a, b) => b.startedAt - a.startedAt)
              .slice(0, 20)
              .map(runInfo);
            return send(200, { runs });
          }

          if (url === '/api/eval/run' && req.method === 'GET') {
            const id = new URL(req.url ?? '', 'http://localhost').searchParams.get('id') ?? '';
            const run = evalRuns.get(id);
            if (!run) return send(404, { error: '没有这次运行' });
            return send(200, {
              status: run.status,
              code: run.code,
              // 时间信息一起给：进度窗口显示"已跑多久"必须用**服务端的开始时间**，
              // 不能拿"窗口是什么时候打开的"当起点（踩过：打开弹窗才开始计时）
              run: runInfo(run),
              log: existsSync(run.logFile) ? readFileSync(run.logFile, 'utf8') : '',
            });
          }

          if (url === '/api/eval/import' && req.method === 'POST') {
            const body = await readBody(req);
            const tool = String(body.tool ?? '');
            const spec = TOOLS[tool];
            if (!spec || !spec.needs || !OPEN_TOOLS.has(tool)) return send(400, { error: '导入只支持已开放的评测入口（目前是 skill-up）' });
            const name = nameArg(body);
            const result = String(body.result ?? '');
            if (!name || !result) return send(400, { error: '需要 name 与 result 路径' });
            return send(200, runScriptSync(spec.script, ['import', '--name', name, '--result', result, ...(body.purpose ? ['--purpose', String(body.purpose)] : [])]));
          }

          return send(404, { error: '未知接口' });
        } catch (err) {
          return send(500, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), evidenceDevPlugin(), evidenceBuildPlugin(), evalApiPlugin()],
  server: { port: 5183, open: false },
  build: { outDir: 'dist', sourcemap: false },
  test: {
    setupFiles: ['src/test-setup.ts'],
    // 页面逻辑的测试就近放在 src/；`tools/lib/` 里能单测的纯函数（读配置、解析来源）就近放 tools/
    include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.mjs'],
  },
});
