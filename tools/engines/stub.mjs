#!/usr/bin/env node
/**
 * 离线 stub 引擎 —— 实现 skill-up 的 `engine.custom` local 协议：
 *   读 `${input_file}` 里的 SessionInput，把 SessionResult 写到 `${output_file}`，
 *   顺便在工作区（cwd）里产出本次用例要求的文件。
 *
 * 用途只有两个：
 *   1. 本机没装任何 Agent 引擎（qodercli / claude_code / codex / qwen_code）时，
 *      用来验证"skill-up 跑评测 → 台账导入结果"这条链路能不能通；
 *   2. 当 custom engine 的接入示例（真实引擎照着这个协议实现即可）。
 *
 * ⚠️ 它不调用任何模型：**用它跑出来的结果不能当真实评测结论**（台账里别记）。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const inputFile = argOf('--input', process.env.EVAL_INPUT_FILE);
const outputFile = argOf('--output', process.env.EVAL_OUTPUT_FILE);
const cwd = process.cwd();

const session = inputFile && existsSync(inputFile) ? JSON.parse(readFileSync(inputFile, 'utf8')) : {};
const messages = Array.isArray(session.messages) ? session.messages : [];
const lastUser = [...messages].reverse().find((m) => m.role === 'user');
const promptText = typeof lastUser?.content === 'string' ? lastUser.content : JSON.stringify(lastUser?.content ?? '');

// 判断这次是"带技能"还是"不带技能"：先看工作区里有没有装技能，再看 prompt 里有没有技能正文
const findSkill = (dir, depth = 3) => {
  if (depth < 0 || !existsSync(dir)) return null;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const hit = findSkill(p, depth - 1);
      if (hit) return hit;
    } else if (e.name === 'SKILL.md') return p;
  }
  return null;
};
const skillFile = findSkill(cwd);
const skillText = skillFile ? readFileSync(skillFile, 'utf8') : '';
const withSkill = Boolean(skillFile) || promptText.includes('被懒的资深开发者') || /lazy senior developer/i.test(promptText);

// 调试留痕：把这次调用看到的东西写到报告目录旁边，方便核对协议
try {
  const debugDir = process.env.SKILL_UP_REPORT_DIR || path.join(cwd, '.stub-debug');
  mkdirSync(debugDir, { recursive: true });
  writeFileSync(
    path.join(debugDir, 'stub-last-call.json'),
    JSON.stringify(
      {
        cwd,
        inputFile,
        outputFile,
        sessionKeys: Object.keys(session),
        kwargs: session.kwargs ?? null,
        messageCount: messages.length,
        promptHead: promptText.slice(0, 300),
        skillFileFound: skillFile,
        withSkill,
        env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('EVAL_') || k.startsWith('SKILL_UP'))),
      },
      null,
      2,
    ),
    'utf8',
  );
} catch {
  /* 调试信息写不了就算了 */
}

const minimal = [
  "import { readFileSync } from 'node:fs';",
  '',
  'const text = readFileSync(process.argv[2], "utf8");',
  'const trimmed = text.trim();',
  '',
  'console.log(',
  '  JSON.stringify({',
  "    lines: text.split('\\n').length - (text.endsWith('\\n') ? 1 : 0),",
  '    words: trimmed ? trimmed.split(/\\s+/).length : 0,',
  '    chars: text.length,',
  '  }),',
  ');',
  '',
].join('\n');

const verbose = [
  '#!/usr/bin/env node',
  '// stub（无技能时的默认写法）：多一层参数校验与 try/catch',
  "import { readFileSync } from 'node:fs';",
  '',
  'const file = process.argv[2];',
  'if (!file) {',
  "  console.error('usage: node wc.mjs <file>');",
  '  process.exit(1);',
  '}',
  '',
  'let text;',
  'try {',
  '  text = readFileSync(file, "utf8");',
  '} catch (err) {',
  '  console.error(`wc.mjs: ${err.message}`);',
  '  process.exit(1);',
  '}',
  '',
  "const lines = text.split('\\n').length - (text.endsWith('\\n') ? 1 : 0);",
  'const trimmed = text.trim();',
  'const words = trimmed === "" ? 0 : trimmed.split(/\\s+/).length;',
  '',
  'console.log(JSON.stringify({ lines, words, chars: text.length }));',
  '',
].join('\n');

writeFileSync(path.join(cwd, 'wc.mjs'), withSkill ? minimal : verbose, 'utf8');
if (!withSkill) {
  writeFileSync(path.join(cwd, 'helpers.mjs'), '// stub：无技能时多交付一个文件（用来验证"额外文件"能被量到）\nexport const noop = () => {};\n', 'utf8');
}

const result = {
  exit_code: 0,
  final_message: withSkill
    ? 'wc.mjs → skipped: 参数校验与 try/catch，add when 需要自定义错误文案。'
    : '已实现 wc.mjs，并顺手抽了一个 helpers.mjs。',
};
if (outputFile) {
  mkdirSync(path.dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, JSON.stringify(result), 'utf8');
} else {
  process.stdout.write(JSON.stringify(result));
}
