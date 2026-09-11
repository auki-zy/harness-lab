#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const [, , filePath] = process.argv;

if (!filePath) {
  console.error('Usage: node tally.mjs <file>');
  process.exit(1);
}

let content;
try {
  content = readFileSync(filePath, 'utf8');
} catch (err) {
  console.error(`Cannot read file: ${filePath}`);
  process.exit(1);
}

const counts = {};

for (const line of content.split(/\r?\n/)) {
  if (line.trim() === '') continue;

  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    console.error(`Invalid JSON line: ${line}`);
    process.exit(1);
  }

  if (
    obj === null ||
    typeof obj !== 'object' ||
    Array.isArray(obj) ||
    typeof obj.level !== 'string'
  ) {
    console.error(`Line missing string 'level' field: ${line}`);
    process.exit(1);
  }

  counts[obj.level] = (counts[obj.level] || 0) + 1;
}

const sorted = {};
for (const key of Object.keys(counts).sort()) {
  sorted[key] = counts[key];
}

console.log(JSON.stringify(sorted));
