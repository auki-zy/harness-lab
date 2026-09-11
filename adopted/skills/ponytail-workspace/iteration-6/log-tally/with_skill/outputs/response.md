`tally.mjs` 已写好并验证通过（工作目录下现在只有这一个文件）。

实现要点：
- 用 `readFileSync` 读文件，`ENOENT` 等读取失败 → stderr + 退出码 1。
- 按 `/\r?\n/` 切行（兼容 CRLF），只丢弃结尾换行产生的空串；其余空行/非法行按「非 JSON 行」报错。
- 每行 `JSON.parse`，要求是对象且 `level` 为字符串，否则 stderr 报出行号 + 退出码 1。
- 空文件 → `{}`。
- **手工拼 JSON 串**而不是 `JSON.stringify(对象)`：JS 对象会把 `"2"`、`"10"` 这类整数样式键排在前面并按数值排序，会破坏题目要求的字典序。键用默认 `sort()` 升序、值从 `Map` 取。

实测结果：

| 输入 | 输出 | 退出码 |
|---|---|---|
| 混合 level（含 `"10"`/`"2"`） | `{"10":1,"2":1,"info":1,"warn":2}` | 0 |
| 空文件 | `{}` | 0 |
| 含非 JSON 行 | `tally: line 2 is not valid JSON` | 1 |
| 缺 `level` 字段 | `tally: line 1 has no string "level" field` | 1 |
| 文件不存在 | `tally: cannot read nope.jsonl: ENOENT...` | 1 |

一个口径判断说明：若某行 `level` 存在但不是字符串（如 `{"level":3}`），我按「不是字符串 level」报错退出 1 —— 这是你写的「level 字段（字符串）」的直接推论。如果你希望这种情况改成 `"3"` 计数，我可以放宽。
