import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const file = argv[2];

if (!file) {
  process.stderr.write('usage: node wc.mjs <file>\n');
  exit(1);
}

let text;
try {
  text = readFileSync(file, 'utf8');
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  exit(1);
}

const chars = text.length;

const lines = text === '' ? 0 : text.replace(/\n$/, '').split('\n').length;

const trimmed = text.trim();
const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;

process.stdout.write(JSON.stringify({ lines, words, chars }) + '\n');
