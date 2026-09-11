#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const file = process.argv[2];

if (!file) {
  process.stderr.write('usage: node dedupe.mjs <file>\n');
  process.exit(1);
}

let text;
try {
  text = readFileSync(file, 'utf8');
} catch (err) {
  process.stderr.write(`dedupe: ${err.message}\n`);
  process.exit(1);
}

const lines = text.split(/\r?\n/);
// A trailing newline produces a final empty element that is not a real line.
if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

const seen = new Set();
const out = [];
for (const line of lines) {
  if (seen.has(line)) continue;
  seen.add(line);
  out.push(line);
}

if (out.length > 0) process.stdout.write(out.join('\n') + '\n');
