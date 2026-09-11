# ARCHITECTURE.md

这份文件是系统的顶层地图：领域地图、分层与依赖规则，以及这个仓库的工程约定。保持简短。

## 系统形态

- 产品：**能力台账**——记录候选 skill / agent / MCP 的试用、结论与证据。
- 主流程：跑一次试用 → 记一条 `evals/trials/*.json` → 聚合 → 在台账页面上读到结论与证据。
- 运行面：本地 Web 单页应用（`npm run dev`，端口 5183）+ 零依赖 Node 脚本；没有服务端、没有数据库。
- 边界：本仓库只做评测，但**是能力的唯一存放处**（已采纳 `adopted/`、候选 `candidates/`）；模板仓库只放工程骨架，不带能力内容，项目侧用 `harness-tool` 从本仓库安装。

## 领域地图

| 领域 | 负责什么 | 主要入口 | 对应规格 |
|------|---------|---------|---------|
| 已采纳能力 | 判 `adopt` 的能力内容：技能 / 子代理 / MCP + 来源、许可、采纳记录 | `adopted/` | `adopted/README.md` |
| 候选池 | 尚未采纳的能力：试用副本 + 来源与许可说明 + 试用产物 | `candidates/` | `candidates/README.md` |
| 评测数据 | 能力登记、标签表、单次试用记录 | `evals/capabilities.json`、`evals/tags.json`、`evals/trials/` | `evals/schema.md` |
| 数据聚合 | 把登记 + 试用聚合成页面可读的一份数据，并校验未登记标签 | `tools/aggregate.mjs` → `evals/results/app-data.json` | `evals/schema.md` |
| 评测执行 | **不自造引擎**：按能力类型调用成熟工具（技能→skill-up、子代理→promptfoo、MCP→内置协议探针），把报告翻译成 trial | `tools/skillup-bridge.mjs`、`tools/promptfoo-bridge.mjs`、`tools/mcp-probe.mjs` + dev 的 `/api/eval/*` | `evals/schema.md`、`docs/product-specs/capability-ledger.md` |
| 判定规则 | 由客观检查结果算出 adopt / hold / reject / retry，并回写能力登记 | `tools/lib/trial-record.mjs` 的 `decide()` / `upsertCapability()` | `evals/schema.md` |
| 台账 UI | 搜索、标签筛选、结论优先的两级记录视图 | `src/pages/`、`src/components/` | `docs/product-specs/capability-ledger.md` |
| 证据访问 | 页面里打开仓库内的证据与产物文件 | `vite.config.ts`（`/evidence/*` 中间件 + 构建期复制） | 本文件「横切接口」 |

## 分层模型

`evals JSON → src/shared（类型与文案）→ src/components → src/pages → App`

- `src/shared/`：类型、数据读取、标签与结论文案映射（纯函数，可单测）；不依赖 React 组件。
- `src/components/`：展示单元（印章、对照条、chips、筛选、台账行、试用记录、详情抽屉）；只接收 props，不直接读 JSON。
- `src/pages/`：页面级组合与交互状态（搜索、筛选、打开详情）。

**方向规则**：低层不知道上层存在；`evals/` 与 `tools/` 不知道 `src/` 存在。

## 硬性依赖规则

- 页面只读 `evals/results/app-data.json`（由 `tools/aggregate.mjs` 生成），不直接读 `evals/trials/*.json`。
- 结论文案只能来自 `src/shared/findings.ts`；标签逻辑只能来自 `src/shared/tags.ts`。
- **说明必须可溯源**：能力行上那句"这是干什么的"（`description`）只能来自能力自身的描述字段——第三方取上游 `SKILL.md` / `AGENT.md` 的 `description:` 或 `server.json` 的 `description` 并直译，自研能力原文照抄自己的规格文件；来源写在 `descriptionSource`（`tools/lib/trial-record.mjs` 的 `sourceDescription()` 会在登记时自动取，`src/shared/ledger.test.ts` 守卫）。**评测者的归纳、试用结论、实现细节一律不许写进说明。**
- 标签取值只能来自 `evals/tags.json`；未登记取值一律显示为「待确认」，由人确认后才写回标签表。
- 能力内容只放 `adopted/` 或 `candidates/`，不在 `src/`、`docs/` 里复制副本；安装命令是"数据字段"（`capabilities.json` 的 `howToUse`），不在组件里写死。
- 页面只读：任何"改数据"都回到 JSON 文件 + `npm run data`。**唯一例外是人评**——它只能在界面上产生，所以有 dev-only 的 `POST /api/review`，且只碰 `humanReview` 与 `judge`。
- 新增依赖要在 plan 或设计文档里说明理由。

## 工程约定

- **栈**：React 19 + Vite 8 + TypeScript（strict）+ AntD 6 + Vitest 5 + ESLint 10；Node ≥ 20。
- **样式**：不用 CSS Modules / Less，用 `src/styles/` 下按职责拆开的四份全局样式——`tokens.css`（色板与结论语气映射）、`app.css`（首页）、`record.css`（详情抽屉）、`responsive.css`（断点与动效降级）。组件里不写魔法色值，只用 token；BEM 类名，保持低特异度，别和 AntD 的 CSS-in-JS 互相抵消；要盖过 AntD 就限定作用域，不用 `!important`。
- **文案**：所有展示用的人话（结论、人评、指标、证据说明）集中在 `src/shared/findings.ts`，并有 `findings.test.ts` 覆盖——改文案就改测试。
- **命名与拆分**：文件 kebab-case、React 组件 PascalCase、hooks `use` 前缀；文件软上限约 300 行；测试就近放 `*.test.ts[x]`。
- **UI 验证**：`src/pages/home.test.tsx` 用真实评测数据在 jsdom 里渲染整页，断言"结论先出现、A/B 文案可读、搜索与筛选生效、每条试用都有自己的详情"；再手动 `npm run dev` 过一遍首页、筛选、详情与证据链接（当前环境无浏览器截图能力）。
- **数据校验**：`tags.test.ts` 守卫"页面维度 = 标签表维度"，维度增删必须三处同步（`evals/tags.json`、`evals/schema.md`、`src/shared/tags.ts`）。
- **提交信息**：`<type>: <短描述>`，type ∈ feat / fix / docs / refactor / chore / test / perf。

## 横切接口

| 关注点 | 允许的边界 | 备注 |
|-------|-----------|------|
| 仓库内文件访问 | `vite.config.ts` 的 `/evidence/<仓库内相对路径>` | 只放行"被登记为证据"的文件（trial 里的 `evidence` / `artifact` + `evals/schema.md`），其余 404；dev 走中间件，build 复制进 `dist/evidence/` |
| 数据来源 | `tools/aggregate.mjs` | 唯一聚合入口，零运行时依赖 |
| 试用的进程执行 | `vite.config.ts` 的 `/api/eval/*`（**仅 dev**）+ `tools/*-bridge.mjs`、`tools/mcp-probe.mjs` | 只接受校验过的能力名与 `owner/repo` 源（`NAME_RE` / `SOURCE_RE`），客户端不能传任意命令；子进程输出写文件（`.trial-runs/`，已 gitignore）而不是走管道；`run POST` 立即返回 id，前端轮询 `run GET?id=` |
| 人评写入 | `vite.config.ts` 的 `/api/review`（**仅 dev**） | 页面唯一的写路径：只改目标 trial 的 `humanReview` 与 `judge`（`saveHumanReview()`），trialId 必须命中已存在的 `evals/trials/<id>.json`（挡路径穿越）、verdict 只能是 up / down、理由 ≤300 字；写完自动聚合。**人评不改判定**（`verdict.decision` 仍由客观检查决定） |
| 样式 token | `src/styles/tokens.css` 的 `:root` 变量 | 组件里不写魔法色值 |

## 当前热点

- `src/shared/findings.ts`：结论 / 人评 / 指标 / 证据的文案映射集中在这里，还有对照级的 `systemSummary()`（"这一次哪一版更好"，规则写死在函数里、页面上照原样写依据），改动会同时影响台账行与详情，必须跟着改 `findings.test.ts`。
- `vite.config.ts` 的证据路由：路径拼接与"只放行已登记文件"是唯一的文件访问面，改错会影响详情里的「打开」。
- 样本少：4 个能力 / 13 条试用，但真实跑出结论的能力只有 `ponytail`、`frontend-design`、`brainstorming` 与新拉进来的 `ui-ux-pro-max`（4 条记录），"多能力 / 多试用 / 多维度筛选"的表现还没被真实数据压过。
- `tools/lib/engines.mjs` 的配置解析（`configuredEngine` / `configuredModel`）有单测（`tools/lib/engines.test.mjs`）：**它读的是 eval.yaml 的文本**，最容易被行内注释、缩进、同名键（`judge.model`）带偏——改它必须跟着改测试。
- `tools/lib/skill-content.mjs`：一份技能"到底有什么内容"的口径（frontmatter 的 `description` + 正文 + 被引用的技能）。**起草提示词、素材门槛、B 侧装几个技能都由它决定**，改之前先读 `evals/schema.md` 那节「转发壳技能」——那里写了为什么 `grill-me` 要把 `grilling` 一起装上。

## 变更检查

当你修改了会影响架构的代码：

1. 领域地图或允许边界变了 → 更新本文件。
2. 背后的设计理由变了 → 更新 `docs/design-docs/` 里的相关文档。
3. 规则应该机械执行 → 补一个测试或检查。
