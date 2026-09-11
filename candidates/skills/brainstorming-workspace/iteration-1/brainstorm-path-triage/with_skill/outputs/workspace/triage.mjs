import { readFileSync } from 'node:fs';

const ARTIFACT = { spike: 'probe', bounded: 'chat-design', architectural: 'spec' };

const file = process.argv[2];
if (!file) {
  process.exit(1);
}

let text;
try {
  text = readFileSync(file, 'utf8');
} catch {
  process.exit(1);
}

const fields = new Map();
for (const line of text.split(/\r?\n/)) {
  const at = line.indexOf(':');
  if (at === -1) continue;
  const key = line.slice(0, at).trim();
  const value = line.slice(at + 1).trim().toLowerCase();
  if (key) fields.set(key, value);
}

const yes = (key) => fields.get(key) === 'yes';

let path;
if (yes('shared-interface')) {
  path = 'architectural';
} else if (yes('question')) {
  path = 'spike';
} else if (yes('existing-flow')) {
  path = 'bounded';
} else {
  path = 'architectural';
}

process.stdout.write(`${path}\n${ARTIFACT[path]}\n`);
