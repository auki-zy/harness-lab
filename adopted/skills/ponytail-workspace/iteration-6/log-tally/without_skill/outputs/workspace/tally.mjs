#!/usr/bin/env node
import { readFileSync } from 'node:fs';

function fail(message) {
  process.stderr.write(`tally: ${message}\n`);
  process.exit(1);
}

const file = process.argv[2];
if (file === undefined) fail('usage: node tally.mjs <file>');

let text;
try {
  text = readFileSync(file, 'utf8');
} catch (err) {
  fail(`cannot read ${file}: ${err.message}`);
}

const counts = new Map();
const lines = text.split('\n');

for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  if (raw.trim() === '') continue; // 空行（含文件末尾换行）

  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    fail(`line ${i + 1}: not valid JSON`);
  }

  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    fail(`line ${i + 1}: not a JSON object`);
  }

  const level = record.level;
  if (typeof level !== 'string') {
    fail(`line ${i + 1}: missing or non-string "level" field`);
  }

  counts.set(level, (counts.get(level) ?? 0) + 1);
}

const result = {};
for (const key of [...counts.keys()].sort()) result[key] = counts.get(key);
process.stdout.write(JSON.stringify(result) + '\n');
