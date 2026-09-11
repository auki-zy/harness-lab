交付完成：`ui-audit.mjs`（仅用 Node 内置 `node:fs`，无依赖）。

**实现要点**
- 相对亮度按 WCAG：`c/255` → `≤0.03928 ? /12.92 : ((c+0.055)/1.055)^2.4`，`L = 0.2126R+0.7152G+0.0722B`，比值 `(L亮+0.05)/(L暗+0.05)`，`< 4.5` 记违规（`ui-audit.mjs:10`）。
- 图标用 `for...of` 按码点遍历，`codePointAt(0) >= 0x1F000` 判定，避免代理对被拆成两半（`ui-audit.mjs:28`）。
- 输出顺序固定为 contrast → font → touch → emoji，无违规则仅输出 `PASS`（`ui-audit.mjs:34`）。
- 所有读文件/解析动作包在 try 内，失败只写 stderr 并置 `process.exitCode = 1`，stdout 保持零字节；成功路径恒为 0。

**验证结果**（目录里已有的 4 个 fixture）

| 文件 | stdout | 退出码 |
|---|---|---|
| clean.json | `PASS` | 0 |
| edge.json（16px / 44px 边界值） | `PASS` | 0 |
| issues.json | `contrast body`、`contrast badge`、`font 14`、`touch 32`、`emoji 🚀`、`emoji 📊` | 0 |
| broken.json | 空（`od -c` 确认 0 字节，错误信息走 stderr） | 1 |

另外单独验过：文件不存在、缺参数 → 退出码 1 且 stdout 为空；`#777777` 对白恰为 4.48 会命中违规，`#000000` 对白（21）不命中。目录内除该脚本外未新增任何文件。
