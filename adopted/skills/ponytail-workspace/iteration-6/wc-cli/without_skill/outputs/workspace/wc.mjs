import { readFile } from 'node:fs/promises';

const file = process.argv[2];

if (!file) {
  process.stderr.write('usage: node wc.mjs <file>\n');
  process.exit(1);
}

let text;
try {
  text = await readFile(file, 'utf8');
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
}

// lines: split on \n; a trailing empty segment (file ends with \n) is not a line.
const parts = text.split('\n');
if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
const lines = parts.length;

// words: trim, then split on runs of whitespace; empty file -> 0.
const trimmed = text.trim();
const words = trimmed === '' ? 0 : trimmed.split(/\s+/u).length;

// chars: characters, not bytes (code points, so astral chars count once).
const chars = [...text].length;

process.stdout.write(JSON.stringify({ lines, words, chars }) + '\n');
