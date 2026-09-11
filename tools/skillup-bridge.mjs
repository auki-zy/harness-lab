#!/usr/bin/env node
/**
 * skill-up → 台账 的桥接（零依赖）。
 * 评测由 skill-up 跑（with_skill / without_skill 就是台账里的 A/B），本脚本只负责：
 *   读它的报告 → 映射成 evals/trials/*.json → 按我们的规则下结论 → 更新能力登记 → 聚合。
 *
 * 用法：
 *   node tools/skillup-bridge.mjs import --name ponytail --result <result.json 或 iteration 目录>
 *                  [--purpose <已登记用途>] [--description "<一句话说明>"] [--dry-run]
 *   node tools/skillup-bridge.mjs run    --name ponytail [--eval <eval.yaml>] [--engine <name>] [--skill-up <bin>]
 *   node tools/skillup-bridge.mjs status
 *
 * `run` 需要本机有 skill-up（用 --skill-up 或环境变量 SKILL_UP_BIN 指定）；
 * `import` 不需要——把别人跑好的 result.json 丢进来即可。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  CAPS,
  P,
  conclusionSummary,
  decide,
  fail,
  findCapability,
  log,
  readJson,
  rel,
  sourceDescription,
  sourceDescriptionLabel,
  trialId,
  upsertCapability,
  writeJson,
  writeTrial,
} from './lib/trial-record.mjs';
import { askAthen } from './lib/athen.mjs';
import { materializeRefs, skillMaterial, withRefSkills } from './lib/skill-content.mjs';
import {
  ATHEN_HOST,
  KNOWN_ENGINES,
  athenKey,
  athenModel,
  availableEngines,
  configuredModel,
  engineAuth,
  engineEnv,
  engineInventory,
  engineStatus,
} from './lib/engines.mjs';

const root = P();

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

const CONFIGS = { without_skill: 'A', with_skill: 'B' };

const EVAL_TEMPLATE = (taskId) => `schema_version: v1alpha1

# ${taskId} 的评测配置（skill-up 格式）。改完用：
#   skill-up validate evals/eval.yaml
#   skill-up run evals/eval.yaml            # benchmark 打开时会同时跑 with_skill / without_skill
# 用法与字段说明：https://alibaba.github.io/skill-up/zh/guide/writing-evals

environment:
  type: none
  env:
    TZ: UTC

mcp:
  servers: []

skills:
  - source: local_path
    path: .

engine:
  name: claude_code         # 换成你本机装了的引擎：claude_code / codex / qodercli / qwen_code
  model:
    name: auto

cases:
  files:
    - evals/cases/${taskId}.yaml
  defaults:
    timeout_seconds: 300
    max_turns: 3
    collect_artifacts:
      - "**/*.mjs"
      - "**/*.md"
      - "**/*.html"          # 视觉 / UI 类技能的交付物是页面：不收就摆不进 A/B 对照

benchmark:
  enabled: true             # 同时跑 with_skill / without_skill —— 台账里的 A/B 条件

judge:
  type: script
  script_path: evals/fixtures/scripts/check.sh
  timeout_seconds: 60

report:
  formats: [json, html]
  artifacts: [transcript]
`;

const CASE_TEMPLATE = (taskId) => `id: ${taskId}
title: 待改：这个用例要验什么
description: 一句话说明这个用例覆盖的能力点

input:
  prompt: |
    TODO：写给 agent 的任务说明（要具体、可判定；别写成"请你优化一下"这种）。

context:
  # 需要给 agent 初始文件时**直接内联**（最稳）：不要依赖工作区里那份文件保持不变——
  # agent 很爱自己造/清理测试数据，判分脚本读到的就不是你准备的输入了。
  # files:
  #   "input.txt": |
  #     第一行
  #     第二行
  # 也可以挂一个 fixture 目录（路径相对 skill 根）：repo_fixture: fixtures/repos/<名字>

constraints:
  timeout_seconds: 300
  max_turns: 3

expect:
  exit_code: 0

judge:
  type: script
  script_path: evals/fixtures/scripts/check.sh
  timeout_seconds: 60
`;

const CHECK_TEMPLATE = `#!/usr/bin/env bash
# 脚本裁判：退出码 0 = 通过，非 0 = 失败；cwd 是本用例的工作区根。
# 可用环境变量：$EVAL_FINAL_MESSAGE、$EVAL_EXIT_CODE、$EVAL_TRANSCRIPT_PATH（没有 transcript 时为空）
set -u

echo "TODO：这是模板脚本，还没写真正的检查 —— 先改成你的判定逻辑再跑。"
echo "工作区内容："
ls -1
echo "agent 最后一条消息：\${EVAL_FINAL_MESSAGE:0:200}"
exit 1
`;

/** 在一个仓库里定位 SKILL.md：先按给定子路径与常见布局找，再退回 GitHub 文件树搜索 */
async function resolveSkillPath(repo, sub, name) {
  const raw = (p) => `https://raw.githubusercontent.com/${repo}/main/${p}`;
  const explicit = [];
  if (sub) explicit.push(`${sub.replace(/^\/|\/$/g, '')}/SKILL.md`);
  explicit.push(`skills/${name}/SKILL.md`, `${name}/SKILL.md`, 'skills/SKILL.md', 'SKILL.md');
  for (const p of explicit) if (await fetchText(raw(p))) return p;

  const tree = await fetchText(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`);
  if (tree) {
    let paths = [];
    try {
      paths = (JSON.parse(tree).tree ?? []).map((t) => t.path).filter((p) => p.endsWith('SKILL.md'));
    } catch {
      paths = [];
    }
    if (paths.length === 1) return paths[0];
    const match = paths.find((p) => p.toLowerCase().includes(name.toLowerCase()));
    if (match) return match;
    if (paths.length > 1) {
      const dirs = [...new Set(paths.map((p) => path.posix.dirname(p)))];
      const [head, ...rest] = dirs;
      const sample = [`${repo}:${head}`, ...rest.slice(0, 3).map((d) => `${repo}:${d}`)];
      fail(
        `这个仓库里有 ${dirs.length} 个技能，得指明是哪一个：\n  ` +
          `${dirs.join('\n  ')}\n` +
          `  照这样填（把上面某条贴进输入框即可）：\n  ${sample.join('\n  ')}${rest.length > 3 ? `\n  …还有 ${rest.length - 3} 个` : ''}`,
      );
    }
  }
  return null;
}

async function fetchText(url) {
  const headers = { 'User-Agent': 'harness-lab' };
  // GitHub API 未登录是 60 次/小时：环境里有 token 就带上（DSH 会注入 DSH_GITHUB_TOKEN）
  const token = process.env.GITHUB_TOKEN ?? process.env.DSH_GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token && url.includes('api.github.com')) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  return res.ok ? res.text() : null;
}

/**
 * 把"用户手里那条链接"翻译成 `owner/repo + 子路径`。认这几种写法：
 *
 *   owner/repo                                  → 仓库根，自己去找 SKILL.md
 *   owner/repo:.claude/skills/foo               → 指定技能目录
 *   https://github.com/o/r                      → 同上
 *   https://github.com/o/r/tree/<ref>/<路径>     → 当作 o/r:<路径>
 *   https://github.com/o/r/blob/<ref>/<路径>/SKILL.md → 当作 o/r:<路径>（文件名是 SKILL.md 时去掉）
 *   https://raw.githubusercontent.com/o/r/<ref>/<路径>/SKILL.md → 同上
 *
 * 之前只认前三种，所以从浏览器地址栏复制来的 blob / tree 链接一律报"无法识别技能来源"。
 */
function parseSource(source) {
  const text = String(source ?? '').trim();

  const raw = text.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/[^/]+\/(.+)$/);
  if (raw) return { repo: `${raw[1]}/${raw[2]}`, sub: dirOfPath(raw[3]) };

  const gh = text.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/(?:blob|tree)\/[^/]+\/(.+?))?\/?$/);
  if (gh) return { repo: `${gh[1]}/${gh[2]}`, sub: gh[3] ? dirOfPath(gh[3]) : '' };

  const short = text.match(/^([^/\s]+)\/([^/\s:]+?)(?:\.git)?(?::(.+))?$/);
  if (short) return { repo: `${short[1]}/${short[2]}`, sub: short[3] ? dirOfPath(short[3]) : '' };

  fail(
    `无法识别技能来源：${source}\n` +
      '  支持：owner/repo、owner/repo:子路径、GitHub 链接（仓库页 / tree / blob 都行）、raw.githubusercontent.com 链接',
  );
}

/** 粘贴来的路径可能带着文件名（多数是 SKILL.md）：去掉最后一段，剩下的才是技能目录 */
function dirOfPath(p) {
  const clean = String(p).replace(/^\/+|\/+$/g, '');
  if (!clean) return '';
  const segs = clean.split('/').filter(Boolean);
  const last = segs[segs.length - 1] ?? '';
  return last.includes('.') ? segs.slice(0, -1).join('/') : clean;
}

/** 能力名：有子路径就用子路径最后一段（多技能仓库里这个名字比仓库名有信息量），否则用仓库名 */
function defaultName(repo, sub) {
  const raw = sub ? path.posix.basename(sub) : repo.split('/')[1];
  const name = raw.replace(/\.git$/, '').replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[-.]+/, '');
  if (!name) fail(`从 ${repo}${sub ? `:${sub}` : ''} 推不出能力名，请用 --name 指定`);
  return name;
}


/** LICENSE 原文 → 许可名（台账里只写一个短名：MIT / Apache-2.0 / …，认不出就留空） */
function licenseName(text) {
  const head = String(text ?? '').slice(0, 400);
  if (/MIT License/i.test(head)) return 'MIT';
  if (/Apache License\s*\n?\s*Version 2\.0/i.test(head)) return 'Apache-2.0';
  if (/BSD 3-Clause/i.test(head)) return 'BSD-3-Clause';
  if (/BSD 2-Clause/i.test(head)) return 'BSD-2-Clause';
  if (/ISC License/i.test(head)) return 'ISC';
  if (/GNU GENERAL PUBLIC LICENSE/i.test(head)) return /Version 3/i.test(head) ? 'GPL-3.0' : 'GPL-2.0';
  if (/Mozilla Public License/i.test(head)) return 'MPL-2.0';
  return '';
}

/**
 * 新拉进来的技能：**登记前把上游那句说明直译成中文**。
 *
 * 规则（`AGENTS.md` + `evals/schema.md` 第一节）是"第三方能力的说明＝上游描述字段的直译"，
 * 但自动兜底只会把英文原文原样贴进台账，页面上那一行就是一段英文（踩过两次：ui-ux-pro-max、brainstorming）。
 * 这里在跑评测之前用一次很短的中文直译把说明补上——**只在还没有说明时动手**，
 * 人写过的译文（以及本来就是中文的）一律不碰。
 */
async function ensureChineseDescription({ name, dir, purpose }) {
  if (!purpose) return; // 登记需要已登记的用途标签，没有就先不动（import 那一步会用自动兜底）
  const registered = readJson(CAPS).capabilities.find((c) => c.id === name);
  if (registered?.description) return;
  const raw = sourceDescription(dir);
  if (!raw || /[\u4e00-\u9fa5]/.test(raw)) return;

  let zh = '';
  try {
    const { text } = await askAthen({
      system:
        '你是技术译者。把用户给的这段「能力说明」直译成简洁的中文：只翻译，不总结、不评价、不添加原文没有的信息；' +
        '保留具体数字、清单与专有名词（如工具名、字段名）；直接输出一段纯文本，不要解释你在做什么。',
      user: raw,
      maxTokens: 800,
    });
    zh = text.trim();
  } catch (e) {
    log(`  ⚠ 说明直译没成功（${e.message}）：先留上游原文，之后再手工补`);
    return;
  }
  if (!zh || !/[\u4e00-\u9fa5]/.test(zh)) return;

  upsertCapability({
    id: name,
    type: 'skill',
    localPath: rel(dir),
    purpose,
    description: zh,
    descriptionSource: '上游 SKILL.md frontmatter 的 description 直译（模型翻译，未人工校对；原文见该文件）',
  });
  log('✔ 已把上游说明直译成中文（登记时用；不满意可以直接改 evals/capabilities.json）');
}

/**
 * 转发壳技能（`grill-me`：正文只有一句 `Call the Skill tool with "grilling".`）：
 * 把它**引用的那个技能**拉进 `refs/`，并挂进 eval 配置的 `skills:` 列表。
 *
 * 为什么必须挂进配置：skill-up 的 `skills: - path: .` 只装技能目录自己，B 侧就只拿到那句转发、
 * 而"grilling"根本没装 → B 必挂，比的成了"谁的技能不存在"（实测确认过：多条 local_path 会一起装，
 * with_skill 侧的可用技能里会同时出现壳和被引用的技能）。上游本来就是这么发布的（一个仓库里成套发），
 * 所以 B 侧一起装上才是它的真实用法。原样导入的 SKILL.md 不动，拉来的内容放 `refs/` 并记 `refs/SOURCES.json`。
 */
async function resolveRefSkills(capDir, source = null) {
  const sourceFile = path.join(capDir, 'SOURCE.json');
  const src = source ?? (existsSync(sourceFile) ? readJson(sourceFile) : null);
  const out = await materializeRefs({
    dir: capDir,
    source: src,
    fetchText,
    candidatesRoot: P('candidates', 'skills'),
    log,
  });
  if (!out.resolved.length) return out;
  for (const name of ['eval.yaml', 'eval.ask.yaml']) {
    const file = path.join(capDir, 'evals', name);
    if (!existsSync(file)) continue;
    const before = readFileSync(file, 'utf8');
    const after = withRefSkills(before, out.resolved.map((r) => r.name));
    if (after === before) continue;
    writeFileSync(file, after, 'utf8');
    log(`✔ ${rel(file)} 的 skills 列表补上被引用的技能：${out.resolved.map((r) => r.name).join('、')}`);
  }
  return out;
}

/** 拉一个技能进 candidates/，并按 skill-up 约定脚手架出 evals/ 模板（已存在就不动） */
async function prepare(args) {
  const source = args.source;
  if (!source) fail('prepare 需要 --source <owner/repo[:子路径]>');
  const { repo, sub } = parseSource(source);
  const name = args.name ?? defaultName(repo, sub);
  const taskId = args.task ?? 'example';

  const usedPath = await resolveSkillPath(repo, sub, name);
  if (!usedPath) fail(`在 ${repo} 里找不到 SKILL.md（可用 owner/repo:子路径 指定位置）`);
  const skillText = await fetchText(`https://raw.githubusercontent.com/${repo}/main/${usedPath}`);
  if (!skillText) fail(`读取 ${repo}/${usedPath} 失败`);
  const license = (await fetchText(`https://raw.githubusercontent.com/${repo}/main/LICENSE`)) ?? '';
  let commit = 'unknown';
  const commitRaw = await fetchText(`https://api.github.com/repos/${repo}/commits/main`);
  if (commitRaw) {
    try {
      commit = JSON.parse(commitRaw).sha ?? 'unknown';
    } catch {
      /* 忽略 */
    }
  }

  const capDir = P('candidates', 'skills', name);
  mkdirSync(capDir, { recursive: true });
  writeFileSync(path.join(capDir, 'SKILL.md'), skillText, 'utf8');
  if (license) writeFileSync(path.join(capDir, 'LICENSE.txt'), license, 'utf8');
  writeFileSync(path.join(capDir, 'COMMIT.txt'), `${commit}\n`, 'utf8');
  // 机器可读的来源（登记时 upsertCapability 会读它填 capabilities.json 的 source，省得每拉一个技能都手抄）
  writeFileSync(
    path.join(capDir, 'SOURCE.json'),
    `${JSON.stringify({ repo, path: usedPath, license: licenseName(license), commit }, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    path.join(capDir, 'SOURCE.md'),
    [
      '# 来源与许可',
      '',
      `- 上游仓库: https://github.com/${repo}`,
      `- 路径: ${usedPath}`,
      `- 导入时的上游提交: ${commit}`,
      `- 抓取日期: ${new Date().toISOString().slice(0, 10)}（原样导入，未改写 SKILL.md）`,
      license ? '- 许可: 见同目录 LICENSE.txt' : '- 许可: 上游仓库未提供 LICENSE（需人工确认后才能采纳）',
      '',
      '## 评测',
      '',
      '- 评测配置：`evals/eval.yaml`（skill-up 格式；benchmark 打开时同时跑 with_skill / without_skill）',
      '- 试用记录：`evals/trials/*.json`（由 `tools/skillup-bridge.mjs` 从 skill-up 报告导入）',
      '',
    ].join('\n'),
    'utf8',
  );

  const evalsDir = path.join(capDir, 'evals');
  const files = {
    [path.join(evalsDir, 'eval.yaml')]: EVAL_TEMPLATE(taskId),
    [path.join(evalsDir, 'cases', `${taskId}.yaml`)]: CASE_TEMPLATE(taskId),
    [path.join(evalsDir, 'fixtures', 'scripts', 'check.sh')]: CHECK_TEMPLATE,
  };
  for (const [file, content] of Object.entries(files)) {
    if (existsSync(file)) continue;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, 'utf8');
  }

  // 转发壳技能：把内容所在的那个技能一起拉下来（见 resolveRefSkills 的说明）
  await resolveRefSkills(capDir, { repo, path: usedPath, commit });

  log(`✔ 已导入 ${name} → ${rel(capDir)}（${usedPath}）`);
  log(`✔ 评测脚手架 → ${rel(evalsDir)}/（eval.yaml + cases/${taskId}.yaml + fixtures/scripts/check.sh）`);
  log('  提示：模板里的用例和检查脚本是占位的，改完先 skill-up validate 再 run。');
  return { name, capDir, evalsDir };
}

/**
 * 加一条用例：采纳需要"再次通过"，换一条不同的用例比重跑同一条更能说明问题。
 *   写 evals/cases/<task>.yaml 模板 + evals/fixtures/scripts/check-<task>.sh 模板，并把新用例挂进 eval.yaml 的 cases.files
 */
function addCase(args) {
  const name = args.name;
  const task = args.task;
  if (!name) fail('add-case 需要 --name <能力名>');
  if (!task) fail('add-case 需要 --task <用例 id>（camel/kebab 均可，会用作文件名）');
  const found = findCapability(name, 'skill');
  if (!found) fail(`找不到技能候选：candidates/skills/${name}`);
  const caseFile = path.join(found.dir, 'evals', 'cases', `${task}.yaml`);
  if (existsSync(caseFile)) fail(`用例已存在：${rel(caseFile)}（要用例 id 换个名字，或直接改它）`);

  const checkFile = path.join(found.dir, 'evals', 'fixtures', 'scripts', `check-${task}.sh`);
  const caseText = CASE_TEMPLATE(task)
    .replace('evals/fixtures/scripts/check.sh', `evals/fixtures/scripts/check-${task}.sh`)
    .replace('待改：这个用例要验什么', `待改：${task} 要验什么`);
  mkdirSync(path.dirname(caseFile), { recursive: true });
  writeFileSync(caseFile, caseText, 'utf8');
  if (!existsSync(checkFile)) {
    mkdirSync(path.dirname(checkFile), { recursive: true });
    writeFileSync(checkFile, CHECK_TEMPLATE, 'utf8');
  }

  const evalFile = path.join(found.dir, 'evals', 'eval.yaml');
  let hooked = false;
  if (existsSync(evalFile)) {
    const lines = readFileSync(evalFile, 'utf8').split('\n');
    const idx = lines.map((l) => /^\s*-\s*evals\/cases\/.+\.ya?ml\s*$/.test(l)).lastIndexOf(true);
    if (idx !== -1) {
      const indent = lines[idx].match(/^\s*/)?.[0] ?? '    ';
      lines.splice(idx + 1, 0, `${indent}- evals/cases/${task}.yaml`);
      writeFileSync(evalFile, lines.join('\n'), 'utf8');
      hooked = true;
    }
  }

  log(`✔ 新用例 → ${rel(caseFile)}（检查脚本 → ${rel(checkFile)}）`);
  log(hooked ? `✔ 已挂进 ${rel(evalFile)} 的 cases.files` : `⚠ 没找到 cases.files 列表，手动把 evals/cases/${task}.yaml 加进 ${rel(evalFile)}`);
  log(`  下一步：改这两个文件里的 TODO → skill-up validate ${rel(evalFile)} → 页面上「发起评测」跑一次`);
  return { caseFile, checkFile, hooked };
}

/** --result 可以给 result.json，也可以给包含它的 iteration 目录 */
function resolveResultPath(input) {
  const p = path.resolve(input);
  if (!existsSync(p)) fail(`找不到 ${input}`);
  if (statSync(p).isFile()) return { resultFile: p, iterationDir: path.dirname(p) };
  const direct = path.join(p, 'result.json');
  if (existsSync(direct)) return { resultFile: direct, iterationDir: p };
  const sub = readdirSync(p, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(p, e.name, 'result.json')))
    .map((e) => e.name)
    .sort();
  if (sub.length === 0) fail(`${input} 下没有 result.json`);
  const last = path.join(p, sub[sub.length - 1]);
  return { resultFile: path.join(last, 'result.json'), iterationDir: last };
}

/** 从用例目录里找"这一版交付了什么"（skill-up 会把 collect_artifacts 命中的文件放到 outputs/workspace） */
function collectArtifacts(iterationDir, caseId, config) {
  const wsDir = path.join(iterationDir, caseId, config, 'outputs', 'workspace');
  const out = { workspaceDir: wsDir, files: [], entry: null };
  if (!existsSync(wsDir)) return out;
  const walk = (dir, prefix = '') => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const rel2 = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, rel2);
      else out.files.push({ path: p, rel: rel2, bytes: statSync(p).size });
    }
  };
  walk(wsDir);
  // 技能自带的文件不算"这一版交付了什么"：B 侧工作区里那份 `.claude/skills/**` 常常比交付物还大，
  // 按大小挑就会挑到它（踩过：dedupe.mjs 被技能里的 test.mjs 顶掉，A/B 对照两边根本不是一回事）
  const delivered = out.files.filter((f) => !/(^|\/)\.(claude|git)\//.test(f.rel));
  // 程序类优先；只有页面 / 文档类交付物时才把它们当"产物"（视觉类技能的产物就是页面）
  const code = delivered.filter((f) => /\.(mjs|js|ts|tsx|py|sh|go|java|rb|rs)$/.test(f.rel) && !f.rel.endsWith('input.txt'));
  const pages = delivered.filter((f) => /\.html?$/i.test(f.rel));
  const pool = code.length ? code : pages.length ? pages : delivered;
  out.entry = pool.sort((a, b) => b.bytes - a.bytes)[0] ?? null;
  return out;
}

/**
 * 从 agent 的运行转录里数成本/效率维度的细节：工具调用次数与构成、单轮最高缓存命中量。
 * skill-up 会把引擎的转录放在 `outputs/agent/run/*.jsonl`（Claude Code 的事件流）。
 */
function collectAgentRun(iterationDir, caseId, config) {
  const runDir = path.join(iterationDir, caseId, config, 'outputs', 'agent', 'run');
  const tools = {};
  let cachedMax = 0;
  if (existsSync(runDir)) {
    for (const f of readdirSync(runDir).filter((x) => x.endsWith('.jsonl'))) {
      for (const line of readFileSync(path.join(runDir, f), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        for (const block of ev.message?.content ?? []) {
          if (block?.type === 'tool_use' && block.name) tools[block.name] = (tools[block.name] ?? 0) + 1;
        }
        const cached = ev.message?.usage?.cache_read_input_tokens;
        // 取单轮最高值而不是求和：每一轮都会重复读同一份缓存，求和会虚高
        if (typeof cached === 'number' && cached > cachedMax) cachedMax = cached;
      }
    }
  }
  return { tools, cachedMax };
}

function judgeTypes(evalConfigPath) {  if (!evalConfigPath || !existsSync(evalConfigPath)) return { auto: true, llm: false };
  const text = readFileSync(evalConfigPath, 'utf8');
  return { auto: true, llm: /type:\s*agent_judge/.test(text) };
}

function buildTrial({ name, result, iterationDir, evalConfigPath }) {
  const cases = result.case_results ?? [];
  const byConfig = { A: cases.filter((c) => c.configuration === 'without_skill'), B: cases.filter((c) => c.configuration === 'with_skill') };
  const onlyB = cases.filter((c) => c.configuration !== 'without_skill');
  const hasAB = byConfig.A.length > 0 && byConfig.B.length > 0;
  const side = (list, key) => (list.length ? list : key === 'B' ? onlyB : []);

  const summaryOf = (list) => {
    const passed = list.filter((c) => c.status === 'PASS').length;
    return { total: list.length, passed, passRate: list.length ? passed / list.length : 0 };
  };
  const a = side(byConfig.A, 'A');
  const b = side(byConfig.B, 'B');
  const sumA = summaryOf(a);
  const sumB = summaryOf(b);

  const artifactOf = (list, configName) => {
    const first = list[0];
    if (!first) return { entry: null, files: [] };
    const found = collectArtifacts(iterationDir, first.case_id, configName);
    return { entry: found.entry, files: found.files };
  };
  const artA = artifactOf(a, 'without_skill');
  const artB = artifactOf(b, 'with_skill');
  const bytesOf = (art) => (art.entry ? art.entry.bytes : 0);
  const kb = (n) => (n ? Math.round((n / 1024) * 10) / 10 : 0);

  const checks = (list, sum) => {
    const first = list[0];
    const g = first?.grading;
    const assertions = g?.assertion_results?.length ?? 0;
    const failedText = (g?.assertion_results ?? []).filter((x) => !x.passed).map((x) => x.text).join('; ');
    return [
      `用例 ${sum.passed}/${sum.total} 通过`,
      assertions ? `断言 ${g.summary?.passed ?? 0}/${g.summary?.total ?? assertions}` : '',
      first?.duration_ms !== undefined ? `耗时 ${(first.duration_ms / 1000).toFixed(1)}s` : '',
      failedText ? `未过：${failedText}` : '',
    ]
      .filter(Boolean)
      .join('；');
  };

  /**
   * 成本与效率维度（2026-09 起成为默认对照）：token / 耗时 / 轮次 / 工具调用 / 缓存命中。
   * 每条用例的 token 与耗时来自 result.json，工具调用与缓存来自引擎转录；同侧多条用例则累加
   * （缓存命中取单条最大值——同一份缓存每轮都会重读，累加会虚高）。
   */
  const costOf = (list, configName) => {
    const tokensIn = list.reduce((n, c) => n + (c.input_tokens ?? 0), 0);
    const tokensOut = list.reduce((n, c) => n + (c.output_tokens ?? 0), 0);
    const durationMs = list.reduce((n, c) => n + (c.duration_ms ?? 0), 0);
    const steps = list.reduce((n, c) => n + (c.turns ?? 0), 0);
    let toolCalls = 0;
    let cachedMax = 0;
    const tools = {};
    for (const c of list) {
      const run = collectAgentRun(iterationDir, c.case_id, configName);
      toolCalls += Object.values(run.tools).reduce((n, v) => n + v, 0);
      for (const [name, count] of Object.entries(run.tools)) tools[name] = (tools[name] ?? 0) + count;
      if (run.cachedMax > cachedMax) cachedMax = run.cachedMax;
    }
    return {
      tokensIn,
      tokensOut,
      tokensTotal: tokensIn + tokensOut,
      cachedMax,
      durationSec: durationMs ? Math.round(durationMs / 100) / 10 : null,
      steps: list.length ? steps : null,
      toolCalls,
      toolMix: Object.entries(tools)
        .sort((x, y) => y[1] - x[1])
        .map(([name, count]) => `${name} ${count}`)
        .join(' / '),
    };
  };
  const costA = costOf(a, 'without_skill');
  const costB = costOf(b, 'with_skill');
  /** 把一侧的数字塞进 {A,B} 形状，只在有数时加进去 */
  const perSide = (pick) => {
    const out = {};
    if (a.length) out.A = pick(costA);
    if (b.length) out.B = pick(costB);
    return out;
  };
  const hasTokens = costA.tokensTotal > 0 || costB.tokensTotal > 0;
  const hasTools = costA.toolCalls > 0 || costB.toolCalls > 0;
  const costMeasures = {
    ...(hasTokens ? { tokensIn: perSide((c) => c.tokensIn), tokensOut: perSide((c) => c.tokensOut), tokensTotal: perSide((c) => c.tokensTotal) } : {}),
    ...(costA.cachedMax || costB.cachedMax ? { tokensCached: perSide((c) => c.cachedMax) } : {}),
    ...(costA.durationSec || costB.durationSec ? { durationSec: perSide((c) => c.durationSec) } : {}),
    ...(a.length || b.length ? { steps: perSide((c) => c.steps) } : {}),
    ...(hasTools ? { toolCalls: perSide((c) => c.toolCalls), toolMix: perSide((c) => c.toolMix) } : {}),
  };

  const judgment = judgeTypes(evalConfigPath);
  // 没拿到 grading 的用例 = skill-up 自己没跑起来（报告里只有失败痕迹），不能算能力没做到
  const errorsB = b.filter((c) => !c.grading).length;
  // 报错原因照实写进结论，读者不用去翻日志（例：引擎没装 → exit 127）
  const errorNote = (cases.map((c) => c.error).find(Boolean) ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);
  // 一次运行可以覆盖多条用例：都记进 task.id（`a+b`），读者才知道这次试的是几个场景
  const caseIds = [...new Set(cases.map((c) => c.case_id).filter(Boolean))];
  const evidence = [rel(path.join(iterationDir, 'result.json')), rel(path.join(iterationDir, 'benchmark.json'))].filter((p) =>
    existsSync(P(p)),
  );
  for (const p of ['report.html', 'benchmark.md']) {
    const abs = path.join(iterationDir, p);
    if (existsSync(abs)) evidence.push(rel(abs));
  }
  for (const art of [artA, artB]) for (const f of art.files) evidence.push(rel(f.path));

  // 转发壳技能：B 侧其实装了两个技能（壳 + 它引用的那个）——这是判定条件的一部分，得写进记录
  const refs = skillMaterial(P('candidates', 'skills', name))
    .refs.filter((r) => r.resolved)
    .map((r) => r.name);

  const notes = [
    `引擎 ${result.engine_name ?? '?'} / 模型 ${result.model_name ?? '?'}`,
    hasAB ? '两边都跑了（with_skill / without_skill = B / A）' : '只跑了 with_skill（没有对照）',
    refs.length ? `B 侧同时装了 ${refs.join('、')}（这份 SKILL.md 是转发壳，内容实际来自那里）` : '',
    caseIds.length ? `用例 ${caseIds.length} 条：${caseIds.join('、')}` : '',
    artA.entry && artB.entry ? `产物大小 A ${kb(bytesOf(artA))} KB / B ${kb(bytesOf(artB))} KB` : '',
    `报告：${rel(iterationDir)}`,
  ]
    .filter(Boolean)
    .join('；');

  return {
    kind: hasAB ? 'controlled' : 'mock',
    conditions: [
      ...(a.length ? [{ name: 'A', withCapability: false, artifact: artA.entry ? rel(artA.entry.path) : undefined }] : []),
      ...(b.length ? [{ name: 'B', withCapability: true, artifact: artB.entry ? rel(artB.entry.path) : undefined }] : []),
    ],
    measures: {
      correctness: { ...(a.length ? { A: sumA.passRate } : {}), B: sumB.passRate },
      ...(artA.entry && artB.entry ? { sizeKB: { A: kb(bytesOf(artA)), B: kb(bytesOf(artB)) } } : {}),
      ...costMeasures,
      staticChecks: { ...(a.length ? { A: checks(a, sumA) } : {}), B: checks(b, sumB) },
      notes,
    },
    judge: judgment.llm ? ['auto', 'llm'] : ['auto'],
    evidence: [...new Set(evidence)],
    task: {
      id: caseIds.join('+') || 'skill-up',
      fixture: rel(iterationDir),
      description: `${cases[0]?.title ?? 'skill-up 用例'}（skill-up ${result.schema_version ?? ''}：${caseIds.length || 1} 条用例，每条都跑 with_skill / without_skill）`,
    },
    model: `${result.engine_name ?? '?'} / ${result.model_name ?? '?'}`,
    hasAB,
    sums: { A: sumA, B: sumB },
    errorsB,
    errorNote,
  };
}

function importResult({ name, resultInput, evalConfigPath, dryRun, purpose, description, descriptionSource }) {
  const found = findCapability(name, 'skill');
  const capDir = found?.dir ?? null;
  const { resultFile, iterationDir } = resolveResultPath(resultInput);
  const result = readJson(resultFile);
  const built = buildTrial({ name, result, iterationDir, evalConfigPath: evalConfigPath ?? (capDir ? path.join(capDir, 'evals', 'eval.yaml') : null) });
  // 判定规则只此一处（tools/lib/trial-record.mjs），各 bridge 不另写一套
  // 引擎是 stub（离线自检用的假引擎）时，这条记录只能证明链路通，不能当采纳依据
  const selfCheck = /stub/i.test(String(result.engine_name ?? ''));
  const verdict = decide({
    passRateB: built.sums.B.passRate,
    totalB: built.sums.B.total,
    errorsB: built.errorsB,
    errorNote: built.errorNote,
    selfCheck,
    name,
    extra: built.hasAB
      ? `对照 A ${built.sums.A.passed}/${built.sums.A.total}`
      : '本次没有对照',
  });

  const trial = {
    trialId: trialId(name, 'skillup'),
    capability: { id: name, type: 'skill' },
    kind: built.kind,
    task: built.task,
    conditions: built.conditions,
    measures: built.measures,
    judge: built.judge,
    humanReview: null,
    verdict,
    evidence: built.evidence,
    model: built.model,
    date: new Date().toISOString().slice(0, 10),
    recordedAt: new Date().toISOString(),
    source: { tool: 'skill-up', report: rel(resultFile) },
    selfCheck,
  };

  log(`—— 映射结果（${name}）`);
  log(`  方式：${trial.kind}｜条件：${trial.conditions.map((c) => c.name).join('/')}｜判定：${trial.judge.join('+')}`);
  log(`  正确性：${JSON.stringify(trial.measures.correctness)}`);
  log(`  检查：A ${trial.measures.staticChecks.A ?? '—'}`);
  log(`        B ${trial.measures.staticChecks.B}`);
  log(`  成本与效率：token ${JSON.stringify(trial.measures.tokensTotal ?? {})}（入 ${JSON.stringify(trial.measures.tokensIn ?? {})} / 出 ${JSON.stringify(trial.measures.tokensOut ?? {})}）`);
  log(`              耗时 ${JSON.stringify(trial.measures.durationSec ?? {})} 秒｜轮次 ${JSON.stringify(trial.measures.steps ?? {})}｜工具调用 ${JSON.stringify(trial.measures.toolCalls ?? {})}｜缓存命中 ${JSON.stringify(trial.measures.tokensCached ?? {})}`);
  log(`  结论：${verdict.decision} —— ${verdict.reason}`);

  if (dryRun) {
    log('（--dry-run：没有写任何文件）');
    return { trial, wrote: false };
  }

  // 登记交给共用逻辑（能力不在册时必须给一个已登记的用途标签）
  upsertCapability({
    id: name,
    type: 'skill',
    localPath: capDir ? rel(capDir) : '',
    purpose,
    description,
    descriptionSource,
    autoDescription: sourceDescription(capDir) ?? undefined,
    autoDescriptionSource: sourceDescriptionLabel(capDir) ?? undefined,
    decision: verdict.decision,
    summary: conclusionSummary(verdict.decision, verdict.reason, {
      adopt: '值得用：skill-up 可复核试用连续全过，用例无退步。',
      ready: '机器判定达标：可复核试用连续全过、用例无退步——采纳与否等你给结论。',
      hold: '待观察：skill-up 一次可复核试用全过，再来一次通过即可采纳。',
    }),
    evidenceLine: `${trial.date} skill-up(${trial.task.id})：${built.hasAB ? `A ${built.sums.A.passed}/${built.sums.A.total} / ` : ''}B ${built.sums.B.passed}/${built.sums.B.total} → ${verdict.decision}`,
    stage: verdict.decision === 'adopt' ? 'adopted' : undefined,
  });
  const trialFile = writeTrial(trial);
  return { trial, trialFile, wrote: true };
}

/**
 * 把已有 trial 的"指标"按最新映射重算一遍（报告还在的情况下）。
 * 用途：映射升级（例：新增 token / 耗时 / 工具调用维度）后，老记录不用重跑评测也能补齐数字。
 * 只改 measures / conditions / evidence / task / model / judge，**不动结论与人评**。
 */
function remapTrial(args) {
  const trialId = args.trial;
  if (!trialId) fail('remap 需要 --trial <trialId>');
  if (!args.result) fail('remap 需要 --result <result.json|iteration 目录>');
  const trialFile = path.join(P('evals', 'trials'), `${trialId}.json`);
  if (!existsSync(trialFile)) fail(`找不到试用记录：${rel(trialFile)}`);
  const trial = readJson(trialFile);
  const name = trial?.capability?.id;
  if (!name) fail(`${trialId} 里没有 capability.id`);
  const found = findCapability(name, 'skill');
  const { resultFile, iterationDir } = resolveResultPath(args.result);
  const result = readJson(resultFile);
  const built = buildTrial({
    name,
    result,
    iterationDir,
    evalConfigPath: args.eval ?? (found ? path.join(found.dir, 'evals', 'eval.yaml') : null),
  });

  const before = JSON.stringify(trial.measures);
  trial.measures = built.measures;
  trial.conditions = built.conditions;
  trial.evidence = built.evidence;
  trial.task = built.task;
  trial.model = built.model;
  trial.judge = [...new Set([...(trial.judge ?? []), ...built.judge])];
  writeJson(trialFile, trial);

  const added = Object.keys(built.measures).filter((k) => !before.includes(`"${k}"`));
  log(`✔ 重算完成：${rel(trialFile)}`);
  log(`  新增维度：${added.length ? added.join('、') : '（无）'}`);
  log(`  token：${JSON.stringify(built.measures.tokensTotal ?? {})}｜耗时：${JSON.stringify(built.measures.durationSec ?? {})}｜轮次：${JSON.stringify(built.measures.steps ?? {})}｜工具调用：${JSON.stringify(built.measures.toolCalls ?? {})}`);
  try {
    execFileSync(process.execPath, [P('tools', 'aggregate.mjs')], { stdio: 'inherit' });
  } catch {
    log('⚠ 聚合没跑成功，稍后手动 `npm run data`');
  }
  return trial;
}

/** 评测配置是不是还停在脚手架占位状态（判分脚本里还写着 TODO 就直接跑不了） */
function needsEvalDesign(dir) {
  const evalFile = path.join(dir, 'evals', 'eval.yaml');
  if (!existsSync(evalFile)) return true;
  const scriptsDir = path.join(dir, 'evals', 'fixtures', 'scripts');
  if (!existsSync(scriptsDir)) return true;
  const scripts = readdirSync(scriptsDir).filter((f) => f.endsWith('.sh'));
  if (scripts.length === 0) return true;
  return scripts.every((f) => readFileSync(path.join(scriptsDir, f), 'utf8').includes('TODO：这是模板脚本'));
}

/** 读取自动设计留下的 spec（里面有模型判定的用途标签与设计理由） */
function designSpec(dir) {
  const casesDir = path.join(dir, 'evals', 'cases');
  if (!existsSync(casesDir)) return null;
  const specs = readdirSync(casesDir).filter((f) => f.endsWith('.spec.json'));
  if (specs.length === 0) return null;
  try {
    return readJson(path.join(casesDir, specs[specs.length - 1]));
  } catch {
    return null;
  }
}

/**
 * 一句话跑完：给"能力名"或"来源链接"，剩下的都自动做掉。
 *   1) 名字能对上候选/已采纳 → 直接用；
 *   2) 对不上、但看着像 owner/repo 或链接 → 拉取进候选池；
 *   3) 给了 `--prompt "<用户的任务>"` → 把这段提示词原样落成用例，跑 A（只给提示词）/ B（提示词 + 技能），LLM 裁判判；
 *   4) 没给 prompt 且没有可用的评测配置（或判分脚本还是占位模板）→ 按 SKILL.md 自动设计针对性用例；
 *   5) 校验 → 跑 → 落账。
 * 这就是页面上那颗「开始评测」按钮背后做的事。
 */
async function autoEval(args) {
  const input = String(args.input ?? '').trim();
  if (!input) fail('auto 需要 --input <能力名 | owner/repo[:子路径] | GitHub 链接>');

  let name = input;
  let found = findCapability(input, 'skill');
  if (!found) {
    // 名字从"来源"里推：owner/repo:子路径 → 子路径最后一段；blob/tree 链接也照此（以前会推成 "SKILL.md"）
    const parsed = parseSource(input);
    name = defaultName(parsed.repo, parsed.sub);
    if (args['dry-run']) {
      const skillPath = await resolveSkillPath(parsed.repo, parsed.sub, name);
      log(`来源解析：${parsed.repo}${parsed.sub ? `（子路径 ${parsed.sub}）` : '（仓库根）'}`);
      log(`技能名：${name}`);
      log(skillPath ? `找到 SKILL.md：${skillPath}` : '✗ 没找到 SKILL.md');
      log('（dry-run：没拉取、没设计用例、没跑评测）');
      if (!skillPath) process.exit(1);
      return;
    }
    log(`▶ 「${input}」不在候选池里，按来源拉取…（技能名先按 ${name}）`);
    const prepared = await prepare({ source: input, name, task: args.task });
    name = prepared.name;
    found = findCapability(name, 'skill');
    if (!found) fail(`拉取后仍找不到技能：candidates/skills/${name}`);
    // 刚拉进来的技能：说明还是上游那句英文，先直译成中文再登记（规则见 ensureChineseDescription）
    await ensureChineseDescription({ name, dir: found.dir, purpose: args.purpose ?? designSpec(found.dir)?.purpose });
  } else if (args['dry-run']) {
    log(`「${input}」已经在候选池里：${name}（dry-run：什么都不做）`);
    return;
  }

  // 用户自己出的题：提示词原样落成用例，A（只给提示词）/ B（提示词 + 技能）由 LLM 裁判判
  if (args.prompt) {
    const registered = readJson(CAPS).capabilities.some((c) => c.id === name);
    if (!registered) {
      // 还没登记：先自动设计一次，主要是为了拿到用途标签（登记要求），用例本身这次不跑
      log('▶ 这个技能还没登记，先自动设计一次（用来登记用途标签；这次的用例不跑）');
      const design = spawnSync(process.execPath, [P('tools', 'gen-eval.mjs'), '--name', name], { stdio: 'inherit', env: process.env });
      if (design.status !== 0) fail('自动设计失败（看上面的输出）');
    }
    const ask = spawnSync(
      process.execPath,
      [P('tools', 'gen-eval.mjs'), '--name', name, '--from-prompt', String(args.prompt), ...(args.task ? ['--task', String(args.task)] : [])],
      { stdio: 'inherit', env: process.env },
    );
    if (ask.status !== 0) fail('把自己的提示词落成用例失败（看上面的输出）');
    const askEval = path.join(found.dir, 'evals', 'eval.ask.yaml');
    if (!existsSync(askEval)) fail(`没找到 ${rel(askEval)}`);
    return runSkillUp({ ...args, name, eval: askEval, purpose: args.purpose ?? designSpec(found.dir)?.purpose });
  }

  if (!args.engine && needsEvalDesign(found.dir)) {
    log('▶ 还没有可用的评测配置，按 SKILL.md 自动设计针对性用例…');
    const res = spawnSync(process.execPath, [P('tools', 'gen-eval.mjs'), '--name', name, ...(args.task ? ['--task', args.task] : [])], {
      stdio: 'inherit',
      env: process.env,
    });
    if (res.status !== 0) fail('自动设计用例失败（看上面的输出）；也可以手工写 evals/cases/*.yaml 后再跑');
  }

  const evalConfig = path.join(found.dir, 'evals', 'eval.yaml');
  const skillUp = findSkillUp(args);
  if (skillUp) {
    const check = spawnSync(skillUp, ['validate', evalConfig], { encoding: 'utf8' });
    if (check.status !== 0) {
      fail(`评测配置没通过校验，先修好再跑：\n${(check.stdout ?? '') + (check.stderr ?? '')}`);
    }
    log('✔ 评测配置校验通过');
  }

  const spec = designSpec(found.dir);
  const purpose = args.purpose ?? spec?.purpose;
  if (purpose) log(`  用途标签：${purpose}${spec?.purpose === purpose ? '（自动判定）' : ''}`);
  return runSkillUp({ ...args, name, purpose });
}

function findSkillUp(args) {
  const bin = args['skill-up'] ?? process.env.SKILL_UP_BIN;
  if (bin && existsSync(bin)) return bin;
  const guess = 'D:\\learning\\deepseek-harness-workspace\\.tools\\skill-up\\skill-up.exe';
  if (existsSync(guess)) return guess;
  return null;
}

/** skill-up 认识的引擎 → 本机命令名（用它做跑前检查：引擎没装的话，skill-up 会以 exit 127 把每个用例判成 ERROR） */
function preflightEngine(evalConfig, override) {
  const engine = engineStatus(evalConfig, override);
  const prefix = '✗ 跑前检查未通过 — ';
  if (!engine.name) {
    fail(`${prefix}评测配置里没写 engine.name：${rel(evalConfig)}\n用 --engine <名字> 指定，或补上 engine.name（可用：${Object.keys(KNOWN_ENGINES).join(' / ')}）。`);
  }
  if (!engine.path) {
    fail(
      [
        `${prefix}引擎「${engine.name}」在本机不可用：找不到命令 ${engine.bin}，这次没有跑、也没有写试用记录。`,
        `skill-up 自己不做推理，它调用本机的 agent CLI 干活；引擎缺失时每个用例都会以 exit 127 变成 ERROR（报告照出，结论只能是 retry）。`,
        engine.available.length
          ? `本机已装的引擎：${engine.available.join(' / ')} —— 用 --engine <其中一个> 重跑，或改 ${rel(evalConfig)} 的 engine.name。`
          : `本机没有任何 skill-up 认识的引擎（${Object.keys(KNOWN_ENGINES).join(' / ')}）：先装一个（如 codex / claude），或在 ${rel(evalConfig)} 里把 engine.name 写成你自己有的命令。`,
      ].join('\n'),
    );
  }
  // 装了不等于能用：没登录的引擎会以 401 / "Not logged in" 失败，同样是白跑一轮
  const auth = engineAuth(engine.name);
  if (!auth.ok) {
    const others = engine.available.filter((n) => n !== engine.name && engineAuth(n).ok);
    fail(
      [
        `${prefix}引擎「${engine.name}」装了，但用不了：${auth.detail}，这次没有跑、也没有写试用记录。`,
        `（跑前检查都是本地命令，不花额度；检查方式：${engine.name === 'claude_code' ? 'claude auth status' : 'codex login status'}）`,
        others.length ? `也可以换成本机已登录的引擎：--engine ${others.join(' / --engine ')}。` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  log(`🔧 引擎 ${engine.name}（${engine.path}）｜${auth.detail}`);
  return engine;
}

function runSkillUp(args) {
  const name = args.name;
  if (!name) fail('run 需要 --name <能力名>');
  const found = findCapability(name, 'skill');
  if (!found) fail(`找不到技能候选：candidates/skills/${name}`);
  const bin = findSkillUp(args);
  if (!bin) fail('找不到 skill-up：用 --skill-up <路径> 或设 SKILL_UP_BIN 环境变量（下载见 README）');
  const evalConfig = args.eval ?? path.join(found.dir, 'evals', 'eval.yaml');
  if (!existsSync(evalConfig)) fail(`找不到评测配置：${evalConfig}`);
  const engine = preflightEngine(evalConfig, args.engine);
  const argv = ['run', evalConfig];
  if (args.engine) argv.push('--engine', args.engine);
  // 走内部网关时由我们给出模型名：eval.yaml 里写的 `auto` 对 Claude Code 是无效值，别透传下去
  const model = args.model ?? (/^(auto)?$/i.test(configuredModel(evalConfig)) && athenKey() ? athenModel() : null);
  if (model) argv.push('--model', model);
  if (args.parallelism) argv.push('--parallelism', args.parallelism);
  // 网关模式：给子进程注入 ANTHROPIC_BASE_URL / token，Claude Code 就不再要官方登录
  const extraEnv = engineEnv(engine.name);
  if (extraEnv) log(`🌐 ${engine.name} 走内部网关 ${ATHEN_HOST}（模型 ${extraEnv.ANTHROPIC_MODEL}）`);
  // 跑之前先记下已有的 iteration：跑完只能导入**这次新产生**的那一轮。
  // （踩过：配置校验失败时 skill-up 退出码非 0、什么都没跑，而"取最后一个 iteration"会把上一轮的旧报告当成新结果再记一遍。）
  const wsRoot = path.join(path.dirname(found.dir), `${name}-workspace`);
  const before = existsSync(wsRoot) ? new Set(readdirSync(wsRoot).filter((d) => d.startsWith('iteration-'))) : new Set();
  log(`▶ ${bin} ${argv.join(' ')}`);
  const res = spawnSync(bin, argv, { cwd: root, stdio: 'inherit', env: extraEnv ? { ...process.env, ...extraEnv } : process.env });
  const iters = existsSync(wsRoot) ? readdirSync(wsRoot).filter((d) => d.startsWith('iteration-')).sort() : [];
  const fresh = iters.filter((d) => !before.has(d));
  if (fresh.length === 0) {
    fail(
      [
        `✗ skill-up 没有产生新的报告（退出码 ${res.status}），这次没有写试用记录。`,
        '  常见原因：配置校验没过（看上面的 validation errors）、引擎/凭据没就绪、或用例被过滤掉了。',
        `  已有报告仍在 ${rel(wsRoot)}/；修好配置再来一次。`,
      ].join('\n'),
    );
  }
  if (res.status !== 0) log(`⚠️ skill-up 退出码 ${res.status}（报告已生成，继续导入）`);
  // 注意用 evalConfigPath 这个键名：importResult 读的是它（踩过——传 args.eval 会让判分方检测一直读主配置 eval.yaml）
  return importResult({ ...args, evalConfigPath: evalConfig, resultInput: path.join(wsRoot, fresh[fresh.length - 1]) });
}

function status(args) {
  const doc = readJson(CAPS);
  const bin = findSkillUp(args);
  const available = availableEngines();
  log(`skill-up：${bin ?? '（没找到，只能走 import）'}`);
  if (bin) {
    const v = spawnSync(bin, ['--version'], { encoding: 'utf8' });
    log(`  版本：${(v.stdout ?? '').trim()}`);
  }
  if (!available.length) {
    log(`  引擎：本机一个都没装（${Object.keys(KNOWN_ENGINES).join(' / ')}）——跑评测前先装一个`);
  } else {
    for (const engine of engineInventory()) {
      log(`  引擎：${engine.name} ${engine.ok ? '✔' : '✗'} ${engine.detail}`);
    }
  }
  for (const cap of doc.capabilities) {
    const found = findCapability(cap.id);
    const evalYaml = found && existsSync(path.join(found.dir, 'evals', 'eval.yaml'));
    const engine = evalYaml ? engineStatus(path.join(found.dir, 'evals', 'eval.yaml')) : null;
    const wsRoot = found ? path.join(path.dirname(found.dir), `${cap.id}-workspace`) : null;
    const iters = wsRoot && existsSync(wsRoot) ? readdirSync(wsRoot).filter((d) => d.startsWith('iteration-')).length : 0;
    log(
      `${cap.id.padEnd(18)} ${String(cap.status).padEnd(9)} skill-up 配置：${evalYaml ? '有' : '（无）'}` +
        (engine ? `（引擎 ${engine.name || '未写'}${engine.name ? (engine.path ? ' 可用' : ' 不可用') : ''}）` : '') +
        `｜已有报告：${iters} 轮`,
    );
  }
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

if (command === 'import') {
  const name = args.name;
  if (!name) fail('import 需要 --name <能力名>');
  if (!args.result) fail('import 需要 --result <result.json 或 iteration 目录>');
  importResult({ name, resultInput: args.result, evalConfigPath: args.eval, dryRun: Boolean(args['dry-run']), purpose: args.purpose, description: args.description, descriptionSource: args['description-source'] });
} else if (command === 'run') {
  runSkillUp(args);
} else if (command === 'add-case') {
  addCase(args);
} else if (command === 'remap') {
  remapTrial(args);
} else if (command === 'prepare') {
  // 只拉取 + 脚手架，不设计用例、不跑评测：页面「根据能力生成」要先用它把来源读进来
  const source = args.source ?? args.input;
  if (!source) fail('prepare 需要 --source <owner/repo[:子路径] | GitHub 链接>');
  const { repo, sub } = parseSource(source);
  const prepared = await prepare({ source, name: args.name, task: args.task });
  if (args.json) process.stdout.write(`${JSON.stringify({ name: prepared.name, repo, sub, dir: rel(prepared.capDir) })}\n`);
} else if (command === 'refs') {
  // 转发壳技能补内容：老候选（本功能之前导入的）也能补上，不用重新拉一遍
  const name = args.name;
  if (!name) fail('refs 需要 --name <能力名>');
  const found = findCapability(name, 'skill');
  if (!found) fail(`找不到技能候选：candidates/skills/${name}`);
  const out = await resolveRefSkills(found.dir);
  if (!out.names.length) log(`${name} 没有引用别的技能（正文自己就是内容），不用处理`);
  else if (!out.resolved.length) log(`⚠ ${name} 引用了 ${out.unresolved.join('、')}，但没拉到——B 侧仍然只有那个壳，先别跑对照`);
  else log(`✔ ${name} 的被引用技能已就位：${out.resolved.map((r) => r.name).join('、')}`);
} else if (command === 'auto') {
  await autoEval(args);
} else if (command === 'status') {
  status(args);
} else {
  log('用法：');
  log('  node tools/skillup-bridge.mjs auto      --input <能力名|owner/repo|链接> [--prompt "<你的任务提示词>"] [--task <用例 id>] [--dry-run]   # 一句话：拉取 →（出题）→ 跑 → 落账');
  log('  node tools/skillup-bridge.mjs prepare   --source <owner/repo|链接> [--name <能力名>] [--json]   # 只拉取 + 脚手架（不设计用例、不跑）');
  log('  node tools/skillup-bridge.mjs import   --name <能力> --result <result.json|iteration 目录> [--purpose <已登记用途>] [--description "<一句话说明>"] [--description-source "<这句话哪来的>"] [--dry-run]');
  log('  node tools/skillup-bridge.mjs run      --name <能力> [--eval <eval.yaml>] [--engine <name>] [--skill-up <bin>]');
  log('  node tools/skillup-bridge.mjs add-case --name <能力> --task <用例 id>    # 加第二条用例（第二次试用更值得换用例）');
  log('  node tools/skillup-bridge.mjs refs     --name <能力>                  # 转发壳技能：把它引用的技能拉进 refs/ 并挂进 eval 配置');
  log('  node tools/skillup-bridge.mjs remap    --trial <trialId> --result <报告>  # 按最新映射重算指标（不动结论与人评）');
  log('  node tools/skillup-bridge.mjs status');
  process.exit(command ? 1 : 0);
}
