#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const path = process.argv[2];

if (!path) {
  console.error('Usage: node tally.mjs <file>');
  process.exit(1);
}

let content;
try {
  content = readFileSync(path, 'utf8');
} catch (err) {
  console.error(`Error: cannot read file "${path}": ${err.message}`);
  process.exit(1);
}

const lines = content.split('\n').filter((line) => line.trim() !== '');

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
    console.error(`Error: line missing string "level" field: ${line}`);
    process.exit(1);
  }

  counts[obj.level] = (counts[obj.level] || 0) + 1;
}

const sorted = {};
for (const key of Object.keys(counts).sort()) {
  sorted[key] = counts[key];
}

console.log(JSON.stringify(sorted));
