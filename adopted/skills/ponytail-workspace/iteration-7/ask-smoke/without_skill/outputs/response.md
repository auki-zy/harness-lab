目录里只有 `stats.mjs`（测试文件已删）。

```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const file = process.argv[2];

if (!file) {
  process.stderr.write('usage: node stats.mjs <file>\n');
  process.exit(1);
}

let text;
try {
  text = readFileSync(file, 'utf8');
} catch (err) {
  process.stderr.write(`stats: cannot read ${file}: ${err.message}\n`);
  process.exit(1);
}

const newlines = (text.match(/\n/g) || []).length;
const lines = text === '' ? 0 : newlines + (text.endsWith('\n') ? 0 : 1);
const words = text.split(/\s+/).filter(Boolean).length;

process.stdout.write(JSON.stringify({ lines, words, chars: text.length }) + '\n');
```

只用 `node:fs`，同步读，stdout 只有一行 JSON（带结尾换行）。

实测：

| 输入 | 输出 |
|---|---|
| `"hello world\nfoo bar baz\n"` | `{"lines":2,"words":5,"chars":24}` |
| `"a\nb"`（无尾换行） | `{"lines":2,"words":2,"chars":3}` |
| 空文件 | `{"lines":0,"words":0,"chars":0}` |
| 文件不存在 / 无参数 | 退出码 1，stdout 为空 |

两处需要你确认的语义选择（规格没定死，我按最常见解释实现）：

- **行数**：尾随换行算行终止符，不额外产生空行（`"a\nb\n"` → 2，而非 `split('\n').length` 的 3）。空文件为 0。
- **字符数**：JS `String.length`（UTF-16 码元）。含 astral 字符（如 emoji）时每个算 2；若你要码点数，改成 `[...text].length`。

报错信息只写 stderr，stdout 保持为空。
