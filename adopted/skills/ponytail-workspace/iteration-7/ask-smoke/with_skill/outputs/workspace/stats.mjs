import { readFileSync } from 'node:fs';

const file = process.argv[2];

let text;
try {
  text = readFileSync(file, 'utf8');
} catch {
  process.exit(1);
}

const lines = text === '' ? 0 : text.split(/\r\n|\r|\n/).length - (/(\r\n|\r|\n)$/.test(text) ? 1 : 0);
const words = text.split(/\s+/).filter(Boolean).length;
const chars = [...text].length;

process.stdout.write(JSON.stringify({ lines, words, chars }) + '\n');
