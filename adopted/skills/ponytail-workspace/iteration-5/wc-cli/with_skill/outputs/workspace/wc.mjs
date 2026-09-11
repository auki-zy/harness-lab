import { readFile } from 'node:fs/promises';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node wc.mjs <file>');
  process.exit(1);
}

let content;
try {
  content = await readFile(file, 'utf8');
} catch (err) {
  console.error(`Error: cannot read file '${file}': ${err.message}`);
  process.exit(1);
}

const lineParts = content.split('\n');
if (lineParts.length > 0 && lineParts[lineParts.length - 1] === '') {
  lineParts.pop();
}
const lines = lineParts.length;

const trimmed = content.trim();
const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;

const chars = Array.from(content).length;

console.log(JSON.stringify({ lines, words, chars }));
