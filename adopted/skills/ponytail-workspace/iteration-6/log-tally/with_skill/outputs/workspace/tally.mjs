#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (file === undefined) {
  process.stderr.write('usage: node tally.mjs <file>\n');
  process.exit(1);
}

let text;
try {
  text = readFileSync(file, 'utf8');
} catch (err) {
  process.stderr.write(`tally: cannot read ${file}: ${err.message}\n`);
  process.exit(1);
}

// 容忍 UTF-8 BOM
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

// 按行切分；只丢掉文件末尾换行造成的那个空串，其余空行照常报错
const lines = text.split(/\r?\n/);
if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

const counts = new Map();
for (let i = 0; i < lines.length; i++) {
  let obj;
  try {
    obj = JSON.parse(lines[i]);
  } catch {
    process.stderr.write(`tally: line ${i + 1} is not valid JSON\n`);
    process.exit(1);
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj) || typeof obj.level !== 'string') {
    process.stderr.write(`tally: line ${i + 1} has no string "level" field\n`);
    process.exit(1);
  }
  counts.set(obj.level, (counts.get(obj.level) || 0) + 1);
}

// 手工拼接，避免 JS 对象对 "3"、"-1" 这类整数样式键重排，破坏字典序
const keys = [...counts.keys()].sort();
const body = keys.map((k) => `${JSON.stringify(k)}:${counts.get(k)}`).join(',');
process.stdout.write(`{${body}}\n`);
