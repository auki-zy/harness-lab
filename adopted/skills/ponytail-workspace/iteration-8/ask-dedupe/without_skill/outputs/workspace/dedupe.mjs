#!/usr/bin/env node
// Lazily deduplicate the lines of a text file, preserving first-seen order.
// Usage: node dedupe.mjs <file>
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
  process.stderr.write(`dedupe: cannot read ${file}: ${err.message}\n`);
  process.exit(1);
}

if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

const lines = text.split(/\r?\n/);
if (lines[lines.length - 1] === '') lines.pop();

const seen = new Set();
const out = [];
for (const line of lines) {
  if (seen.has(line)) continue;
  seen.add(line);
  out.push(line);
}

if (out.length > 0) process.stdout.write(out.join('\n') + '\n');
