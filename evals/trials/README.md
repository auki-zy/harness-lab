# trials/ — 单次试用记录

每个文件 = 一次试用，命名 `YYYY-MM-DD-<capability-id>[-<工具>][-N].json`（同一天同一工具重跑不覆盖，自动加序号），字段与规则见 [`../schema.md`](../schema.md)（第三节：哪类能力用什么工具跑）。

已登记（按时间）：

| 试用 | 能力 | 用什么跑的 | 方式 | 本次结论 |
|---|---|---|---|---|
| `2026-09-10-frontend-design.json` | frontend-design（skill） | 会话内手工对照（早于工具链） | 受控对比（page-card，A/B） | `adopt` |
| `2026-09-10-ponytail.json` | ponytail（skill） | 会话内手工对照（早于工具链） | 模拟场景（wc-cli，A/B；auto + LLM 评审） | `hold`（B 胜：10 行 vs 19 行；但只有 1 次可复核试用） |
| `2026-09-10-ponytail-skillup.json` | ponytail（skill） | skill-up + stub 引擎（离线自检） | 受控对比（2 用例） | `retry`（引擎 qodercli 没装：`command not found`；不算能力的结论） |
| `2026-09-11-ponytail-skillup*.json` | ponytail（skill） | skill-up + claude_code **走内部网关 Athen** | 模拟场景（2 用例，A/B） | 两次判据问题记 `retry`；最终 `adopt`（4/4 全过） |

> 「只有 1 次通过」的停在 `hold`：再跑一次同类试用、第二次仍全过就自动判 `adopt`（规则见 `../schema.md` 第六节）。
> 判据/环境问题的 `retry` 都写清了真因，且**没有**改动能力级结论——那些不是对能力的判断。
>
> **2026-09-11：子代理与 MCP 的记录已从台账撤出**（`task-scout`、`mcp-demo`），候选目录与这些试用记录整包归档到仓库外 `.archive/harness-lab-agent-mcp-2026-09-11/`；页面上的 MCP / 子代理**评测入口与类型筛选先注释掉**（开关在 `src/shared/entries.ts`），想好口径再放开。相关工具与桥接（`tools/promptfoo-bridge.mjs`、`tools/mcp-probe.mjs`）都还在。
