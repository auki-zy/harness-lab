#!/usr/bin/env node
/**
 * 按技能的描述自动出一套"有针对性的 mock 评测"。
 *
 * 分工（关键）：
 *   - **模型只管设计**：读 SKILL.md，给出一个能验证这个技能核心主张的小任务 + 若干可判定的用例（纯 JSON）；
 *   - **我们只管生成**：把 JSON 渲染成 skill-up 的 case.yaml 与判分 shell（脚本里不出现模型写的代码），
 *     并把踩过的坑固化进去——判分脚本自带输入、临时文件用工作区相对路径。
 *
 * 用法：
 *   node tools/gen-eval.mjs --name <技能名> [--task <用例 id>] [--dry-run] [--print]
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { P, fail, findCapability, log, readJson, registeredPurposes, rel } from './lib/trial-record.mjs';
import { askAthen, extractJson, resolveTimeout } from './lib/athen.mjs';
import { normalizeDeliverable } from './lib/deliverable.mjs';
import { expectFilesFromPrompt } from './lib/artifacts.mjs';
import { athenModel } from './lib/engines.mjs';
import { refDirName, skillMaterial, thinReason, withRefSkills } from './lib/skill-content.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) {
    const key = process.argv[i].slice(2);
    const val = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
    args[key] = val;
  }
}

/**
 * 交付物形态规则（自动设计与"起草提示词"共用一份，别写两套说法）。
 * 这是 2026-09-11 的一条真实反馈换来的：ui-ux-pro-max 是 UI 技能，自动出的题却是两个 mjs
 * 命令行程序——用户的原话是"不知道干嘛用"。**技能管什么形态，交付物就该是什么形态。**
 */
const DRAFT_DELIVERABLE_RULE = [
  '看 SKILL.md 管的是什么：',
  '  · 管**界面 / 视觉 / 排版 / 交互 / 设计系统**（UI、UX、前端视觉、图表、幻灯片）→ 交付**一个自包含的 `index.html`**',
  '    （内联 CSS/JS，不装依赖、不跑构建），浏览器打开就能看到效果；别人一眼能对比两版好不好看。',
  '  · 管**前端组件 / 框架写法**（React、Vue、Svelte、组件库、hooks、状态管理、渲染性能）→ 交付**组件源码文件本身**，',
  '    路径跟着任务语境走（`src/Dashboard.tsx`、`src/Card.vue` 都行），**保持框架原有的后缀**；',
  '    需要看效果时另附一个最小可打开的页面。**绝对不要把它降级成 `impl.mjs` 那种命令行小程序**——',
  '    那测的就不是这个技能的写法了（踩过：react-best-practices 被出成"写一个 Node 脚本验并行/去重"，产物跟 React 无关）。',
  '  · 管**代码质量 / 写法 / 精简 / 性能**（命令行、算法、脚本、纯逻辑）→ 交付**一个小程序**（`xxx.mjs`，只用 Node 自带能力），',
  '    跑起来、看退出码与 stdout 就能判。',
  '  · 管**流程 / 计划 / 拆解 / 文档** → 交付**一份 markdown 或 JSON**（结构固定，能逐字段检查）。',
].join('\n');

const SYSTEM = `你是评测设计者。给你一个 SKILL.md（某个 AI 编码技能的说明书），你要设计一套**小而可判定**的 mock 评测，验证这个技能真正主张的能力。

**先判断这个技能是什么形态，再决定交付物**（这一步最容易做错）：
${'' /* 规则见 DRAFT_DELIVERABLE_RULE，和起草提示词共用一份 */}
${DRAFT_DELIVERABLE_RULE}
出一堆跟技能无关的 mjs 命令行程序是**错的**：那样既看不出技能的主张，人也不知道拿它干嘛。

硬要求：
1. 任务要**小而自包含**，交付物形态按上面的规则定（页面 / 小程序 / 文档）；只用 Node 或浏览器自带能力，不装依赖，能在一分钟内做完。
2. 任务必须**打到技能的核心主张**（例如技能主张"最省、最小"，任务就要能看出省不省；主张"先侦察再动手"，任务就要能看出有没有先给结论）——不要出一个跟技能无关的通用题。
   **但"打到主张"≠"把主张写进任务说明"**：taskPrompt 里只写"外部可观察、机器能判"的最低要求（交付物、输入、输出格式、边界行为），
   **别把技能的方法论抄进去**（别写"先用最省的做法""先侦察再动手""按三档优先级检查"这类话）。
   **技能的"触发条件"和"态度词"同样不许写**：description 里的 "Use when the user wants to X" 说的是"什么时候该用它"，
   那是做法不是需求，别翻译成"你要我做 X"；语气词（relentlessly / 狠狠 / 逼问 / 挑刺 / 别放过含糊处）也别搬进来。
   原因：A 侧（不加载技能）只拿到 taskPrompt；把技能的做法写进去，等于把技能喂给了 A，这次对照就比不出技能有没有用。
   自检判据：这条 taskPrompt 交给一个没装技能的 agent，它也能照着做——只有读过技能才知道该怎么做，那就是泄漏。
3. 用例（cases）必须**机器可判定**：
   - **程序类**（.mjs）：靠退出码、stdout 精确相等、或 stdout 包含/不包含来判断；
   - **页面类**（.html）：靠页面里的**字面量**判断——该出现的结构/文案（mustContain）、不该出现的（mustNotContain），外加一个最小字节数（minBytes）。别写"看起来协调"这种判据。
   - **组件类**（.tsx / .jsx / .vue / .svelte）：**代码好不好退出码判不了**，只能查文件里的**字面量**（mustContain / mustNotContain：导出名、props 名、必须保留的行为、必须出现的 data-* 之类）+ minBytes。
     **组件类用例里绝对不许要求"用了某个 API 就是对的"**（别写"必须有 useMemo / memo / useCallback / useDeferredValue"）——
     那是拿技能自己的做法考技能（循环论证），A 侧没读过技能就必然不达标。要验的是**外部可观察的结果**（例如"同一个组件仍然导出 X、props 形状没变、列表项仍然渲染出 data-id"）。
4. 至少一个"正常路径"用例 + 至少一个"边界/异常"用例（缺文件、空输入、坏输入之类；页面类可以是"必须在窄屏下也有 X 结构"这类结构要求）。
5. 所有期望值必须是**你自己算准的**，而且**必须和你在 taskPrompt 里写的口径严格一致**（口径说"行数 = \n 的个数"，期望值就得按这个算——不许出现口径说 1 行、期望写 2 行这种自相矛盾）。口径按最直白的常识写，别绕。
6. **程序类优先用 stdoutEquals（精确相等）**；页面类优先用 mustContain 里那些**任务里明确要求过**的字面量（例如任务要求"每张卡片必须有 data-role 属性"，就检查 data-role）。
7. 再给一份 referenceSolution：**满足全部用例的完整交付物**（程序类给源码，页面类给完整 HTML，组件类给完整的组件文件）。我们会拿它在本地跑一遍你设计的 check 脚本——**跑不过就说明用例或期望值有错，会被打回重来**。
8. 初始输入文件（inputs）只在任务需要时给；内容要短（几行），判分只依赖这些内容。
9. **末尾换行不算内容**：判分脚本用 bash 捕获 stdout，末尾换行会被吃掉。所以写 stdoutEquals 时按"**去掉末尾换行后**的内容"写（实现用 console.log('x') 打出 "x" 加换行，期望值就写 x）。任务说明里也别去抠末尾换行这种细节。

只输出一个 JSON 对象（不要解释、不要 markdown 代码块）：
{
  "taskId": "kebab-case 的短 id",
  "title": "一句话说明这条任务验什么",
  "purpose": "从给定词表里选一个最贴的",
  "deliverable": "交付物文件名：视觉/UI 类写 index.html；代码类写 xxx.mjs；流程/文档类写 report.md",
  "taskPrompt": "写给 agent 的任务说明（中文，具体、可判定；说清交付什么、放在哪、怎么算做到了）",
  "inputs": [{ "name": "input.txt", "content": "文件内容（没有就给空数组）" }],
  "cases": [
    { "name": "structure", "mustContain": ["<h1", "data-role=\\"card\\""], "mustNotContain": ["TODO"], "minBytes": 1200 },
    { "name": "normal", "args": ["input.txt"], "exitCode": 0, "stdoutEquals": "精确期望的 stdout（程序类首选）" }
  ],
  "referenceSolution": "满足全部用例的完整交付物",
  "why": "为什么这几个用例能验出这个技能的主张（一到两句）"
}`;

/**
 * 这份技能用来起草 / 判定的素材：description（frontmatter）+ 正文 + **被引用的技能**。
 * 解析规则见 tools/lib/skill-content.mjs —— 那里解释了为什么 frontmatter 的 description 也算内容，
 * 以及转发壳技能（grill-me → grilling）怎么把内容找回来。
 */
function skillText(dir) {
  const file = path.join(dir, 'SKILL.md');
  if (!existsSync(file)) fail(`找不到 ${rel(file)}`);
  return skillMaterial(dir).text.slice(0, 16000);
}

/** 素材太少就评不了（差在哪一块由 skill-content 说清楚） */
const thinSkillReason = thinReason;

/** 素材里夹带了被引用的技能时，把这件事说在明处（用户得知道"起草依据不只是那个壳"） */
function refsNote(dir) {
  const refs = skillMaterial(dir).refs.filter((r) => r.resolved);
  if (!refs.length) return '';
  return `这份 SKILL.md 是转发壳，内容取自它引用的 ${refs.map((r) => `${r.name}（${r.dir}/SKILL.md）`).join('、')}`;
}

/** 判分脚本：自带输入（heredoc）、临时文件用工作区相对路径、逐用例断言 */
function renderCheck(spec) {
  // 页面类交付物（视觉 / UI 技能）：**不去"运行"它**，检查页面本身的结构标记。
  // 好不好看由人打开页面看——两版产物就在对照板里，一点就开；机器只管底线（文件在不在、该有的东西有没有）。
  if (isFileCheckDeliverable(spec.deliverable)) return renderPageCheck(spec);

  const lines = [
    '#!/usr/bin/env bash',
    `# 脚本裁判（${spec.taskId}，由 tools/gen-eval.mjs 按 SKILL.md 自动生成）：退出码 0 = 通过。`,
    '# 两条规矩：判分脚本自带输入（agent 可能覆盖工作区文件）；临时文件放当前目录并用相对路径传给 node',
    '#（Git Bash 的 /tmp/... 在 Windows 上会被 node 解析成 C:\\tmp\\...）。',
    'set -u',
    '',
    'ENTRY=""',
    `for f in ${spec.deliverable} impl.mjs; do`,
    '  if [ -f "$f" ]; then ENTRY="$f"; break; fi',
    'done',
    'if [ -z "$ENTRY" ]; then',
    `  echo "FAIL: 没找到交付物（${spec.deliverable}）"`,
    '  ls -1',
    '  exit 1',
    'fi',
    '',
  ];
  for (const [i, input] of (spec.inputs ?? []).entries()) {
    const file = `.judge-in-${i}-${path.basename(input.name)}`;
    lines.push(`cat > "${file}" <<'JUDGE_INPUT_EOF'`, String(input.content ?? '').replace(/\r\n/g, '\n').trimEnd(), 'JUDGE_INPUT_EOF', '');
  }
  const cleanups = (spec.inputs ?? []).map((input, i) => `"${`.judge-in-${i}-${path.basename(input.name)}`}"`);
  lines.push(`trap 'rm -f .judge-err ${cleanups.join(' ') || '""'}' EXIT`, '');

  for (const c of spec.cases ?? []) {
    const argv = (c.args ?? []).map((a) => {
      const idx = (spec.inputs ?? []).findIndex((input) => input.name === a);
      return idx === -1 ? `"${a}"` : `".judge-in-${idx}-${path.basename(a)}"`;
    });
    lines.push(`# 用例：${c.name}`);
    // stdout 与 stderr 分开：断言只看 stdout，stderr 只用来在失败时给人看（任务本来就允许错误写 stderr）
    lines.push(`OUT="$(node "$ENTRY" ${argv.join(' ')} 2>.judge-err)"`);
    lines.push('CODE=$?');
    lines.push('ERR="$(head -c 200 .judge-err 2>/dev/null | tr \'\\n\' \' \')"');
    const detail = ' → $OUT${ERR:+ ｜stderr: $ERR}';
    if (c.exitCodeNonZero) {
      lines.push(`if [ "$CODE" -eq 0 ]; then echo "FAIL: ${c.name} 应当以非 0 退出${detail}"; exit 1; fi`);
    } else {
      lines.push(`if [ "$CODE" -ne ${c.exitCode ?? 0} ]; then echo "FAIL: ${c.name} 退出码 $CODE（期望 ${c.exitCode ?? 0}）${detail}"; exit 1; fi`);
    }
    if (c.stdoutEmpty) lines.push(`if [ -n "$OUT" ]; then echo "FAIL: ${c.name} 不该有 stdout${detail}"; exit 1; fi`);
    if (c.stdoutEquals !== undefined) {
      lines.push(`if [ "$OUT" != ${shellQuote(normalizeStdout(c.stdoutEquals))} ]; then echo "FAIL: ${c.name} stdout 不对${detail}"; exit 1; fi`);
    }
    for (const s of c.stdoutContains ?? []) {
      lines.push(`case "$OUT" in *${shellQuote(s)}*) ;; *) echo "FAIL: ${c.name} 缺少「${s}」${detail}"; exit 1;; esac`);
    }
    for (const s of c.stdoutNotContains ?? []) {
      lines.push(`case "$OUT" in *${shellQuote(s)}*) echo "FAIL: ${c.name} 不该出现「${s}」${detail}"; exit 1;; esac`);
    }
    lines.push('');
  }
  lines.push(`echo "PASS: ${spec.deliverable} 通过 ${(spec.cases ?? []).length} 条用例（${(spec.cases ?? []).map((c) => c.name).join('、')}）"`);
  return lines.join('\n') + '\n';
}

const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** 页面类交付物：`.html`（视觉 / UI 技能走这条） */
const isPageDeliverable = (name) => /\.html?$/i.test(String(name ?? ''));

/** 组件类交付物：`.tsx/.jsx/.vue/.svelte`（框架写法类技能走这条——产物就是组件文件本身） */
const isComponentDeliverable = (name) => /\.(tsx|jsx|vue|svelte)$/i.test(String(name ?? ''));

/** 只查文件结构与字面量的那两类：页面与组件源码（都不"运行"它们） */
const isFileCheckDeliverable = (name) => isPageDeliverable(name) || isComponentDeliverable(name);

/**
 * 这条评测该收集什么产物：**交付物本身**一定收（按完整路径，`src/Dashboard.tsx` 也算），
 * 再按形态补一类通配（页面收 html 兄弟文件、组件收同后缀的其他文件……）。
 * 踩过：收集清单里只列了 TypeScript 的 `.ts` 通配，React 技能改出来的 `.tsx` 一个都没收到，
 * 对照板上只剩一份说明文档。
 */
function artifactGlob(deliverable) {
  const ext = String(deliverable).match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase() ?? '';
  if (ext === 'html' || ext === 'htm') return '**/*.html';
  if (ext === 'tsx' || ext === 'jsx' || ext === 'vue' || ext === 'svelte' || ext === 'ts' || ext === 'js') {
    return `**/*.${ext}`;
  }
  return '**/*.md';
}

/**
 * 页面 / 组件类交付物的判分脚本（**不"运行"它们**，只读文件）。
 * 每条用例给的是**文件里必须出现 / 不该出现的字面量**（结构、导出名、文案、可访问性属性），
 * 以及一个最小体量（挡住"交了个空壳"）。参考实现自检同样跑这个脚本：
 * 把模型给的交付物写进临时目录、跑一遍检查——**过不了说明它自己写的用例和参考实现矛盾**。
 *
 * 组件类（`.tsx` 等）只能查到这个程度：**代码好不好，退出码判不了**——那部分交给 ask + LLM 裁判。
 * 也正因为如此，用例里**不许**要求"用了 useMemo / memo / useDeferredValue"这类**技能自己的做法**，
 * 那是拿技能的标准考技能（循环论证），只许查外部可观察的结构与签名。
 */
function renderPageCheck(spec) {
  const cases = spec.cases ?? [];
  const component = isComponentDeliverable(spec.deliverable);
  const fallback = component ? '' : ' index.html';
  const lines = [
    '#!/usr/bin/env bash',
    `# 脚本裁判（${spec.taskId}，${component ? '组件源码' : '页面'}类交付物，由 tools/gen-eval.mjs 按 SKILL.md 自动生成）：退出码 0 = 通过。`,
    component
      ? '# 只查文件本身的结构与签名（导出名、必须出现的字面量）；"代码写得好不好"由 LLM 裁判 / 人来判。'
      : '# 只查页面本身的结构与文案；"好不好看"由人打开页面看（两版产物在台账的对照板里）。',
    'set -u',
    '',
    'ENTRY=""',
    `for f in ${spec.deliverable}${fallback}; do`,
    '  if [ -f "$f" ]; then ENTRY="$f"; break; fi',
    'done',
    'if [ -z "$ENTRY" ]; then',
    `  echo "FAIL: 没找到交付物（${spec.deliverable}）"`,
    '  ls -1',
    '  exit 1',
    'fi',
    'HTML="$(cat "$ENTRY")"',
    '',
  ];
  for (const c of cases) {
    lines.push(`# 用例：${c.name}`);
    for (const s of c.mustContain ?? []) {
      lines.push(`case "$HTML" in *${shellQuote(s)}*) ;; *) echo "FAIL: ${c.name} 页面里缺少「${s}」"; exit 1;; esac`);
    }
    for (const s of c.mustNotContain ?? []) {
      lines.push(`case "$HTML" in *${shellQuote(s)}*) echo "FAIL: ${c.name} 页面里不该出现「${s}」"; exit 1;; esac`);
    }
    if (c.minBytes) {
      lines.push(`SIZE=$(wc -c < "$ENTRY" | tr -d ' '); if [ "$SIZE" -lt ${Number(c.minBytes)} ]; then echo "FAIL: ${c.name} 页面只有 $SIZE 字节（至少要 ${Number(c.minBytes)}）"; exit 1; fi`);
    }
    lines.push('');
  }
  lines.push(`echo "PASS: ${spec.deliverable} 通过 ${cases.length} 条检查（${cases.map((c) => c.name).join('、')}）"`);
  return lines.join('\n') + '\n';
}

/**
 * bash 的 `$(...)` 会把 stdout 末尾的换行吃掉，所以"精确相等"的期望值也按去掉末尾换行来比。
 * 这是判分脚本的行为，不是宽容：末尾换行本来就不该是任务要求的一部分。
 */
const normalizeStdout = (s) => String(s).replace(/(?:\r?\n)+$/, '');

/* ─────────────────── 用户自己出的题（--from-prompt） ───────────────────
 * 用户直接给任务提示词，我们只做三件事：
 *   1. 把它落成一条用例（`input.prompt` 原样照抄，不润色、不改口径）；
 *   2. 用 **agent_judge**（LLM 裁判，走内部网关）判 A/B：自由提示词没有确定答案，不能靠字符串断言；
 *   3. 单独放一个 `evals/eval.ask.yaml`（只列这些"自己出的题"），不动技能原有的用例套件。
 */

const ASK_EVAL = 'evals/eval.ask.yaml';

/**
 * 渲染一条"用户自己出题"的用例。
 *
 * `fixture`：任务要是**改一个现有文件**（"src/Dashboard.tsx 打开要好几秒，帮我优化"），
 * 那个文件必须在工作区里存在——否则两边都无从下手，跑出来的 0/0 是**用例的错**，不是能力的错
 * （踩过：react-best-practices 那条 ask 用例就是这么被判成 reject 的）。
 * 工作区输入交给 skill-up 的 `context.repo_fixture`（相对**技能目录**的路径），实测能用。
 */
function renderAskCase({ taskId, prompt, criteria, model, fixture, expectFiles = [] }) {
  const body = String(prompt).trim().split('\n').map((l) => `    ${l}`.trimEnd());
  return [
    `id: ${taskId}`,
    `title: ${firstLine(prompt)}`,
    'description: 用户自己出的题（A 不给技能 / B 给技能；由 agent_judge 判）',
    '',
    'input:',
    '  prompt: |',
    ...body,
    ...(fixture ? ['', 'context:', `  repo_fixture: ${fixture}`] : []),
    '',
    'constraints:',
    // 整页级别的任务（视觉类技能）本来就慢：实测一边 300–450 秒，600 秒会把"做得慢"直接判成 ERROR，
    // 于是 A/B 比的不是质量而是谁先撞上超时（踩过：中立提示词的 A 侧 26 轮、603 秒被杀）
    '  timeout_seconds: 900',
    '  max_turns: 12',
    '',
    'expect:',
    '  exit_code: 0',
    // 零成本门槛：任务说"改完写回这个文件"，那这个文件结束时必须还在
    //（判官看不见磁盘，它只知道 transcript 里写过——那就可能出现"写了又删"却判达标）
    ...(expectFiles.length ? ['  files_exist:', ...expectFiles.map((f) => `    - ${f}`)] : []),
    '',
    'judge:',
    '  type: agent_judge',
    `  model: anthropic/${model}`,
    '  criteria:',
    ...criteria.map((c) => `    - ${JSON.stringify(c)}`),
    '',
  ].join('\n');
}

function renderAskEval(model, criteria, refNames = []) {
  // 转发壳技能（grill-me）：B 侧得把它**引用的那个技能一起装上**，否则 B 只拿到一句
  // "Call the Skill tool with grilling"、而那个技能根本没装 → B 必挂，比的成了"谁的技能不存在"。
  const yaml = `schema_version: v1alpha1

# 用户自己出的题（由 tools/gen-eval.mjs --from-prompt 生成）。
# A = 只给这段提示词；B = 提示词 + 技能正文（benchmark.enabled 控制）。
# 判分用 LLM 裁判（agent_judge），走内部网关。

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
  name: claude_code
  model:
    name: auto

cases:
  files: []
  defaults:
    timeout_seconds: 900
    max_turns: 12
    collect_artifacts:
      # 页面也算产物：视觉类技能的"效果"就是那个页面，不收上来台账里根本打不开（踩过：
      # ui-ux-pro-max 两条 ask 记录都只有结论、没有可打开的 A/B 页面）
      # 组件 / 前端源码也算：react-best-practices 那条用例的交付物就是改好的 src/Dashboard.tsx，
      # 而清单里只列到 **/*.ts —— 两版改出来的 .tsx 一个都没收到，对照板上只剩那份说明
      # （踩过：iteration-2 的产物路径是 docs/notes.md，代码本身没留档）
      - "**/*.html"
      - "**/*.htm"
      - "**/*.css"
      - "**/*.mjs"
      - "**/*.js"
      - "**/*.jsx"
      - "**/*.ts"
      - "**/*.tsx"
      - "**/*.vue"
      - "**/*.svelte"
      - "**/*.py"
      - "**/*.go"
      - "**/*.md"
      - "**/*.txt"
      - "**/*.json"

benchmark:
  enabled: true

judge:
  type: agent_judge
  model: anthropic/${model}
  criteria:
${criteria.map((c) => `    - ${JSON.stringify(c)}`).join('\n')}

report:
  formats: [json, html]
  artifacts: [transcript]
`;
  return withRefSkills(yaml, refNames);
}

function firstLine(text) {
  const line = String(text).trim().split('\n').find((l) => l.trim()) ?? '用户自己出的题';
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}

/**
 * LLM 裁判的判据（"用户自己出题"那条路）。
 *
 * **必须是中立的**：只按任务提示词里写的要求判，不许把某个技能的世界观当通用标准。
 * 曾经这里第二条写着"多余的解释、额外文件、未要求的防御代码都算不达标"——那是 ponytail 的主张，
 * 却对**每个**技能的对照都生效：等于给 A 侧也套上技能的标准，还跟第一条"别自己加要求"自相矛盾。
 */
function askCriteria(extra) {
  return [
    '只按用户给出的这条任务要求评判：任务里明确要的东西都在，就算做到了；任务没要求的，不许拿来扣分（也别用别的标准）',
    '产出要能用：交付物在、能跑起来 / 能打开、格式没错；跑不起来、交付物缺失、输出对不上任务要求的格式，才算没做到',
    ...(extra ? [String(extra)] : []),
  ];
}

/** 把用户的任务提示词变成一条用例 + 一份单独的评测配置 */
function writeAskCase({ dir, prompt, task, criteria, fixture }) {
  const model = athenModel();
  const taskId = (task ?? `ask-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`).replace(/[^A-Za-z0-9._-]/g, '-');
  const list = askCriteria(criteria);
  const evalsDir = path.join(dir, 'evals');
  const caseFile = path.join(evalsDir, 'cases', `${taskId}.yaml`);
  const evalFile = path.join(evalsDir, 'eval.ask.yaml');
  mkdirSync(path.dirname(caseFile), { recursive: true });
  // 工作区输入存在时，顺手把"提示词点名、且输入里真的有"的文件做成 expect.files_exist：
  // 交付物结束时必须还在（"写了又删"这种要零成本拦下来，别等判官）
  const fixtureAbs = fixture ? path.join(dir, fixture) : '';
  const expectFiles = expectFilesFromPrompt(prompt, fixtureAbs);
  writeFileSync(caseFile, renderAskCase({ taskId, prompt, criteria: list, model, fixture, expectFiles }), 'utf8');
  if (fixture) {
    // 工作区输入是"改动类"任务的前提：目录不存在就别跑，免得又跑出一条 0/0 的无效对照
    const abs = path.join(dir, fixture);
    if (!existsSync(abs)) fail(`✗ 找不到工作区输入 ${rel(abs)}——先把待改的文件放进这个目录（相对技能目录写 --fixture）`);
    log(`✔ 工作区输入：${fixture}（${rel(abs)}，跑之前会拷进 agent 的工作区）`);
    if (expectFiles.length) log(`✔ 交付物门槛（expect.files_exist）：${expectFiles.join('、')}`);
  }
  const refNames = resolvedRefNames(dir);
  if (!existsSync(evalFile)) writeFileSync(evalFile, renderAskEval(model, list, refNames), 'utf8');
  ensureRefSkills(evalFile, refNames);
  ensureCaseListed(evalFile, taskId);
  log(`✔ 用例：${rel(caseFile)}`);
  log(`✔ 配置：${rel(evalFile)}（A 只给提示词 / B 提示词+技能，LLM 裁判 ${'anthropic/' + model}）`);
  return { taskId, caseFile, evalFile };
}

/** 已经解析下来的被引用技能（转发壳技能：B 侧要一起装上） */
function resolvedRefNames(dir) {
  return skillMaterial(dir).refs.filter((r) => r.resolved).map((r) => r.name);
}

/** 把被引用的技能补进已有 eval 配置的 skills 列表（幂等——老配置也补得上） */
function ensureRefSkills(evalFile, refNames) {
  if (!refNames.length || !existsSync(evalFile)) return false;
  const before = readFileSync(evalFile, 'utf8');
  const after = withRefSkills(before, refNames.map(refDirName));
  if (after === before) return false;
  writeFileSync(evalFile, after, 'utf8');
  log(`✔ ${rel(evalFile)} 补上被引用的技能（B 侧一并装上）：${refNames.join('、')}`);
  return true;
}

function ensureCaseListed(evalFile, taskId) {
  const line = `- evals/cases/${taskId}.yaml`;
  const skillDir = path.dirname(path.dirname(evalFile));
  let lines = readFileSync(evalFile, 'utf8').split('\n');
  if (lines.some((l) => l.trim() === line)) return false;

  // 脚手架留下的占位用例（`prepare` 建的 `example`：标题写着"待改"）在真用例生成后必须摘掉。
  // 不摘的后果不是"多跑一条"这么轻：它永远过不了，B 侧通过率被拉到 < 100% → 直接判 `reject`
  //（"带能力也没把任务做对"），一个刚拉进来的技能会被自己的模板判死。只摘占位，不动人写的用例。
  const before = lines.length;
  lines = lines.filter((l) => !(/^\s*-\s*evals\/cases\/.+\.ya?ml\s*$/.test(l) && isScaffoldPlaceholder(skillDir, l)));
  if (lines.length < before) log(`✔ 摘掉脚手架占位用例（example：标题写着"待改"，它过不了、会拉低 B 的通过率）`);

  // 优先挂在已有用例条目后面；列表是空的（`files: []` 或 `files:` 后什么都没有）就挂在 files: 下面
  const lastEntry = lines.map((l) => /^\s*-\s*evals\/cases\/.+\.ya?ml\s*$/.test(l)).lastIndexOf(true);
  if (lastEntry !== -1) {
    const indent = lines[lastEntry].match(/^\s*/)?.[0] ?? '    ';
    lines.splice(lastEntry + 1, 0, `${indent}${line}`);
  } else {
    const filesLine = lines.findIndex((l) => /^\s*files:\s*(\[\s*\])?\s*$/.test(l));
    if (filesLine === -1) return false;
    const indent = `${lines[filesLine].match(/^\s*/)?.[0] ?? '  '}  `;
    lines[filesLine] = lines[filesLine].replace(/\[\s*\]\s*$/, '');
    lines.splice(filesLine + 1, 0, `${indent}${line}`);
  }
  writeFileSync(evalFile, lines.join('\n'), 'utf8');
  return true;
}

/** 这个条目是不是脚手架占位用例（`id: example` 且标题/正文写着"待改 / TODO"） */
function isScaffoldPlaceholder(skillDir, entryLine) {
  const entry = entryLine.match(/-\s*(\S+\.ya?ml)\s*$/)?.[1];
  if (!entry) return false;
  const file = path.join(skillDir, entry);
  if (!existsSync(file)) return false;
  const text = readFileSync(file, 'utf8');
  return /^\s*id:\s*example\s*$/m.test(text) && /待改|TODO/.test(text);
}

/**
 * 拿模型给的参考实现跑一遍它自己设计的 check 脚本。
 * 这是"自动出的用例能不能信"的唯一证据：跑不过就说明用例或期望值有错（口径自相矛盾、算错数、脚本写坏）。
 * 没有 bash 环境时跳过（并说明），不假装验过。
 */
function verifyAgainstReference(spec, checkText) {
  const bash = ['C:\\Program Files\\Git\\bin\\bash.exe', 'bash'].find((b) => b === 'bash' || existsSync(b));
  if (!bash) return { ok: false, skipped: true, output: '找不到 bash，跳过参考实现自检' };
  if (!spec.referenceSolution) return { ok: false, skipped: false, output: '模型没有给 referenceSolution，无法自检' };

  const dir = mkdtempSync(path.join(tmpdir(), 'gen-eval-'));
  try {
    writeFileSync(path.join(dir, 'check.sh'), checkText, 'utf8');
    writeFileSync(path.join(dir, spec.deliverable), String(spec.referenceSolution), 'utf8');
    const res = spawnSync(bash, ['check.sh'], { cwd: dir, encoding: 'utf8' });
    const output = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
    return { ok: res.status === 0, skipped: false, output: output.slice(0, 500) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function renderCase(spec) {
  const promptLines = String(spec.taskPrompt ?? '').trim().split('\n').map((l) => `    ${l}`.trimEnd());
  const head = [
    `id: ${spec.taskId}`,
    `title: ${spec.title ?? spec.taskId}`,
    `description: ${spec.why ?? '按 SKILL.md 自动生成的针对性用例'}`,
    '',
    'input:',
    '  prompt: |',
    ...promptLines,
    '',
  ];
  const inputs = spec.inputs ?? [];
  const context = inputs.length
    ? ['context:', '  files:', ...inputs.flatMap((i) => [`    "${i.name}": |`, ...String(i.content ?? '').split('\n').map((l) => `      ${l}`.trimEnd())])]
    : ['context: {}'];
  return [
    ...head,
    ...context,
    '',
    'constraints:',
    '  timeout_seconds: 300',
    '  max_turns: 4',
    '',
    'expect:',
    '  exit_code: 0',
    '',
    'judge:',
    '  type: script',
    `  script_path: evals/fixtures/scripts/check-${spec.taskId}.sh`,
    '  timeout_seconds: 60',
    '',
  ].join('\n');
}

/** eval.yaml 里的路径都是**相对技能目录**的（skill-up 的约定），别写成仓库相对路径 */
function renderEvalYaml(spec) {  return `schema_version: v1alpha1
# ${spec.taskId} 的评测配置（由 tools/gen-eval.mjs 按 SKILL.md 生成）。
# 跑法：node tools/skillup-bridge.mjs run --name <技能>   （或页面上「开始评测」）

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
  name: claude_code
  model:
    name: auto

cases:
  files:
    - evals/cases/${spec.taskId}.yaml
  defaults:
    timeout_seconds: 300
    max_turns: 4
    collect_artifacts:
      - "${spec.deliverable}"
      - "${artifactGlob(spec.deliverable)}"

benchmark:
  enabled: true

judge:
  type: script
  script_path: evals/fixtures/scripts/check-${spec.taskId}.sh
  timeout_seconds: 60

report:
  formats: [json, html]
  artifacts: [transcript]
`;
}

/**
 * 起草出来的提示词有没有毛病 —— **确定性检查，不靠模型自觉**。
 *
 * 为什么要有：光在 system 里写"不许把技能的做法写进提示词"，模型还是会写（实测连出三版：
 * "把含含糊糊的地方全给我逼出来"、"一轮一轮过"、"把它问透"）。所以起草完先过一遍机器检查，
 * 命中就带着"你哪里写错了"重写一次。查三类：
 *   - 做法 / 态度词：交互编排（一轮一轮 / 问透 / 追问 / 盘问…）、施压词（逼问 / 拷问 / 挑刺…）
 *   - 能力名出现在提示词里：A 侧看到名字就等于被点名（"写到 grill-me.md" 也算）
 *   - 太长：编排写多了必然长（40–90 字，硬上限 140）
 */
const METHOD_WORDS =
  /一轮一轮|一轮|逐个问|一个一个问|一个个问|反复问|反复追问|追问|问透|问到底|盘问|逼问|拷问|逼出来|挑刺|挑毛病|压力测试|狠狠|不留情|别放过|验收标准|我照着就能|做好了要/;

function draftProblems(prompt, name) {
  const hits = [];
  if (prompt.length > 140) hits.push(`太长（${prompt.length} 字，要 40–90 字）`);
  if (name && prompt.includes(name)) hits.push(`写进了能力名「${name}」（A 侧看到名字等于被点名）`);
  const m = prompt.match(METHOD_WORDS);
  if (m) hits.push(`写进了技能的做法 / 态度：「${m[0]}」`);
  return hits;
}

/**
 * 交付物文件名里带了能力名 → 换成中性名字。
 *
 * 模型在这件事上很顽固（实测三次重写都还写 `grill-me.md`），但"文件名"本来就是随便起的，
 * 所以这条直接确定性替换：**只动"当文件名用"的写法**（`grill-me.md`、`docs/grill-me.md`），
 * 行文里提到能力名的情况不碰（那种要重写，硬替换会把句子改烂）。
 */
function neutralizeName(prompt, name) {
  if (!name) return prompt;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`([\\w./-]*)${esc}(\\.\\w+)`, 'gi');
  if (!prompt.match(re)) return prompt;
  log('ℹ 交付物文件名里带了能力名，已换成中性的名字（A 侧看到名字等于被点名）');
  return prompt.replace(re, (_m, pre, ext) => `${pre}notes${ext}`);
}

/** 起草一次（必要时带着问题重写一次），再过一遍机器检查；检查结果不管过没过都会说出来 */
async function draftOnce({ system, user, name }) {
  let prompt = '';
  try {
    prompt = clean((await askAthen({ system, user, maxTokens: 8000 })).text);
  } catch (err) {
    log(`⚠ 第一次没拿到提示词（${err instanceof Error ? err.message : err}），加大预算重试…`);
    try {
      prompt = clean((await askAthen({ system, user, maxTokens: 24000, timeoutMs: Math.max(resolveTimeout(), 600000) })).text);
    } catch (err2) {
      fail(`✗ 生成提示词失败：${err2 instanceof Error ? err2.message : err2}\n  没有写任何文件，稍后重试即可。`);
    }
  }
  if (!prompt) fail('模型没给出提示词，再试一次');

  const problems = draftProblems(prompt, name);
  if (problems.length) {
    log(`⚠ 起草的提示词有问题，带着问题重写一次：${problems.join('；')}`);
    const retry = `${user}\n\n=== 上一次你写的提示词（不合格，请重写）===\n${prompt}\n\n=== 问题 ===\n${problems.join('\n')}\n请重写：更短更简单，不要编排，不要写技能的做法与态度，交付物文件名也不要带能力名。`;
    try {
      const again = clean((await askAthen({ system, user: retry, maxTokens: 8000 })).text);
      if (again) prompt = again;
    } catch (err) {
      // 重写这一步失败不该让整件事失败：手上这条虽然有问题，但用户还能自己改
      log(`⚠ 重写没成功（${err instanceof Error ? err.message : err}），先把上一条给你，提交前自己扫一眼`);
    }
  }

  prompt = neutralizeName(prompt, name);
  const left = draftProblems(prompt, name);
  if (left.length) log(`⚠ 重写后仍有问题（${left.join('；')}）—— 提交前建议自己再改一遍`);
  else log(`✔ 通过检查：${prompt.length} 字，没有技能做法 / 态度词，也没有出现能力名`);
  return prompt;
}

const clean = (text) =>
  String(text ?? '')
    .trim()
    .replace(/^```[a-z]*\n?|```$/g, '')
    .replace(/^["'「]|["'」]$/g, '')
    .trim();

/** 让模型设计用例；purpose 只允许已登记的取值。长提示下推理型模型可能一次不够，就加大预算重试一次。 */
export async function designEval({ name, dir, purposes, feedback = '' }) {
  const thin = thinSkillReason(dir);
  if (thin) log(`⚠ ${thin}\n  继续跑也行（当"空技能 vs 没有技能"的对照），但别指望它证明这个技能有用。`);
  const viaRefs = refsNote(dir);
  if (viaRefs) log(`ℹ ${viaRefs}`);
  const text = skillText(dir);
  const purposeHint = `purpose 只能从这个词表里选一个：${purposes.join(' / ')}`;
  const system = `${SYSTEM}\n\n${purposeHint}`;
  const retryHint = feedback
    ? `\n\n=== 上一次的设计没通过自检：请修正后重新输出完整 JSON ===\n拿你给的 referenceSolution 跑你设计的用例时失败了：\n${feedback}\n（常见原因：期望值和 taskPrompt 里的口径不一致、stdout 算错、漏算末尾换行、或参考实现本身不满足你写的口径）`
    : '';
  const user = `技能名：${name}\n\n=== 技能素材（SKILL.md 的 description + 正文；转发壳技能还含它引用的那个技能）===\n${text}${retryHint}`;
  let raw = '';
  try {
    raw = (await askAthen({ system, user, maxTokens: 12000 })).text;
  } catch (err) {
    log(`⚠ 第一次没拿到设计（${err instanceof Error ? err.message : err}），加大预算重试…`);
    try {
      // 预算从 12k 加到 32k 意味着生成更久，超时也得跟着放宽（默认 5 分钟不够它用）
      raw = (await askAthen({ system, user, maxTokens: 32000, timeoutMs: Math.max(resolveTimeout(), 600000) })).text;
    } catch (err2) {
      fail(
        `✗ 自动设计失败：${err2 instanceof Error ? err2.message : err2}\n` +
          '  这一步只是"按技能设计用例"，没有写任何文件；稍后重跑，或改用「根据能力生成」手写提示词再跑（那条路更稳）。',
      );
    }
  }
  const spec = extractJson(raw);
  if (!spec.taskId || !spec.taskPrompt || !Array.isArray(spec.cases) || spec.cases.length === 0) {
    fail(`模型给的设计不完整（缺 taskId / taskPrompt / cases）：${JSON.stringify(spec).slice(0, 300)}`);
  }
  spec.taskId = String(spec.taskId).replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 48) || 'auto-task';
  spec.purpose = purposes.includes(spec.purpose) ? spec.purpose : purposes[0];
  // 交付物形态：页面 / **组件源码** / 小程序 / 文档（见 tools/lib/deliverable.mjs）。
  // 认不出的形状兜底成小程序，但**必须说出来**——以前是静默改写，React 技能被无声降级成 Node 脚本，
  // 用户看到产物才发现（`src/Dashboard.tsx` → `impl.mjs`）。
  const shape = normalizeDeliverable(spec.deliverable);
  spec.deliverableKind = shape.kind;
  spec.deliverable = shape.name;
  if (shape.rewritten) {
    log(
      `⚠ 模型给的交付物${shape.from ? `「${shape.from}」` : ''}不是我们认识的形状，已兜底成 ${shape.name}（小程序）；` +
        '如果这个技能本该交页面 / 组件代码，说明形态规则或设计提示词要改，别直接跑。',
    );
  }
  return spec;
}

const name = args.name;
const task = args.task;
const fromPrompt = args['from-prompt'];
if (!name) fail('用法：node tools/gen-eval.mjs --name <技能名> [--task <用例 id>] [--dry-run] [--print] | --from-prompt "<用户的任务提示词>" | --draft-prompt');

const found = findCapability(name, 'skill');

/**
 * `--draft-prompt`：**按这个能力起草一条任务提示词**，给用户改完再提交。
 *
 * 起因：不填提示词时走的是自动设计，而自动设计对"UI / 视觉类"技能容易出一堆 mjs 命令行程序
 * （用户原话："不知道干嘛用"）。这里让模型先读 SKILL.md，再给出一条**贴合这个能力**的任务，
 * 关键是**交付物要对**：视觉类 → 一个能直接打开的页面；命令行 / 代码类 → 一个能跑的小程序。
 * 只打印，不写文件、不跑评测——用户改完点「提交」才会真的跑。
 */
if (args['draft-prompt']) {
  // 素材太少的技能：起草出来的"贴合任务"全是模型自己补的，先拦下来说清楚。
  // 注意"素材"不只是正文——frontmatter 的 description 算，它转发的技能（转发壳）也算（见 skill-content.mjs）。
  const thin = thinSkillReason(found.dir);
  if (thin) fail(`✗ 没法按这个技能起草任务：\n  ${thin}`);
  const viaRefs = refsNote(found.dir);
  if (viaRefs) log(`ℹ ${viaRefs}`);

  const text = skillText(found.dir);
  const purposes = registeredPurposes();
  const system = [
    '你替人起草一条"给 AI 编码 agent 的任务提示词"，用来对比**加载某个技能 / 不加载它**两版的产出差异。',
    '',
    '硬要求：',
    '1. **短、简单，像随口提的一句需求**：40–90 字、一到两句，中文。背景一句 + 要 agent 交什么 + 放在哪个文件。',
    '1b. **不要编排**：不写"先别动代码""做好了要满足…""验收标准是…""我照着就能开工"这类流程与验收说明，',
    '   也不分点、不加小标题、不写条数/轮次。**任务越简单，A/B 比的越是技能本身**——编排写多了，',
    '   两边都在照你的编排做，技能有没有用反而被淹掉（用户原话："任务应该更简单化，不要在提示词中编排"）。',
    '2. **绝对不要把技能自己的做法写进提示词**：不写它的步骤 / 流程 / 章节结构 / 小标题 / 轮次或条数 / 阈值 /',
    '   合格线 / 禁用词 / 评分标准。原因：A 侧（不加载技能）只拿到这条提示词；提示词里写了技能那套做法，',
    '   等于把技能喂给了 A，这次对照就比不出"技能到底有没有用"。**这是这套评测最容易做错的一件事。**',
    '2b. **"触发条件"和"态度词"同样算做法，也不许写**：description 里那句 "Use when the user wants to X"',
    '   说的是"什么时候该用这个技能"，别把它翻译成"你要我做 X"；语气词（relentlessly / 狠狠 / 逼问 / 拷问 /',
    '   挑刺 / 别放过任何含糊处）也别搬进来。实例（真实踩过）：grilling 的 "Grill the user relentlessly…',
    '   Use when the user wants to stress-test their thinking" 被写成了"把含含糊糊带过去的地方全给我逼出来，',
    '   摆到桌面上让我拍板"—— 那是把技能的态度当成了用户的要求。只说**用户想要的结果**，不说"你该怎么对我"。',
    '2c. **写完逐句自检**：这句是"用户想要什么结果"，还是"技能教导该怎么做"？**最终判据**：这条提示词交给一个',
    '   **没装任何技能**的 agent，它也能照着做——只有读过这个技能才知道该怎么做，那就是泄漏，必须改写。',
    '3. 交付物形态要说清（那属于"用户的需求"，不属于技能的方法）：',
    `   ${DRAFT_DELIVERABLE_RULE}`,
    '   文件名用中性的（如 `docs/notes.md`、`index.html`、`impl.mjs`），**不要用能力名**——',
    '   A 侧看到 `grill-me.md` 这种名字就等于被点名，这次对照就废了。',
    '3b. **交付物要贴合这个技能真实的产出形状**（一份方案？一份待用户拍板的问题清单？一个能打开的页面？一段能跑的',
    '   脚本？），形状本身可以写；**"怎么得到这个形状"不许写**（步骤 / 顺序 / 轮次 / 态度 / 判断标准）。',
    '   反面也防：别无中生有地加"不用我再做任何决定"这种技能做不到的要求——那是给 B 侧下套。',
    '4. 直接给任务本身——不要解释、不要"以下是提示词"、不要引号包裹。',
    purposes.length ? `5. 用途标签会从这些里选，不用写进提示词：${purposes.join(' / ')}。` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const user = `技能名：${name}\n\n=== 技能素材（SKILL.md 的 description + 正文；转发壳技能还含它引用的那个技能）===\n${text}`;
  // 推理模型会先"想"：预算给小了会全花在 thinking 上（踩过），所以起步就给够、不够再加倍；
  // 起草完还要过一遍机器检查（做法/态度词、能力名、长度），不合格就带着"哪里写错了"重写一次
  const prompt = await draftOnce({ system, user, name });
  process.stdout.write(`${prompt}\n`);
  process.exit(0);
}

if (!found) fail(`找不到技能：candidates/skills/${name}`);

// 用户自己出的题：不走"先设计任务"那套，直接把提示词落成用例并跑 A/B（LLM 裁判）
if (fromPrompt) {
  writeAskCase({ dir: found.dir, prompt: fromPrompt, task, criteria: args.criteria, fixture: args.fixture });
  log(`  任务提示词（原样照抄，未润色）：${firstLine(fromPrompt)}`);
  // 只提醒不拦：一次 A/B 要跑十几分钟，提示词里要是写了技能的做法，那次对照就白跑了
  const risk = draftProblems(fromPrompt, name);
  if (risk.length) log(`  ⚠ 这条提示词可能让对照失效（${risk.join('；')}）—— 还能跑，但结论要打折扣`);
  log(`  下一步：node tools/skillup-bridge.mjs run --name ${name} --eval ${ASK_EVAL}`);
  process.exit(0);
}

const purposes = registeredPurposes();
const MAX_ATTEMPTS = 2;
let spec = null;
let checkText = '';
let proof = { ok: false, skipped: false, output: '' };
let feedback = '';

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  spec = await designEval({ name, dir: found.dir, purposes, feedback });
  if (task) spec.taskId = String(task).replace(/[^A-Za-z0-9._-]/g, '-');
  log(`—— 自动设计（${name}）第 ${attempt} 次`);
  log(`  用例 id：${spec.taskId}｜交付物：${spec.deliverable}｜用途：${spec.purpose}`);
  log(`  任务：${String(spec.taskPrompt).split('\n')[0].slice(0, 100)}`);
  log(`  用例：${spec.cases.map((c) => c.name).join('、')}`);
  log(`  为什么能验：${String(spec.why ?? '').slice(0, 160)}`);

  checkText = renderCheck(spec);
  // 自检：模型给的参考实现必须能跑通它自己设计的用例，否则这套用例不能进仓库
  proof = verifyAgainstReference(spec, checkText);
  if (proof.ok || proof.skipped) break;
  feedback = proof.output;
  log(`⚠ 自检没过：${proof.output}${attempt < MAX_ATTEMPTS ? '——把失败原因回给模型重新设计' : ''}`);
}

if (!proof.ok && !proof.skipped) {
  fail(
    [
      `✗ 试了 ${MAX_ATTEMPTS} 次：自动出的用例都没通过"参考实现自检"，说明模型设计的期望值或参考实现有错。`,
      `  最后一次的失败：${proof.output}`,
      '  这次没有写任何文件（不往仓库里塞跑不通的用例）。',
      `  再试一次：node tools/gen-eval.mjs --name ${name} --task <换个用例 id>；或手写 evals/cases/*.yaml 与判分脚本。`,
    ].join('\n'),
  );
}
if (proof.skipped) log(`⚠ ${proof.output}——这次生成的用例没被验证过，跑评测前请人工看一眼`);
else log(`✔ 自检通过：参考实现能过这套用例${proof.output ? `（${proof.output.split('\n').pop()}）` : ''}`);

if (args.print) {
  log('\n=== case.yaml ===\n' + renderCase(spec));
  log('=== check.sh ===\n' + checkText);
}

if (args['dry-run'] || args.print) {
  log('（--dry-run / --print：没有写任何文件）');
} else {
  const evalsDir = path.join(found.dir, 'evals');
  const caseFile = path.join(evalsDir, 'cases', `${spec.taskId}.yaml`);
  const checkFile = path.join(evalsDir, 'fixtures', 'scripts', `check-${spec.taskId}.sh`);
  const evalFile = path.join(evalsDir, 'eval.yaml');
  for (const dir of [path.dirname(caseFile), path.dirname(checkFile)]) mkdirSync(dir, { recursive: true });
  writeFileSync(caseFile, renderCase(spec), 'utf8');
  writeFileSync(checkFile, checkText, 'utf8');
  // eval.yaml 已存在就保留（用户可能手工调过），只把新用例挂进 cases.files
  const hadEval = existsSync(evalFile);
  if (hadEval) ensureCaseListed(evalFile, spec.taskId);
  else writeFileSync(evalFile, renderEvalYaml(spec), 'utf8');
  // spec 留档：谁设计的、设计了什么、参考实现是什么、为什么能验——方便人工复核
  writeFileSync(path.join(evalsDir, 'cases', `${spec.taskId}.spec.json`), JSON.stringify(spec, null, 2) + '\n', 'utf8');
  log(`✔ 已生成：${rel(caseFile)}`);
  log(`✔ 已生成：${rel(checkFile)}`);
  log(`✔ 配置：${rel(evalFile)}${hadEval ? '（已存在：只把新用例挂进 cases.files）' : ''}`);
  log(`  用途标签判定：${spec.purpose}（写进能力登记时用；不满意可以改 capabilities.json）`);
  log(`  下一步：skill-up validate ${rel(evalFile)} 然后 node tools/skillup-bridge.mjs run --name ${name}`);
}
