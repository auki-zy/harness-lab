#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: node tally.mjs <file>');
  process.exit(1);
}

let content;
try {
  content = readFileSync(filePath, 'utf8');
} catch (err) {
  console.error(`Error: cannot read file '${filePath}': ${err.message}`);
  process.exit(1);
}

const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');

const counts = {};

for (const line of lines) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    console.error(`Error: invalid JSON line: ${line}`);
    process.exit(1);
  }

  if (obj === null || typeof obj !== 'object' || Array.isArray(obj) || typeof obj.level !== 'string') {
    console.error(`Error: line is missing a string 'level' field: ${line}`);
    process.exit(1);
  }

  counts[obj.level] = (counts[obj.level] || 0) + 1;
}

const result = {};
for (const key of Object.keys(counts).sort()) {
  result[key] = counts[key];
}

console.log(JSON.stringify(result));
