#!/usr/bin/env node
// 自测：对 wc.mjs 跑若干边界用例。/ 用法：node test.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(here, 'wc.mjs');
const dir = mkdtempSync(path.join(tmpdir(), 'wc-cli-'));

function run(args) {
  try {
    const out = execFileSync(process.execPath, [entry, ...args], { encoding: 'utf8' });
    return { code: 0, out: out.trim() };
  } catch (err) {
    return { code: err.status ?? 'unknown', out: String(err.stderr ?? '').trim() };
  }
}

// 口径以 benchmarks/tasks/wc-cli/check.mjs 为准（lines 用 split('\n').length，空文件按字面口径为 1）
const expect = (text) => ({
  lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0),
  words: text.trim() === '' ? 0 : text.trim().split(/\s+/).length,
  chars: text.length,
});

// 用例： [名字, 文件内容, 期望]
const cases = [
  ['fixture', 'alpha beta gamma\ndelta epsilon\n\nzeta eta theta iota\nkappa\n', expect('alpha beta gamma\ndelta epsilon\n\nzeta eta theta iota\nkappa\n')],
  ['no-trailing-newline', 'a b\nc', expect('a b\nc')],
  ['empty', '', expect('')],
  ['only-newlines', '\n\n', expect('\n\n')],
  ['blank-only', '   \n\t\n', expect('   \n\t\n')],
  ['extra-spaces', '  one   two  \n three \n', expect('  one   two  \n three \n')],
  ['crlf', 'a\r\nb\r\n', expect('a\r\nb\r\n')],
  ['cjk-is-chars-not-bytes', '中文 测试\n', expect('中文 测试\n')],
];

let failed = 0;
for (const [name, content, expected] of cases) {
  const file = path.join(dir, `${name}.txt`);
  writeFileSync(file, content, 'utf8');
  const r = run([file]);
  const actual = JSON.parse(r.out);
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} -> ${r.out}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
}

// 文件不存在：stderr 有输出 + 退出码 1，且 stdout 为空
const missing = run([path.join(dir, 'nope.txt')]);
const missingOk = missing.code === 1 && missing.out !== '';
if (!missingOk) failed++;
console.log(`${missingOk ? 'PASS' : 'FAIL'} missing-file -> exit=${missing.code} stderr=${missing.out}`);

// 单行 JSON（只有一个换行结尾，无其它输出）
const single = execFileSync(process.execPath, [entry, path.join(dir, 'fixture.txt')], { encoding: 'utf8' });
const singleOk = single.split('\n').filter((l) => l !== '').length === 1;
if (!singleOk) failed++;
console.log(`${singleOk ? 'PASS' : 'FAIL'} single-line-json`);

rmSync(dir, { recursive: true, force: true });
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
