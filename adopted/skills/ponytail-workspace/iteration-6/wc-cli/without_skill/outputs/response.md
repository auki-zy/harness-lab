`wc.mjs` 已创建并测试通过（测试用的临时文件已清理，目录里只剩 `input.txt` 和 `wc.mjs`）。

实现要点：
- `wc.mjs:15-18` — 按 `\n` 切分，末尾空段（文件以 `\n` 结尾）弹出，空文件得 0
- `wc.mjs:21-22` — `trim()` 后按 `/\s+/u` 切分，全空白文件为 0
- `wc.mjs:25` — `[...text].length` 计码点，非字节数（astral 字符如 emoji 算 1 个）
- 读文件失败或没传参数 → 写 stderr、退出码 1；成功时只输出一行 JSON

实测结果：

| 输入 | 输出 |
|---|---|
| `hello world\nfoo bar baz\n` | `{"lines":2,"words":5,"chars":24}` |
| 空文件 | `{"lines":0,"words":0,"chars":0}` |
| `one two\n\n three  four \n` | `{"lines":3,"words":4,"chars":23}` |
| `中文 测试\n` | `{"lines":1,"words":2,"chars":6}` |
| 无结尾换行 `no trailing newline` | `{"lines":1,"words":3,"chars":19}` |
| 仅 `\n` | `{"lines":1,"words":0,"chars":1}` |
| 文件不存在 | stderr 报错，exit 1 |

一个口径选择值得你确认：`chars` 我按**码点**算（等价 Python `len()` / `wc -m`），而非 UTF-16 码元。ASCII 和中文下两者一致，只有 emoji 这类代理对会不同（`😀` 我算 1，`str.length` 会算 2）。若你要的是码元，把第 25 行改成 `text.length` 即可。
