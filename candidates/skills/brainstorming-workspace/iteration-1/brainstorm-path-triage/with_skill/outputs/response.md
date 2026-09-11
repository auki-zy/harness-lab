已交付 `triage.mjs`（目录里原有的 `request-*.txt` 我没有动；测试用的临时文件已清理）。

实现要点：
- 逐行按第一个 `:` 切分 key/value，value 归一化为小写后与 `yes` 精确比较——`YES` 之类的大小写差异能识别，`maybe`、缺失字段、空文件一律不命中。
- 按顺序短路：`shared-interface: yes` → architectural；否则 `question: yes` → spike；否则 `existing-flow: yes` → bounded；其余落 architectural。
- 判定成功时 stdout 恰好两行（路径 + 产物），退出码 0。
- 读不到文件或没给参数时 `process.exit(1)`，stdout 保持空。

实测结果：

| 输入 | 输出 | 退出码 |
|---|---|---|
| `request-spike.txt` | spike / probe | 0 |
| `request-bounded.txt` | bounded / chat-design | 0 |
| `request-arch.txt` | architectural / spec | 0 |
| `request-upgrade.txt`（shared-interface 与 question 同时 yes） | architectural / spec | 0 |
| `request-empty.txt`（空文件） | architectural / spec | 0 |
| 未知 key / 空值 / 值不识别 | architectural / spec | 0 |
| 文件不存在 | （无输出） | 1 |
| 无参数 | （无输出） | 1 |

只用了 `node:fs` 的 `readFileSync`，无依赖、无额外文件。
