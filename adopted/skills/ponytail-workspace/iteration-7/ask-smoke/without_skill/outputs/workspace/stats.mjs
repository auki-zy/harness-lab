#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const file = process.argv[2];

if (!file) {
  process.stderr.write('usage: node stats.mjs <file>\n');
  process.exit(1);
}

let text;
try {
  text = readFileSync(file, 'utf8');
} catch (err) {
  process.stderr.write(`stats: cannot read ${file}: ${err.message}\n`);
  process.exit(1);
}

const newlines = (text.match(/\n/g) || []).length;
const lines = text === '' ? 0 : newlines + (text.endsWith('\n') ? 0 : 1);
const words = text.split(/\s+/).filter(Boolean).length;

process.stdout.write(JSON.stringify({ lines, words, chars: text.length }) + '\n');
