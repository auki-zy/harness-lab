`tally.mjs` 已写好，只依赖 `node:fs`。

**实现要点：**
- 逐行 `JSON.parse`，非 JSON 行、非对象行、`level` 缺失或非字符串 → stderr 报错（带行号）+ 退出码 1
- `readFileSync` 抛错（文件不存在/无权限）→ stderr + 退出码 1
- 按键的 UTF-16 序排序后输出，`JSON.stringify` 单行结果 + 换行
- 空行跳过：这样文件末尾的换行不会被误判为非 JSON；空文件自然得到 `{}`

**验证结果**（临时用例已清理）：

| 场景 | 输出 | 退出码 |
|---|---|---|
| 4 行混合 | `{"error":1,"info":1,"warn":2}` | 0 |
| 空文件 | `{}` | 0 |
| 排序 `b/a/B` | `{"B":1,"a":1,"b":1}` | 0 |
| 第 2 行非 JSON | `tally: line 2: not valid JSON` → stderr | 1 |
| 缺 `level` | `tally: line 1: missing or non-string "level" field` → stderr | 1 |
| 文件不存在 | `tally: cannot read ...: ENOENT ...` → stderr | 1 |

一处需要你确认的口径判断：空白行我按「跳过」处理，而不是当作非法行报错——否则任何以换行结尾的正常文件都会失败。如果你的数据里空白行应当算错误，改掉 `tally.mjs:22` 的 `continue` 即可。
