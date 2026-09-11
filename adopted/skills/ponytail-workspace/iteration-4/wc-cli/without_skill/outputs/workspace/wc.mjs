import { readFileSync } from 'node:fs';

const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: node wc.mjs <file>');
  process.exit(1);
}

let content;
try {
  content = readFileSync(filePath, 'utf8');
} catch (err) {
  console.error(`Error: cannot read file '${filePath}': ${err.message}`);
  process.exit(1);
}

let lines;
if (content.length === 0) {
  lines = 0;
} else {
  const parts = content.split('\n');
  lines = content.endsWith('\n') ? parts.length - 1 : parts.length;
}

const trimmed = content.trim();
const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;

const chars = Array.from(content).length;

console.log(JSON.stringify({ lines, words, chars }));
