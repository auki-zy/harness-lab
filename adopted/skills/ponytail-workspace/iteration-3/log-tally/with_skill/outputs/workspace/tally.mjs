#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tally.mjs <file>');
  process.exit(1);
}

let content;
try {
  content = readFileSync(file, 'utf8');
} catch (err) {
  console.error(`Error: cannot read file '${file}': ${err.message}`);
  process.exit(1);
}

if (content === '') {
  console.log('{}');
  process.exit(0);
}

const lines = content.split(/\r?\n/);
if (lines[lines.length - 1] === '') {
  lines.pop();
}

const counts = {};

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let obj;
  try {
    obj = JSON.parse(line);
  } catch (err) {
    console.error(`Error: line ${i + 1} is not valid JSON`);
    process.exit(1);
  }

  if (
    obj === null ||
    typeof obj !== 'object' ||
    Array.isArray(obj) ||
    typeof obj.level !== 'string'
  ) {
    console.error(`Error: line ${i + 1} is missing a string 'level' field`);
    process.exit(1);
  }

  counts[obj.level] = (counts[obj.level] || 0) + 1;
}

const sorted = {};
for (const key of Object.keys(counts).sort()) {
  sorted[key] = counts[key];
}

console.log(JSON.stringify(sorted));
