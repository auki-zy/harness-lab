# EVIDENCE：frontend-design（官方技能）

状态：**adopted** —— 受控对比（`benchmarks/tasks/page-card`，A＝不加载能力 / B＝加载能力）两版都达标，用户人评**赞并选了 B**（加载能力那版）→ 内容存于本仓库 `adopted/skills/frontend-design/`，用 harness-tool 装进项目。

> 人评口径：只做了**快速人评**——给了赞、也选了哪版更好（B），但**没有写理由**。所以本文只记"用户选了 B"，不编造"为什么更好"；要维度分就补详细人评（7 维 1–5 分）。

## 来源与版本

- 上游：[anthropics/skills · skills/frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design)
- 许可：Apache-2.0（同目录 `LICENSE.txt` 为上游原文）
- 导入方式：**原样**（未改写 `SKILL.md`）；我们的补充单独放 `ADDENDUM-ALIGNMENT.md`
- 版本留痕：见 `SOURCE.md`

## 受控对比：`benchmarks/tasks/page-card`（成员卡片页，单文件 HTML）

| 产物 | 是什么 | 体积 | 客观检查 | 人评 |
|---|---|---|---|---|
| `version-a.html` | A：不加载能力 | 12.2 KB | 0 外链/脚本；1 label；1 @media | — |
| `version-b.html` | B：加载 frontend-design | 14.6 KB | 0 外链/脚本；3 表结构；5 断点 | **用户选了这版**（赞） |

两版都做到任务要求、都无外部依赖。评分口径见 `benchmarks/SCORING.md`（① 快速人评 = 赞/踩 + 可选哪版更好；② 详细人评 = 7 维 1–5 分）——本轮是 ①：选了 B，但没有维度分。

## 结论

1. 采用官方 `frontend-design` 作为"界面审美"能力主体（自造 `ui-design` 已废弃，产物删除）；
2. 保留自造版唯一有价值的部分（结构对齐清单）为 `ADDENDUM-ALIGNMENT.md`；
3. 教训：先用官方原件，再决定"用 / 改"；**别替用户写人评理由**——只记他真正给过的结论；
4. 判 `adopt`（≥1 次可复核试用通过 + 人评赞 + 无退步），从 `candidates/` 移到 `adopted/skills/frontend-design/`（本仓库是能力的唯一存放处）；安装：`harness-tool add frontend-design`。
