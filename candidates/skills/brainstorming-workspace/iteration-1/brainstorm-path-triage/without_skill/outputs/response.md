交付完成：`triage.mjs`（目录里原有的 `request-*.txt` 是既有文件，我没有改动、也没有新建其他文件）。

实现要点：
- 只用了 `node:fs`，无依赖。
- 解析每行第一个 `:` 之前的 key 和之后的值，均 trim；key 与值大小写不敏感，兼容 CRLF；空行和无冒号的行跳过；重复 key 以最后一次为准。
- 判定严格按顺序短路：`shared-interface: yes` → architectural；否则 `question: yes` → spike；否则 `existing-flow: yes` → bounded；其余（字段缺失、空文件、无法识别的取值如 `maybe`）→ architectural。
- 读不到文件（不存在、无权限、是目录、缺参数）时先于任何输出退出码 1，stdout 保持为空。

验证结果（全部符合规则）：

| 输入 | 输出 | 退出码 |
|---|---|---|
| `question: no / existing-flow: yes / shared-interface: no` | bounded / chat-design | 0 |
| `question: yes / existing-flow: yes / shared-interface: no` | spike / probe | 0 |
| `question: yes / existing-flow: yes / shared-interface: yes` | architectural / spec | 0 |
| 三字段全 no | architectural / spec | 0 |
| 空文件 | architectural / spec | 0 |
| `question: maybe`（不认识的值） | architectural / spec | 0 |
| 文件不存在 / 无参数 / 传入目录 | 无输出 | 1 |

注意 `request-spike.txt` 这类输入（question 与 existing-flow 同时为 yes）会命中第 2 条规则落在 spike，而不是 bounded——这正是"按顺序命中即停"的预期行为。
