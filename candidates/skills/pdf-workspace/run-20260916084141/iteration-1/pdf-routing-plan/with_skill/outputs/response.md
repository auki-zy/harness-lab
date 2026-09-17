已写出 `plan.json`，只新建了这一个文件，三个输入文件未改动。

**计划要点（8 步，按执行顺序）：**

1. 查 `pdf` 技能文档 — 确认 OCR / 解密 / 合并三个子命令的用法
2. `pdf info contract.pdf` — 确认扫描件状态
3. `pdf ocr contract.pdf contract-ocr.txt` — 提取文字
4. 读 `contract-ocr.txt` — 摘出甲方名称和签署日期
5. `pdf info archive.pdf` — 确认加密、2 页
6. `pdf decrypt archive.pdf hunter2 archive-decrypted.pdf` — 用给的密码解密
7. `pdf merge ... merged.pdf` — 合并成 5 页存档
8. `pdf info merged.pdf` — 校验成品页数与加密状态

**`ocrRequired: true`** — 依据是 `contract-meta.json`：3 页的 `text_chars` 全为 0，且三页都被标为 `likely_scanned_pages`，所以甲方名称和签署日期只能靠 OCR 拿到。`archive.pdf` 虽然加密，但用户已给密码，属于解密而非 OCR。

一处需你确认的取舍：第 7 步我按你的表述把 `archive` 放在前面（`archive-decrypted.pdf` + `contract.pdf`）。若存档希望合同在前，调换这两个参数即可。
