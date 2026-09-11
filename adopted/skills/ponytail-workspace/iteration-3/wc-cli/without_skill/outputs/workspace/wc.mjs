import fs from 'node:fs';

const file = process.argv[2];

let content;
try {
  content = fs.readFileSync(file, 'utf8');
} catch (err) {
  process.stderr.write(`Error: cannot read file "${file}": ${err.message}\n`);
  process.exit(1);
}

let lines;
if (content === '') {
  lines = 0;
} else {
  const parts = content.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  lines = parts.length;
}

const trimmed = content.trim();
const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;

const chars = Array.from(content).length;

console.log(JSON.stringify({ lines, words, chars }));
