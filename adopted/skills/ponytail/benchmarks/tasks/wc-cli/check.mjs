#!/usr/bin/env node
// 客观检查：把某个条件目录里的 wc.mjs 跑起来，对着 input.txt 核对，并量出"省不省"。
// 用法：node check.mjs <条件目录>        （目录里应有 wc.mjs）
// 输出：一行 JSON
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, process.argv[2] ?? 'version-a');
const input = path.join(here, 'input.txt');
const text = readFileSync(input, 'utf8');

const expected = {
  lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0),
  words: text.trim() === '' ? 0 : text.trim().split(/\s+/).length,
  chars: text.length,
};

const entry = path.join(dir, 'wc.mjs');
const files = existsSync(dir) ? readdirSync(dir).sort() : [];
const result = {
  dir: path.relative(here, dir).replace(/\\/g, '/'),
  files,
  entryExists: existsSync(entry),
  expected,
  actual: null,
  correct: false,
  missingFileExitCode: null,
  stdoutIsSingleJson: false,
};

if (result.entryExists) {
  try {
    const out = execFileSync(process.execPath, [entry, input], { encoding: 'utf8' }).trim();
    result.stdoutIsSingleJson = out.split('\n').length === 1;
    result.actual = JSON.parse(out);
    result.correct =
      result.actual.lines === expected.lines &&
      result.actual.words === expected.words &&
      result.actual.chars === expected.chars;
  } catch (err) {
    result.error = String(err.message ?? err).split('\n')[0];
  }

  try {
    execFileSync(process.execPath, [entry, path.join(here, 'no-such-file.txt')], { stdio: 'pipe' });
    result.missingFileExitCode = 0;
  } catch (err) {
    result.missingFileExitCode = err.status ?? 'unknown';
  }
}

// 「省不省」的代理指标
const code = result.entryExists ? readFileSync(entry, 'utf8') : '';
const deps = [...code.matchAll(/(?:from\s+|require\()['"]([^'".][^'"]*)['"]/g)]
  .map((m) => m[1])
  .filter((spec) => !spec.startsWith('node:'));
result.linesOfCode = code === '' ? 0 : code.split('\n').filter((l) => l.trim() !== '').length;
result.bytes = code === '' ? 0 : statSync(entry).size;
result.thirdPartyImports = deps;
result.extraFiles = files.filter((f) => f !== 'wc.mjs');

console.log(JSON.stringify(result, null, 2));
