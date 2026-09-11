#!/usr/bin/env node
// stub（无技能时的默认写法）：多一层参数校验与 try/catch
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node wc.mjs <file>');
  process.exit(1);
}

let text;
try {
  text = readFileSync(file, "utf8");
} catch (err) {
  console.error(`wc.mjs: ${err.message}`);
  process.exit(1);
}

const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
const trimmed = text.trim();
const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

console.log(JSON.stringify({ lines, words, chars: text.length }));
