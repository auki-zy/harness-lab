# AGENTS.md

这个仓库是一个**能力评测实验室**：只做一件事——判断某个 skill / agent / MCP 值不值得采纳。

它是**独立仓库**：不放模板产品内容（内置技能、安装器、子代理/MCP 声明目录），也不放"怎么用模板开新项目"的脚手架文档。那些在模板仓库里。

## 开工流程

1. `pwd` 确认在仓库根。
2. 读 `ARCHITECTURE.md`：系统地图、依赖规则、工程约定。
3. 读 `docs/QUALITY_SCORE.md`：当前最弱的领域。
4. 读 `docs/PLANS.md` 与 `docs/exec-plans/active/` 里的当前计划。
5. 改数据或页面时加读 `evals/schema.md`（数据规范）与 `docs/product-specs/capability-ledger.md`（页面行为）。
6. 跑五件套：`npm run typecheck && npm run lint && npm test && npm run build`；数据改动先 `npm run data` 重新聚合。

## 路由地图

- `ARCHITECTURE.md`：领域地图、分层与依赖规则、工程约定（栈 / 样式 / 命名 / 测试 / UI 验证）
- `README.md`：仓库门面与跑法
- `candidates/`：候选池（只放试用副本，不是产品目录，不随任何东西分发）
- `evals/schema.md`：评测数据规范（登记、标签、trial 字段、三套工具的映射约定、裁判与决策规则）
- `evals/tags.json`：标签表（维度与取值；新取值需人工确认）
- `evals/trials/`：单次试用记录
- `evals/results/app-data.json`：聚合产物（页面读它）
- `tools/lib/trial-record.mjs`：共用记账与判定（`decide()` / `upsertCapability()` / 聚合触发）
- `tools/skillup-bridge.mjs`、`tools/promptfoo-bridge.mjs`、`tools/mcp-probe.mjs`：三套评测工具的桥接（跑评测 + 把报告翻译成 trial）
- `tools/engines/`、`tools/__fixtures__/`：离线自检用的 stub 引擎与演示 MCP server
- `tools/aggregate.mjs`：零依赖聚合脚本
- `src/`：台账页面（Vite + React + TypeScript + AntD）
- `docs/product-specs/`：页面行为规格与验收标准
- `docs/design-docs/`：设计与视觉决策
- `docs/QUALITY_SCORE.md`：领域与分层健康度
- `docs/PLANS.md`、`docs/exec-plans/`：计划生命周期、当前计划、技术债

## 工作约定

- 一次只做一个有边界的切面；改了行为就同步改规格与计划。
- 不能只靠读代码宣布完成：必须有跑过的命令、可打开的产物或测试。
- 数据只从 `evals/` 生成；页面只读，不做在线编辑；原始 JSON 不往页面外透出。
- 结论文案只在 `src/shared/findings.ts`，标签逻辑只在 `src/shared/tags.ts`——别在组件里写第二套说法。
- 命名 kebab-case，React 组件 PascalCase；文件软上限约 300 行，超了就拆。
- 测试就近放：页面逻辑用 `*.test.ts[x]`（在 `src/` 里），`tools/lib/` 里可单测的纯函数用 `*.test.mjs`（紧挨实现）——只有这两种位置约定，`npm test` 两个目录都会跑。
- 标签维度/取值变动要同步 `evals/tags.json`、`evals/schema.md`、`src/shared/tags.ts` 三处（`tags.test.ts` 有守卫用例）。
- 能力的"一句话说明"必须可溯源：第三方能力直译上游自带描述字段、自研能力照抄自己的规格文件，来源写进 `descriptionSource`（规则见 `evals/schema.md` 第一节，`ledger.test.ts` 有守卫）；**别把评测者的归纳或试用结论写进说明**。
- 反复出现的 review 反馈要升级成测试或检查，而不是在聊天里重复解释。

## 完成定义

一个改动只有在以下条件都满足时才算完成：

- 目标行为已实现，且五件套全绿（typecheck / lint / test / build）
- 验证证据挂到了相关 plan 或质量文档
- 受影响的文档仍然是最新的
- 仓库能按标准路径干净重启：`npm run data && npm run dev`

## 收尾

结束会话前：

1. 更新当前 active plan 的进度日志。
2. 领域或分层有明显变化时更新 `docs/QUALITY_SCORE.md`。
3. 延期处理的债务记到 `docs/exec-plans/tech-debt-tracker.md`。
4. 计划完成后把日志留在 `docs/exec-plans/`，别让过期计划混在 active 里。
5. 保证仓库可重启，并留下清晰的下一步动作。
