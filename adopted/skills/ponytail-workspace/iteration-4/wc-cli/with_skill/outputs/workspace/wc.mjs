import { readFileSync } from 'node:fs';

const path = process.argv[2];

let content;
try {
  content = readFileSync(path, 'utf8');
} catch (err) {
  console.error(`Error: cannot read file "${path}": ${err.message}`);
  process.exit(1);
}

let lineParts = content.split('\n');
if (lineParts.length > 0 && lineParts[lineParts.length - 1] === '') {
  lineParts.pop();
}
const lines = lineParts.length;

const trimmed = content.trim();
const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;

const chars = Array.from(content).length;

console.log(JSON.stringify({ lines, words, chars }));
