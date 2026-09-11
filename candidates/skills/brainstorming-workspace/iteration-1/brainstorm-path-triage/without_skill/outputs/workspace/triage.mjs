import { readFileSync } from 'node:fs';

const inputPath = process.argv[2];

let text;
try {
  if (!inputPath) throw new Error('no input path');
  text = readFileSync(inputPath, 'utf8');
} catch {
  process.exit(1);
}

const flags = new Map();
for (const rawLine of text.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line) continue;
  const sep = line.indexOf(':');
  if (sep === -1) continue;
  const key = line.slice(0, sep).trim().toLowerCase();
  const value = line.slice(sep + 1).trim().toLowerCase();
  flags.set(key, value);
}

const isYes = (key) => flags.get(key) === 'yes';

let route;
let artifact;

if (isYes('shared-interface')) {
  route = 'architectural';
  artifact = 'spec';
} else if (isYes('question')) {
  route = 'spike';
  artifact = 'probe';
} else if (isYes('existing-flow')) {
  route = 'bounded';
  artifact = 'chat-design';
} else {
  route = 'architectural';
  artifact = 'spec';
}

process.stdout.write(`${route}\n${artifact}\n`);
