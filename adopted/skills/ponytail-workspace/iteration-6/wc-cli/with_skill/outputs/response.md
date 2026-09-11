已交付 `wc.mjs`（当前工作目录，无依赖，仅 Node 内置模块）。

实现要点：
- `lines`：`text.replace(/\n$/, '').split('\n').length`，空文件特判为 0（否则 `''.split()` 会得 1）。
- `words`：`trim()` 后按 `/\s+/` 切分，空串为 0。
- `chars`：`text.length`（字符数，非字节数）。
- 读文件失败 → 错误信息写 stderr，退出码 1；成功只往 stdout 写一行 JSON。

实测：

| 输入 | 输出 |
|---|---|
| `hello world\nfoo bar baz\n` | `{"lines":2,"words":5,"chars":24}` |
| 空文件 | `{"lines":0,"words":0,"chars":0}` |
| 无结尾换行的 `no trailing newline` | `{"lines":1,"words":3,"chars":19}` |
| `你好 世界\n` | `{"lines":1,"words":2,"chars":6}` |
| 不存在的文件 | stderr 报 ENOENT，退出码 1 |

`input.txt`（我建的测试样本）留在目录里了，不需要的话可以删。
