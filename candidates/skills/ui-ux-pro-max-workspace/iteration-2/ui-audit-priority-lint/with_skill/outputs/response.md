已创建 `C:\Users\yu.zhao\AppData\Local\Temp\skill-up-3889113577\ui-audit.mjs`，仅用 Node 内置模块（`node:fs`），无依赖。

实现要点：
- WCAG 相对亮度用标准 sRGB 线性化（`c/255 ≤ 0.03928 ? /12.92 : ((c+0.055)/1.055)^2.4`），比值 `(L亮+0.05)/(L暗+0.05)`，`< 4.5` 记违规；短写 `#rgb` 也兼容。
- 违规行先全部收集到数组，最后一次性 `process.stdout.write` 输出 —— 这样读文件/解析失败时 stdout 保证为空（失败路径只 `process.exit(1)`，不写任何东西）。
- 图标用 `for...of` 按码点遍历（正确处理代理对），`codePointAt(0) >= 0x1F000` 即判为 emoji。
- 顺序固定：contrast（数组原序）→ font → touch → emoji（数组原序）；无违规则单行 `PASS`。

实测结果：
- `issues.json` → `contrast body` / `contrast badge` / `font 14` / `touch 32` / `emoji 🚀` / `emoji 📊`，退出码 0
- `clean.json`、`edge.json`（fontPx=16、touchPx=44 边界）→ `PASS`，退出码 0
- `broken.json`（JSON 解析失败）、不存在的路径、缺参数 → 退出码 1，stdout 为空

目录里原有的 `broken.json` / `clean.json` / `edge.json` / `issues.json` 是既存文件，我只读取未改动（我的临时测试文件建在 `/tmp` 并已删除）。
