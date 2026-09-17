已写出 `plan.json`，共 7 步：

| # | 工具 | 做什么 |
|---|---|---|
| 1 | Read | 读三个输入文件，确认合同是扫描件、归档已加密 |
| 2 | ocrmypdf | 对 `contract.pdf` 做 OCR（chi_sim+eng），输出 `contract-ocr.pdf` |
| 3 | pdftotext | 导出 `contract.txt` |
| 4 | Read | 从文本里取**甲方名称**和**签署日期** |
| 5 | qpdf | 用密码 `hunter2` 解密 `archive.pdf` → `archive-decrypted.pdf` |
| 6 | pdfunite | 合并为 `merged.pdf` |
| 7 | pdfinfo | 校验页数为 5 页 |

**`ocrRequired` 设为 `true`**，理由是 `contract-meta.json` 里三页的 `text_chars` 全是 0，且 `likely_scanned_pages` 覆盖 [1,2,3] —— 甲方名称和签署日期不在文本层里，只能靠 OCR 拿到。这是本次请求中唯一必须 OCR 的部分；`archive.pdf` 的解密是密码问题，不涉及 OCR（且它的 `pages` 为空，加密状态下连页级元数据都读不到，得先解密）。

两点需要你确认的判断：
- **合并顺序**：请求里说"把它（archive）和 contract.pdf 合并"，我按 archive 在前、合同在后排的。如果存档习惯是合同在前，把第 6 步的 args 调换即可。
- **未列出阅读三个输入文件之外的操作**：我没有写"生成中间文件清理"这类步骤，因为请求只要求产出 `merged.pdf` 和两项合同信息。
