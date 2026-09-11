import { readFileSync } from 'node:fs';

const text = readFileSync(process.argv[2], 'utf8'); // 文件不存在 -> Node 自己报错到 stderr、退出码 1
const trimmed = text.trim();

console.log(
  JSON.stringify({
    lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0),
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    chars: text.length,
  }),
);
