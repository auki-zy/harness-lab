import { readFileSync } from 'node:fs';

const path = process.argv[2];

let content;
try {
  content = readFileSync(path, 'utf8');
} catch (err) {
  process.stderr.write(`Error: cannot read file "${path}": ${err.message}\n`);
  process.exit(1);
}

const lineSegments = content.split('\n');
const lines = content.endsWith('\n') ? lineSegments.length - 1 : lineSegments.length;

const trimmed = content.trim();
const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;

const chars = Array.from(content).length;

process.stdout.write(JSON.stringify({ lines, words, chars }) + '\n');
