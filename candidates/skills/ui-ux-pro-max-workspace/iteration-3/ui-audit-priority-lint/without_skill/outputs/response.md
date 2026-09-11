交付文件已创建：`ui-audit.mjs`（仅用 `node:fs`，零依赖）。

实现要点：
- 对比度用标准 WCAG 相对亮度（sRGB 线性化 0.2126/0.7152/0.0722），比值取 `(亮+0.05)/(暗+0.05)`，`< 4.5` 违规。
- 图标用 `for...of` 按码点迭代（正确处理代理对），码点 `>= 0x1F000` 即判为 emoji。
- 输出顺序固定：contrast → font → touch → emoji，末尾单个换行；无违规时只输出 `PASS`。
- 文件读不到 / JSON 解析失败 / 缺参数时直接返回退出码 1，**stdout 完全静默**（连 stderr 也不写，避免任何合并输出被误判）。

验证结果（目录里已有的样例文件，非我创建）：

| 文件 | 输出 | 退出码 |
|---|---|---|
| clean.json | `PASS` | 0 |
| issues.json | `contrast body` / `contrast badge` / `font 14` / `touch 32` / `emoji 🚀` / `emoji 📊` | 0 |
| edge.json | `PASS` | 0 |
| broken.json | *（无输出）* | 1 |
| 不存在的路径 / 无参数 | *（无输出）* | 1 |

手工复核了 `issues.json` 的两个对比度判定：`#999999`/白 = 2.85（违规），`#ffdd00`/白 = 1.35（违规，黄底白字），而 `#005fcc` 上的白字 = 5.99（合规）——与脚本输出一致。

目录下原有的 `clean.json`、`issues.json`、`edge.json`、`broken.json` 我保留未动，只新增了 `ui-audit.mjs` 这一个文件（测试用的临时 fixture 已删除）。
