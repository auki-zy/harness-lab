# evals/schema.md — 能力评测数据规范

> 目的：把"试用一个 skill / agent / MCP 是否真的提效、是否采纳"变成**可机读、可聚合、可回看**的数据，而不是散落的聊天与印象。

## 一、能力登记：`capabilities.json`

```json
{
  "version": 1,
  "updatedAt": "YYYY-MM-DD",
  "capabilities": [
    {
      "id": "frontend-design",
      "type": "skill",                  // skill | agent | mcp
      "source": { "repo": "anthropics/skills", "path": "skills/frontend-design/SKILL.md", "license": "Apache-2.0" },
      "localPath": "candidates/skills/frontend-design",   // 未采纳放 candidates/；判 adopt 后移到 adopted/
      "status": "candidate",            // candidate | trialing | adopted | rejected
      "priorEvidence": "人评 A/B：官方版胜过无技能基线",
      "addedAt": "YYYY-MM-DD",
      "tags": { "type": "skill", "purpose": ["ui-design"], "stage": "candidate", "source": "official" },
      "summary": "一句话结论：值不值得用、依据是什么（详情结论区显示）",
      "description": "一句话说明：这个能力是干什么的（台账行显示）",
      "descriptionSource": "这句话是哪来的（详情「来源与标签」显示）",
      "howToUse": "怎么用：一句能直接复制执行的命令（例：harness-tool add frontend-design）"
    }
  ]
}
```

### `description` / `descriptionSource`：说明必须可溯源，不许自己归纳

台账行只有这一句，所以它**不能是评测者读完正文后的印象**。规则：

| 能力 | `description` 取哪 | `descriptionSource` 写什么 |
|---|---|---|
| 第三方（有 `source.repo`） | 上游自带描述字段的**直译**：技能 `SKILL.md` 的 `description:`、子代理 `AGENT.md` 的 `description:`、MCP `server.json` 的 `description` | 「上游 <文件> frontmatter 的 description 直译」；若有缩写/省略，写明省了什么（例：ponytail 把触发词清单缩成一句） |
| 自研（`source.repo` 为空） | **原文照抄**它自己的规格文件（`AGENT.md` / `server.json`），不改写 | 「本仓库自研规格（<文件> 的 description 原文）」 |

- **不许写进去的东西**：我们的试用结论（那是 `summary`）、实现细节（读的是哪几个字段、有没有测试）、效果形容（"更省""更好用"）。
- 上游压根没写 `description:` 时：`description` 留空并在 `descriptionSource` 里注明「上游未提供描述」——**不要替它编一句**。
- 桥接登记时优先用 `--description`；没给就自动取上述字段原文（`tools/lib/trial-record.mjs` 的 `sourceDescription()`），所以第三方能力不会登记成空说明。
- 每一句都要在能力的 `SOURCE.md` 里留下原文（英文照抄 + 中文直译），方便对照复核。

## 二、能力标签：`tags.json`

标签维度与取值集中登记在 `evals/tags.json`：

| 维度 | 含义 | 当前取值 |
|---|---|---|
| `type` | 能力形态 | skill / agent / mcp |
| `purpose` | 解决什么问题 | ui-design / code-quality / testing / debugging / planning / docs / security / integration / knowledge |
| `stage` | 生命周期 | candidate / trialing / adopted / rejected |
| `source` | 来源 | official / community / self |

规则：

- **新取值第一次出现必须由人确认**：`tools/aggregate.mjs` 会把未登记取值收集成 `pendingTags`，台账页面标成「待确认」；确认后写回 `tags.json`，它才成为正式标签。
- 标签只负责分类与筛选，**不参与决策**；决策只看试用数据（见第六节）。
- 同一个维度允许多个取值（数组），例如 `purpose: ["ui-design", "docs"]`。
- 维度删减要同步改三处：本文件、`tags.json`、`src/shared/tags.ts` 的 `DIMENSION_ORDER`（`tags.test.ts` 有守卫用例）。

## 三、单次试用：`trials/<date>-<能力>-<工具>.json`

同一天对同一个能力再跑一次不会覆盖旧记录，而是加序号：`…-<工具>-2.json`（`tools/lib/trial-record.mjs` 的 `trialId()`）——每次运行都是一条独立记录，因为"连续两次通过"正是采纳依据。

### 3.1 用什么工具跑（按能力类型选成熟工具，不自造引擎）

| 能力类型 | 评测工具 | 怎么跑 | 桥接脚本（跑完写 trial + 聚合） |
|---|---|---|---|
| `skill` | [skill-up](https://github.com/alibaba/skill-up)（Apache-2.0，Go 单文件） | `skill-up run <能力>/evals/eval.yaml`；`benchmark.enabled: true` 会同时跑 `without_skill` / `with_skill`，正好是 A/B | `tools/skillup-bridge.mjs`（`auto` / `prepare` / `run` / `add-case` / `remap` / `import`） |
| `agent` | [promptfoo](https://github.com/promptfoo/promptfoo)（MIT） | `npx promptfoo eval -c <能力>/evals/promptfooconfig.yaml`；同任务跑 prompt A（不给规格）/ B（带 `AGENT.md`），断言判分 | `tools/promptfoo-bridge.mjs`（`run` / `import`） |
| `mcp` | 内置协议探针（可选官方 [MCP Inspector](https://github.com/modelcontextprotocol/inspector) 交叉验证） | `node tools/mcp-probe.mjs --name <名字>`：起 stdio 服务 → `initialize` → `tools/list` → 抽样 `tools/call` | 探针自己写 `candidates/mcp/<名字>/probe/<日期>.json` 并落账 |

**三种能力怎么发起评测**（页面那颗「开始评测」按钮与 CLI 是同一套）：

| 类型 | 页面里怎么发起 | 成本 | 前提 | 入口状态 |
|---|---|---|---|---|
| 技能 | 填**候选名**（跑它已有的用例）或**来源**（拉取 + 自动设计用例，写法见下） | 一次 A/B 的模型花费 | 本机有可用引擎（内置网关） | **开放** |
| 子代理 | 填**候选名** | 一次 A/B 的模型花费 | 有 `evals/promptfooconfig.yaml` | **注释掉了**（代码保留，见下） |
| MCP | 填**候选名**（零成本、秒级） | 0 | 有 `candidates/mcp/<名字>/server.json` | **注释掉了**（代码保留，见下） |

> **入口开关（2026-09-11）**：子代理与 MCP 的**页面入口与类型筛选先注释掉**——两者的口径还没想清楚（子代理的 A/B 是"提示级对照"还是"真跑 agent"；MCP 只做收录 + 可用性检查、结论是可用/不可用、不判采纳）。
> 工具、桥接、探针都还在仓库里，放开时改两处即可：`src/shared/entries.ts` 的 `OPEN_CAPABILITY_TYPES` 加上 `'agent'` / `'mcp'`，以及 `vite.config.ts` 的 `OPEN_TOOLS` 加上 `'promptfoo'` / `'mcp-probe'`（服务端会拒绝未开放的工具，所以两边都要改）。
> 台账里的 `task-scout` / `mcp-demo` 及其试用记录已整包归档到仓库外 `.archive/harness-lab-agent-mcp-2026-09-11/`。

### 3.1.1 来源（链接）怎么写

`tools/skillup-bridge.mjs` 的 `parseSource()` 认这几种写法——**浏览器地址栏里复制来的都行**（2026-09-11 之前只认前两种，从 GitHub 文件页复制来的 `blob` 链接会直接报"无法识别技能来源"）：

| 写法 | 例子 | 解析成 |
|---|---|---|
| 仓库页 | `owner/repo`、`https://github.com/o/r`、`o/r.git` | 仓库根，自己去找 `SKILL.md` |
| 指定技能目录 | `owner/repo:.claude/skills/foo` | repo + 子路径 |
| 文件页（blob） | `https://github.com/o/r/blob/main/.claude/skills/foo/SKILL.md` | 同上（**去掉文件名**那一段） |
| 目录页（tree） | `https://github.com/o/r/tree/main/.claude/skills/foo` | 同上 |
| 直链 | `https://raw.githubusercontent.com/o/r/main/…/SKILL.md` | 同上 |

- **能力名**取子路径最后一段（`…/ui-ux-pro-max` → `ui-ux-pro-max`），没有子路径就用仓库名；
- 仓库里有多个 `SKILL.md` 时**不会瞎猜**：直接把每个技能的目录列出来，并把 `owner/repo:子路径` 拼好让你复制（`tools/gen-eval.mjs` 与 `prepare` 都走这一套）；
- 只想确认"这条链接能不能用"、不想花钱：`node tools/skillup-bridge.mjs auto --input "<链接>" --dry-run` —— 只解析来源并确认找得到 `SKILL.md`，**不拉取、不出题、不跑**。

**按能力起草提示词**（页面上「提示词」那一格右边的「根据能力生成」）：`node tools/gen-eval.mjs --name <能力> --draft-prompt`
读这个技能的 `SKILL.md`，起草一条**贴合它**的任务（交付物形态按上面的规则定：视觉类给页面、代码类给小程序、流程类给文档），
**只打印到 stdout、不写文件、不跑评测**——用户改完再点「提交」，那条提示词会走 `--from-prompt` 那条路（LLM 裁判判 A/B）。
它解决的是"不填提示词时自动出的题可能不贴"这个场景：想自己出题又不想从零写，就先让模型起草。

**子代理评测走内部网关**（2026-09-11 起）：`evals/promptfooconfig.yaml` 用 OpenAI 兼容口径指向网关，key 由桥接从环境变量 / DSH 凭据注入子进程——

```yaml
providers:
  - id: openai:chat:deepseek-v4-flash
    config:
      apiBaseUrl: https://athenai.mihoyo.com/v1
      apiKeyEnvar: DEEPSEEK_API_KEY
      max_tokens: 8192          # 推理模型必须给够，否则额度全花在 thinking 上
```

离线自检仍用同目录的 `promptfooconfig.stub.yaml`（provider 是脚本假扮的，记录会被标 `selfCheck`）。

**写子代理断言的两个坑**（2026-09-11 真跑踩过）：
1. **推理模型的输出以 thinking 开头**，别要求"整段就是 JSON"；要从输出里**抠出 JSON 对象**再校验字段。而且 thinking 里也会有花括号，所以不能简单 `indexOf('{')`——要做括号配对、从后往前找第一个能解析的对象。
2. **promptfoo 会把断言失败的原因写进 `error` 字段**，别拿它当"工具报错"：桥接现在只在**provider 没有输出**（`!response || response.error`）时才算工具故障（判 `retry`），断言没过就是"能力没做到"（判 `reject`）。

**映射约定**（三套工具统一口径）：

- A 侧 = **不带能力**（skill-up 的 `without_skill`、promptfoo 的基线 prompt），B 侧 = **带能力**（`with_skill`、附规格的 prompt）；
- `measures.correctness.{A,B}` 记 0–1 通过率；工具自己报错的数量记到 `measures.errorCount.B`（或 `errorsB`），用来与"能力没做到"区分；
- `model` / `task.id` / `task.fixture` 照实写：`task.fixture` 指向能力目录里的 `evals/`（配置、用例、fixture）；
- 评测工具自己的原始报告留在 `evals/results/`（例：`promptfoo-<名字>.json`）或能力目录的 `*-workspace/`（skill-up 产出），trial 只留结论与指向。

**只导入报告**也合法（不想在现场装工具时）：`node tools/<tool>-bridge.mjs import --name <名字> --result <报告路径>`。

### 3.5 用户自己出的题（`--from-prompt`）：一句话跑 A/B

页面上除了"填能力名"，还可以**填一段自己的任务提示词**；后台就是 `skillup-bridge auto --prompt "<你的任务>"`：

```bash
node tools/skillup-bridge.mjs auto --input ponytail \
  --prompt "写一个 Node 脚本 dedupe.mjs：按行去重后打印到 stdout，只交付这一个文件" --task ask-dedupe
```

它做三件事，边界很清楚：

| 做什么 | 怎么做 |
|---|---|
| 把提示词落成用例 | **原样照抄**进 `evals/cases/ask-<id>.yaml` 的 `input.prompt`（不润色、不替用户改口径）；`taskId` 默认 `ask-<yyyymmddHHMM>`，也可以用 `--task` 指定 |
| A/B 怎么分 | `benchmark.enabled: true` → **A = 只给这段提示词；B = 提示词 + 技能正文**（skill-up 原生行为） |
| 怎么判 | **`agent_judge`（LLM 裁判）**，走内部网关（`judge.model: anthropic/<ATHEN_MODEL>`）；两条默认评判标准：① 只按用户给的这条任务要求判，不加别的标准；② 产出要能直接用（跑得起来、格式对），多余解释/额外文件/未要求的防御代码都算不达标。可加 `--criteria "<你的附加标准>"` |

- 这些"自己出的题"单独放 **`evals/eval.ask.yaml`**（只列 `ask-*` 用例，judge 是 agent_judge），**不动技能原有的用例套件**（`eval.yaml`）——两套可以并存，各自跑。
- **`judge.model` 是必填的**：skill-up 校验会直接报 `judge.model is required when judge.type is agent_judge`；`anthropic/<模型名>` 这个 provider 前缀会走 Anthropic 口径，正好命中我们注入的网关。
- 为什么用 LLM 裁判：自由提示词没有确定答案，字符串断言（must_contain）在这里基本没用；而 `judge` 含 `llm` 的试用，页面会照常展示「对比证据链」。

> 实测（ponytail + 用户提示词「写一个 dedupe.mjs…」）：**A 0/1 / B 1/1**——A 侧被判"多余解释/额外文件、产出不能直接用"，B 侧 3/3 断言通过；同时记录了 token（A 19,703 / B 18,181）与耗时（18.8 / 15.7 秒）。

**跑之前的坑（已修）**：skill-up 校验失败时会退出码非 0、什么都没跑；桥接原来"取最后一个 iteration"的写法会把**上一轮的旧报告**当成新结果再记一遍（真发生过一次）。现在改成：跑之前记下已有 iteration，只导入这次新增的那一轮，没有新增就直接失败、**不写任何试用记录**。

### 3.2 试用方式（`kind`）：决定要不要留产物、谁能判

| `kind` | 怎么做 | 产物 | 常用裁判 |
|---|---|---|---|
| `controlled` | 同一任务跑两遍：A＝不加载能力 / B＝加载能力 | 两版产物都留在仓库（HTML / 文件 / 产物快照） | `auto` + 人评 |
| `mock` **（默认）** | 固定任务与输入都 mock 在仓库里，看跑出来的结果 | 产物留在仓库 | `auto` / `llm`（需要时再加人评） |
| `live`（遗留） | 在真实项目里用一次；项目常在本仓库之外 | 不要求留产物 | 人评 |

另有 `selfCheck: true` 这个标记，和 `kind` 正交：**离线自检**——stub 引擎 / 仓库内夹具跑出来的记录（`tools/engines/*.js`、`tools/__fixtures__/`）。它证明评测链路通，**不证明能力有效**，所以 `previousPasses()` 会跳过它、页面在试用详情里明说、判定结果只能停在 `hold`，永远凑不成"连续两次"（bridge 会按引擎/provider 名字里有没有 `stub`、夹具路径里有没有 `__fixtures__` 自动打这个标记）。

> 默认选 `mock` 或 `controlled`：**评测材料必须能留在本仓库**（任务、输入、产物、检查结果）。
> 判 `adopt` 只看这两类：只有它们算"可复核试用"（`tools/lib/trial-record.mjs` 的 `previousPasses()` 只数这两类）。
> `live` 不再作为常规做法保留，只为已有记录兼容；结论只写"用在哪、结果如何"，不假装留了证据。

### 3.3 受控对比（`kind: "controlled"`）

```json
{
  "trialId": "2026-09-10-frontend-design",
  "capability": { "id": "frontend-design", "type": "skill" },
  "kind": "controlled",
  "task": { "id": "page-card", "fixture": "…/evals", "description": "同一个任务跑两遍" },
  "conditions": [
    { "name": "A", "withCapability": false, "artifact": "…/version-a.html" },
    { "name": "B", "withCapability": true,  "artifact": "…/version-b.html" }
  ],
  "measures": {
    "correctness": { "A": 1.0, "B": 1.0 },          // 可判定产物：0–1；流程型用 checklist 通过率
    "sizeKB": { "A": 12.2, "B": 14.6 },             // 可选：体积/行数等成本代理
    "staticChecks": { "A": "0 外链/脚本；1 @media", "B": "0 外链/脚本；5 断点" },
    "notes": "两版都能过静态检查"
  },
  "judge": ["human"],
  "humanReview": { "mode": "quick", "verdict": "up", "scores": null },
  "verdict": { "decision": "hold", "confidence": "medium", "reason": "客观检查通过，人评赞（未比较两版）" },
  "evidence": ["adopted/skills/frontend-design/EVIDENCE.md", "…/version-a.html"],
  "model": "…",
  "date": "YYYY-MM-DD",
  "recordedAt": "YYYY-MM-DDTHH:MM:SS+08:00"   // 记录时间；同一天记多条时用它决定"最近一次"
}
```

### 3.4 模拟场景（`kind: "mock"`，默认）

#### 用例可以自动出：`node tools/gen-eval.mjs --name <技能>`

新拉进来的技能不必手写用例。页面上那颗「开始评测」按钮背后就是这条链路（`skillup-bridge auto`）：**拉取 → 按 SKILL.md 自动设计针对性用例 → 校验 → 跑 → 落账**。

分工是刻意的——**模型只设计，代码只生成**：

| 谁 | 干什么 |
|---|---|
| 模型（走内部网关） | 读 `SKILL.md`，给出纯 JSON：任务说明、交付物名、初始输入、若干可判定用例（退出码 / stdout 精确相等 / 包含 / 不包含）、**一份参考实现**、以及从已登记词表里挑的 `purpose` 与设计理由 |
| 我们（`tools/gen-eval.mjs`） | 把 JSON 渲染成 `evals/cases/<task>.yaml` + `evals/fixtures/scripts/check-<task>.sh` + `evals/eval.yaml`：**判分 shell 由我们写**（模型不写 shell），并把踩过的坑固化进去——判分脚本自带输入、临时文件用工作区相对路径、stdout 与 stderr 分开捕获（任务本来就允许错误写 stderr） |

**自检是这套东西能信的关键**：生成完先拿模型给的 `referenceSolution` 在本地跑一遍它自己设计的 check，**跑不过就说明期望值或参考实现有错**（口径自相矛盾、算错数、漏算尾换行、参考实现本身违规），把失败原因回给模型重设计一次；两次都不过就**不写任何文件**（不往仓库里塞跑不通的用例）。生成结果里 `<task>.spec.json` 留档（谁设计的、参考实现、为什么能验），方便人工复核。

**交付物形态跟着技能走**（2026-09-11 修，真实反馈换来的）：以前硬性要求"写一个 Node 小程序"，于是 `ui-ux-pro-max` 这种 UI 技能被出了一道 mjs 命令行题——用户的原话是"两个 mjs，不知道干嘛用"。现在设计提示词里写死三条：

| 技能管什么 | 交付物 | 怎么判 |
|---|---|---|
| 界面 / 视觉 / 排版 / 交互 / 设计系统 | **一个自包含 `index.html`**（内联 CSS/JS，双击就能看） | 页面里的**字面量**：该出现的结构与文案（`mustContain`）、不该出现的（`mustNotContain`），外加最小字节数；"好不好看"由人打开页面看（两版产物在对照板里一点就开） |
| 代码质量 / 写法 / 精简 / 性能 | 一个小程序（`xxx.mjs`） | 退出码 + stdout 断言（原来的路子，不变） |
| 流程 / 计划 / 拆解 / 文档 | 一份 markdown / JSON | 逐字段检查 |

页面类交付物**另走一套判分脚本**（`renderPageCheck()`：不"运行"它，只读文件查结构），参考实现自检同样适用（把模型给的 HTML 写进临时目录跑一遍）。`collect_artifacts` 也要跟着收 `**/*.html`，否则页面产物摆不进 A/B 对照。

> 实测过这条自检真会拦人：一次设计的参考实现把错误栈打到 stdout（违反它自己的"出错时 stdout 为空"用例）、一次期望值自带尾换行（bash 捕获会吃掉），都被拦下并改好了。

**真用例生成后，脚手架留下的占位用例必须摘掉**（2026-09-11 踩过）：`prepare` 会给新技能放一个 `evals/cases/example.yaml`（标题写着"待改：这个用例要验什么"，判分脚本 `check.sh` 也是占位的），并挂进 `eval.yaml` 的 `cases.files`。自动设计完真用例后，`gen-eval.mjs` 现在会把这条占位条目**从 `cases.files` 里删掉**（只在它确实是占位——`id: example` 且写着"待改 / TODO"——时才删，人写的用例不动）。
不删的后果不是"多跑一条"这么轻：它永远过不了，把 B 侧通过率从 100% 拉到 50%，`decide()` 直接判 `reject`（"带能力也没把任务做对"）——**一个刚拉进来的技能会被自己的模板判死**。判断依据只认这两条，别按文件名删。

#### 提示词不许"泄漏"技能的做法（2026-09-11，A/B 有效性的前提）

A/B 比的是"**加载技能 vs 不加载**"两版的产出差异。A 侧手里只有那条任务提示词——**如果提示词里已经写了技能的那套做法，A 侧就白拿了一份技能说明，这次对照什么也比不出来**。踩过的两个具体例子：

- `grill-me` 被起草出一条把"≥12 轮 Q/A、章节结构、合格线、禁用空话"全写进去的任务。它的 SKILL.md 正文只有一句 `Call the Skill tool with "grilling".`——那套做法**那句转发里一个字都没有**，全是模型按"grill me"这个题材自己补的（内容其实在同仓库的 `grilling`，见下一节）；
- `ui-ux-pro-max` 的提示词里写着"对比度 ≥4.5:1、触控区 ≥44×44px、不得用 emoji 图标"——那是**技能自己的检查清单**，直接搬进了任务说明。

所以定下三条：

| 规则 | 怎么做 |
|---|---|
| **提示词写得像用户提需求** | 背景 + 交什么 + 放在哪 + **外部可观察的验收**（"手机上单手能翻完，出现横向拖动就算不能用"）；不写技能的方法/步骤/章节结构/计数/阈值/合格线/禁用词/评分标准 |
| **裁判口径中立** | `askCriteria()` 只按任务提示词里的要求判，**不许把某个技能的世界观当通用标准**（曾经这里写着"未要求的防御代码算不达标"——那是 ponytail 的主张，却对所有技能的对照生效，还和"别自己加要求"自相矛盾） |
| **素材太空的技能直接拦下** | 素材 = frontmatter 的 `description` + 正文 + 已解析的被引用技能（见下一节）；合起来 < 600 字符（真技能都在 5000+）时，`--draft-prompt` 直接拒绝并说明差在哪、该怎么办；自动设计只给一句警告（仍可当"空技能 vs 没技能"的对照跑，但别指望它证明这个技能有用） |

#### 转发壳技能：把内容所在的那个技能一起装上（2026-09-11）

`grill-me` 的 SKILL.md 正文只有一句 `Call the Skill tool with "grilling".`，内容全在同仓库的 `skills/productivity/grilling/SKILL.md`（上游本来就是成套发布，`grill-me` 是入口别名）。**素材门槛只看正文时，这种技能会被误判成"空壳、评不了"**——可它其实是个真能用的技能。四条处理：

| 步骤 | 怎么做 |
|---|---|
| 认出来 | `tools/lib/skill-content.mjs` 的 `referencedSkills()` 只认明确句式（`Skill tool with "X"`、`use the X skill`、`skills/X/SKILL.md`、`按 X 技能`）；普通行文里出现 "skill" 不算，冠词（`Call **the** Skill tool` 那个 "the"）也不算 |
| 拉下来 | 先用本地同名的候选技能，其次回**同一个仓库、同一个提交**取（不同提交的内容不能混着评）；放在 `<能力>/refs/<名字>/SKILL.md`，出处记 `refs/SOURCES.json`。`prepare` 自动做，本功能之前导入的老候选用 `refs --name <能力>` 补 |
| 让 B 用得上 | eval 配置的 `skills:` 列表里**追加一条** `path: refs/<名字>`：skill-up 的多条 `local_path` 会一起装进 B 侧工作区（实测：`with_skill` 侧的可用技能里同时出现壳和被引用的技能，`without_skill` 侧两个都没有）。不追加的话 B 只拿到那句转发、"grilling"根本没装 → B 必挂，比的成了"谁的技能不存在"。**原样导入的 SKILL.md 一个字不改**，拉来的内容单独放 `refs/` |
| 记在账上 | trial 的 `measures.notes` 写明"B 侧同时装了 X（这份 SKILL.md 是转发壳，内容实际来自那里）"，读者才知道结论是在什么条件下得到的 |

素材口径也一并改了：**frontmatter 的 `description` 算内容**。有些技能就是靠它说话的（它同时是模型看到的触发说明），只量正文会把这类技能误判成空壳。

**一个结构性的取舍要认清**：脚本判分的用例（自动设计那条路）**必须**把可判定的验收写进任务说明，否则没法逐字检查——所以那条路本质是在测"**照着一份明确规格实现得怎么样**"，技能的方法论价值会被压缩。**方法论类技能想验"有没有用"，走"自己出题 + LLM 裁判"那条路**（`--from-prompt` / 页面上的提示词框）。

##### 泄漏的第二种形态：触发条件与态度词（2026-09-11，用户实测发现）

上面那张表的禁写清单只列了"步骤 / 阈值 / 合格线"这些**做法**，于是起草模型照着字面遵守、实质照样泄漏：`grilling` 的 description 里写着 `Grill the user relentlessly about a plan… Use when the user wants to stress-test their thinking`，起草出来的提示词成了「把这份初稿里我还没想清楚、含含糊糊带过去的地方**全给我逼出来**，直接**摆到桌面上**让我拍板」——**"什么时候该用这个技能"被翻译成了"你要我做这件事"**。规则升级：

| 补的规则 | 内容 |
|---|---|
| 禁写清单加三类 | **触发条件**（`Use when…` / "当用户想…"）、**态度词**（relentlessly / 狠狠 / 逼问 / 拷问 / 挑刺 / 别放过任何一个含糊处）、**技能的主张** |
| 逐句自检 + 最终判据 | 写完逐句问"这是用户想要的结果，还是技能教导该怎么做/该怎么对待用户"；**最终判据：这条提示词交给一个没装任何技能的 agent，它也能照着做吗**——只有读过技能才知道该怎么做，那就是泄漏 |
| 反面也要防 | **别把验收标准写成技能做不到的事**：同一轮里"改过头"的那版写着"我不用再自己补决定、不用回头找你确认"，而 grilling 的产出恰恰是"等你拍板的问题清单"——B 会继续来问、A 会把方案直接定了，**A 反而"更听话"**。所以 **形状可以写（我要的是清单，不是改好的方案），得到形状的做法（轮次 / 顺序 / 态度 / 判断标准）不许写** |

素材侧也加了机械保障：`skillMaterial()` 的每一节标题都直接写明"这是做法，不许写进提示词"，并有守卫用例钉住（`tools/lib/skill-content.test.mjs`）——**反复出现的反馈要升级成检查，别在聊天里重复解释**。

> **待决定的结构性天花板**：grilling 这类"交互型"技能的价值在"问 → 你答 → 重算下一轮"，而 ask 用例是**单轮一次性产出**、评测里没有人回答，它的核心机制跑不起来。skill-up 其实**支持多轮**（`turns:` + 每轮断言 + `capture` 变量替换，见 [case-yaml.md](https://github.com/alibaba/skill-up/blob/main/skills/skill-upper/references/case-yaml.md)），可做"用户第 2 轮说'你定就行、别再问我'"这种**诱导拍板**的判别器；另一条路是把做法写进**判据**（以"用户会吃什么亏"的口吻，不抄技能的清单与阈值），提示词只留结果。两条路都改"这次对照判什么"，属口径决定。

把评测需要的东西都 mock 在仓库里：任务说明 + 输入样例 + 检查方式放在能力的 `evals/` 下（skill-up 用 `evals/cases/*.yaml` + `evals/fixtures/`，promptfoo 用 `evals/prompts/` + 断言），跑完把产物与检查结果留在同目录，记一条 trial。**这类试用的材料是自包含的，不依赖外部项目**，所以是默认做法，也是页面上发起评测走的路径。

#### 写检查脚本的两条硬规矩（2026-09-11 两次真跑翻车换来的）

第一次真跑（claude_code + Athen）四条用例全 FAIL，看下来**两条都是判分脚本自己的 bug**，不是能力没做到：

1. **判分脚本必须自带输入、自己造文件**：agent 在工作区里"造测试数据、清理临时文件"是常态——wc 用例的两个 agent 都把 `input.txt` 覆盖成自己的 2 行样例，tally 用例的 agent 清理时把 `events.jsonl` 删了。**别读工作区里那份输入**：让脚本自己写一份（heredoc / printf），再把它交给被测程序。用例侧可以用 `context.files` 内联输入（比 fixture 路径稳，不依赖路径解析）。
2. **临时文件放在当前目录、用相对路径传给程序**：`mktemp -d` 返回的是 Git Bash 的 `/tmp/tmp.xxxx/…`，而 Windows 上的 `node` 会把它解析成 `C:\tmp\…` → 四条用例全部 `ENOENT`。用 `.judge-input.txt` 这种工作区内的相对路径，跨平台都稳，别忘了 `trap ... EXIT` 清理。

> 判定"这次评测没用"和"这个能力不行"要看这些迹象：报告里 agent 自报"实现已通过自测"、但判分说"文件不存在/取值不对"——多半是脚本或输入的问题，判 `retry`，别急着 `reject`。

这类试用的 `judge` 记 `["auto"]`；skill-up 的 `agent_judge` 或 promptfoo 的模型判定会额外记 `llm`（页面会因此展示「对比证据链」）。

MCP 这类没有"带/不带能力"的对照，探针按固定检查项给分（握手、工具清单、描述与 `inputSchema`、抽样调用、干净退出、无硬编码密钥），通过率进 `measures.correctness.B`，A 侧不记或与 B 相同。

## 四、裁判规则（按能力类型选，不强求统一）

| 类型 | 主裁判 | 判定要点 |
|---|---|---|
| 可判定产物（代码/格式/转换） | `auto` | 用例断言 + 成本代理（行数/体积/次数） |
| 流程/方法（计划、调试、评审） | `llm` | 按 checklist 打分；看下游是否真跑通 |
| 审美/体验（UI、文档观感） | `human` | 规范符合（自动）+ 美感 A/B（人评） |
| 安全/边界（MCP 权限、危险动作） | `auto` + `human` | 对抗样例 + 人工复核授权面 |

`judge` 记的是**这次实际用了哪几种裁判**，由 bridge 按工具配置自动写（skill-up 的 `rule_based` / `script` → `auto`，`agent_judge` → `llm`；promptfoo 的断言 → `auto`，模型判定 → `llm`；MCP 探针 → `auto`）。想加人评就在 trial 里补 `humanReview` 与 `judge: [..., "human"]`。

**证据链规则**：`evidence` 每次都照实记录（留痕与以后复核用），但**页面只在评判可复现时才展示"对比证据链"**——`judge` 含 `llm` 或 `auto` 才展示；只由 `human` 评判的试用不展示这一块（人评是主观判断，摆证据像在给主观结论贴客观标签），并按试用方式给一句准确说明（受控对比 → 产物在「条件」里；`mock` → 产物在仓库里；`live` → 项目在别处，只留结论）。
## 五、人评两级（省时间的默认是①）

| 级别 | 何时用 | 记什么 |
|---|---|---|
| **① 快速**（`mode:"quick"`） | 大多数情况 | `verdict`（**up 赞 / down 踩**）+ 可选 `better`（A/B/tie）+ 一句话理由 |
| **② 详细**（`mode:"detailed"`） | 结论有争议、或要做方法论沉淀时 | 7 维各 1–5 分 + 合计（见候选的 `benchmarks/SCORING.md`） |

> 原则：**先给一句"赞/踩"**，别为了打分而打分；只有需要比较同类能力、或要复盘时才展开明细。

### 页面上的人评入口（👍 / 👎 + 可选理由 + 二次确认）

试用详情（二级抽屉）的「评审人怎么说」下面就是入口，**只在 `npm run dev` 下出现**：选 👍 或 👎（必选）→ 可选写一句理由（≤300 字）→ 点提交 → **弹一次确认** → 才写库。写的是这条 trial 的 `humanReview`：

```json
{ "mode": "quick", "verdict": "up", "reason": "……（可省略）", "scores": null, "reviewedAt": "2026-09-11T03:51:04.350Z" }
```

- 接口：`POST /api/review`（`{ trialId, verdict: "up"|"down", reason? }`，dev-only，`vite.config.ts` 的 `saveHumanReview()`）；写完自动聚合。校验：trialId 必须匹配已存在的 `evals/trials/<id>.json`（挡路径穿越）、verdict 只能是 up/down、理由超长直接 400。
- 写入时会在 `judge` 里补上 `human`（页面据此显示人评相关内容）。
- **保留规则**：同结论重提且没写新理由 → 保留上次那句；**换了结论又没写理由 → 留空**，不替评审人编一句。
- **人评不改判定**：它只进 `humanReview`，`verdict.decision` 仍由客观检查决定（见第六节）；页面也会写明这一点，避免"点了踩却没变结论"的误会。

> **记录纪律**：`better`（哪版更好）与 `reason`（理由）**只在评审人真的说了的时候才写**。评审人只给了 👍/👎 就只记 `verdict`——不要替他推断结论或补写理由；`verdict.reason` 里描述人评时，也只陈述他确实给过的东西（页面会对"有人评但没比较两版"如实显示）。

## 六、决策规则（写死在 `tools/lib/trial-record.mjs` 的 `decide()`，避免摇摆）

判定只看**客观检查**（工具跑出来的 A/B 通过率），人评是附加信号，不改变这几条分支：

| 输入 | 结论 | 含义与后续 |
|---|---|---|
| 报告里没有 B 侧结果 | `retry` | 评测没真跑起来，先修环境 |
| B 侧全是工具自身报错（`errorsB >= totalB`） | `retry` | 是工具的锅，不记在能力头上 |
| B 侧通过率 < 100%（`passRateB < 1`） | `reject` | 带能力也没把任务做对；无增益或更差 |
| B 侧全过，且此前已有 ≥1 次可复核试用通过 | **`ready`** | **机器判定达标——采纳与否由人定**（见下） |
| B 侧全过，但只有这一次 | `hold` | 留在候选池，再跑一次同类试用即可达标 |

**`ready` 与"采纳由人定"（2026-09-11 改）**：机器跑到最后一步**不再自动采纳**。理由：客观证据只回答"任务做对没有"，
"值不值得装进我的项目"还要看团队规范、维护成本、和自己的习惯合不合——那是人的判断。所以：

- `decide()` 给的是 `ready`（印章「待确认」），能力状态**停在 `trialing`**；
- `adopted` / `rejected` 只能由人给：页面能力详情「我的结论」里点采纳 / 不采纳 →
  `applyHumanDecision()` 写 `capabilities.json` 的 `humanDecision { verdict, reason, reviewedAt }` 并同步 `status`；
- 试用人评（每条一份、👍/👎）是**素材**：页面把它们汇总成一句话（几条、赞踩各几、几次选了加载能力那版），
  人做结论时看的就是这个汇总 + 机器建议；
- 历史遗留：`frontend-design` / `ponytail` 的 `adopted` 是按旧规则（机器自动采纳）来的，保留不改；
  它们没有 `humanDecision`，你可以在「我的结论」里补一句确认。

**`retry` 不是对能力的结论**，所以：

- 判定理由里必须写清**真正的原因**（bridge 会把报告里的 `error` 原样带上，例：「agent execution failed: qodercli run failed (exit 127): command not found」），别只写"工具报错"；
- **不许改能力级的 `summary` / `priorEvidence` / `tags.stage`**——`upsertCapability({ decision: 'retry' })` 会跳过这三项（踩过：一次引擎没装的 retry 把 ponytail 的结论覆盖成了"暂不采纳：这次评测本身报错了"）；
- **跑前检查失败连 trial 都不写**：技能评测在启动 skill-up 之前会确认两件事——引擎命令在 PATH 上、而且已经登录（`tools/lib/engines.mjs` 的 `engineStatus()` / `engineAuth()`，都是本地命令、不花额度）；缺任一项就直接报错退出，不产生记录、不算一次试用。

- 「此前通过」只数 `controlled` / `mock`（`previousPasses()` 的口径），而且**跳过 `selfCheck: true` 的离线自检**——不然拿 stub 跑两次就能"采纳"一个能力；`live` 记录同样不参与计数，只能写进 `verdict.reason` 当加分证据；
- **历史记录**：`2026-09-10-frontend-design` 是按更早的规则（1 次可复核试用 + 人评赞）判的 `adopt`，reason 里写明了这一点；新记录一律按上面的表判；
- 每次都**必须**以 adopt / hold / reject / retry 之一收尾——没有结论的试用等于没做；
- 想加人评：记 `humanReview` 并在 `judge` 里加 `human`，页面会如实显示；人评赞**不**顶替上面的客观分支（快速档 7 维打分的详细口径见候选目录的 `benchmarks/SCORING.md`，仅用于争议复盘）。

### 怎么攒够"两次"

**一次 = 一条 trial 记录**（一次评测运行），所以最省事的做法就是在页面上再点一次「开始评测」——同一天重跑不会覆盖上一条（文件名会是 `…-2`），判定读到"此前已通过 ≥1 次"就转 `adopt`。

两种"第二次"的证明力不同，按需要选：

| 第二次怎么做 | 证明了什么 | 怎么做 |
|---|---|---|
| **换一条用例**（推荐） | 换场景还灵——不只是在一条题上凑巧 | `node tools/skillup-bridge.mjs add-case --name <能力> --task <用例 id>` 建好用例与检查脚本并挂进 `eval.yaml`，改完 `skill-up validate` 再跑 |
| 同一条用例重跑 | 稳定性（同样的题两次都对） | 直接再点一次「开始评测」 |

一次运行里可以挂多条用例（`cases.files` 列几个就跑几条）：新用例的 `task.id` 会记成 `a+b`，`notes` 里也会写清这次覆盖了哪几条——但**那仍然只算一条 trial**，"两次"指的是两条记录。

### 两级结论，不许混着写

| 级别 | 存在哪 | 讲什么 | 不许写什么 |
|---|---|---|---|
| **试用级** | `trials/*.json` 的 `verdict.decision` / `reason` | **只讲这一次**：这次的条件、产物、评判、结果 | 别的 trial 的结论或证据；"综合几次试用……"这类整体判断 |
| **能力级** | `capabilities.json` 的 `status` / `summary` / `priorEvidence` | 这个能力整体值不值得用、为什么 | 单次试用的细节堆砌 |

页面上的分工：台账行与详情顶部的印章是**能力级**（由 `status` 决定，试用中则退回最近一次试用的结论），试用列表与试用详情里的印章是**该次**的结论。
反例（曾经犯过）：把"受控对比通过 + 两次人评赞 → 采纳"写进某一条 trial 的 `reason` 里——那条记录就同时装了两次试用的评价，读起来像是这次试用得出的结论。

### 系统小结：这一次对照里哪一版更好（`src/shared/findings.ts` 的 `systemSummary()`）

试用详情看完「客观指标」之后，页面会说清 **A / B 各自好在哪、并给一句推荐**。这是**对照级**判断（这一次的 A 与 B 谁更值得用），与"这个能力值不值得采纳"（能力级，由第六节的 `decide()` 按客观通过率决定）是两件事——推荐**不**改判定、**不**改状态。

规则写死在 `systemSummary()`，页面上把依据原样写出来，免得看起来像凭空冒出来的意见：

| 情况 | 推荐 | 说明 |
|---|---|---|
| 一版做到、另一版没做到 | 推荐做到的那版 | 正确性优先，成本根本不参与 |
| 两版都没做到 | **不给推荐** | 先改任务说明或判据，别在两版都不及格里挑赢家 |
| 两版都做到、有人评选了某一版 | 推荐人评选的那版 | 审美这类主观维度只有人能判 |
| 两版都做到、没有人评 | 比成本与效率：总 token → 耗时 → 工具调用 → 产物大小 | 差 **5%** 以内算持平、不算优势；一边赢的维度就推荐它 |
| 两版都做到、各有胜负（A 省 token / B 更快…） | 如实说"各有胜负"并列出各自赢在哪 | 不硬挑赢家 |

细节约定：

- 百分比**以另一侧为基数**（A=100k、B=60k → "B 少 40%"）：用较小值当基数会算成"少 67%"，跟人的直觉不一致（踩过）；
- 只比 `tokensTotal` / `durationSec` / `toolCalls` / `sizeKB` 这几个**数值型**维度，且两侧都有数才算；`toolMix`、`staticChecks` 这类文本维度只摆事实、不参与推荐；
- 每侧最多列 3 条"好"、2 条"差"，页面侧签名会标出被推荐的那侧；
- 缺数据的维度直接跳过（例如只记了正确性的老记录也照样能给出小结）。

## 七、聚合产物

`tools/aggregate.mjs` 读取 `capabilities.json` + `tags.json` + `trials/*.json` → 输出一份 `evals/results/app-data.json`：含标签体系、待确认标签、每个能力的全部试用与最近一次试用。台账页面（`src/`，Vite + React + AntD）只读这一份，不直接读 `trials/`。每个 bridge 写完 trial 都会自动调用它，也可以手动 `npm run data`。

页面呈现的规则见 `docs/product-specs/capability-ledger.md`。

## 八、对照维度（比什么）

"这个能力值不值得用"不能只看"做没做对"——**做对了也常常更贵、更慢、更啰嗦**。所以从 2026-09 起，一次试用的 `measures` 里除了正确性与体积，还默认收这些**成本与效率维度**（能拿到就记，拿不到就不摆那一行）：

| 维度 | 字段 | 单位 | 读数 | 谁能给 |
|---|---|---|---|---|
| 是否做到任务要求 | `correctness` | 0–1 | 用例通过率（**判定的唯一输入**） | 三套工具 |
| 产物文件大小 | `sizeKB` | KB | 交付物体积 | skill-up / 人工 |
| 输入 token | `tokensIn` | 个 | 送进模型的量；越少越省 | skill-up、promptfoo |
| 输出 token | `tokensOut` | 个 | 模型吐出的量；反映啰嗦程度 | skill-up、promptfoo |
| 总 token | `tokensTotal` | 个 | 一次试用的总账 | skill-up、promptfoo |
| 缓存命中的 token | `tokensCached` | 个 | 单轮最高缓存读量；越高说明上下文复用越好 | skill-up（抄引擎转录） |
| 耗时 | `durationSec` | 秒 | 墙上时间（多条用例累加；promptfoo 取平均延迟） | 三套工具 |
| 交互轮次 | `steps` | 轮 | agent 与引擎来回几次；越少越利落 | skill-up（`turns`） |
| 工具调用次数 | `toolCalls` | 次 | 调了多少次工具 | skill-up（抄引擎转录） |
| 工具调用构成 | `toolMix` | 文本 | 例：`Bash 5 / Write 2`；看得出是"在看"还是在"在改" | skill-up |
| 花费 | `costUsd` | 美元 | 有价格才记 | promptfoo |
| 功能清单 | `toolList` | 文本 | MCP 专用：`tools/list` 报出来的工具（缺描述/入参 schema 会标出来） | MCP 探针 |
| 静态检查明细 | `staticChecks` | 文本 | 断言/检查的结果说明 | 三套工具 |

**这些维度只用于"对照"，不参与判定**：`decide()` 仍然只看 `correctness.B`（见第六节）。理由：成本是**权衡**不是**门槛**——一个技能多花 10% token 但少写一半代码，该不该采纳是人的判断，不该写死在规则里。页面上的「客观指标」表把它们逐行列出，并给一句"谁比谁多多少"（只说事实）；"哪一版更好"的判断单独放在紧随其后的「系统小结」里，按第六节的规则给，同样不参与 `decide()`。

### 为什么是这几个（以及为什么没有别的）

2026 年主流的 agent/LLM 评测在"任务成功率"之外基本都盯这四类：**花了多少（token / 成本）、多快（延迟）、多绕（轮次 / 工具调用）、稳不稳（重复跑的一致性）**——见 [τ-bench 的 pass^k 与可靠性口径](https://qaskills.sh/blog/tau-bench-agent-evaluation-guide-2026)、[OpenTelemetry GenAI 观测约定（token 与 span 时长）](https://opentelemetry.io/blog/2026/genai-observability/)、[Braintrust 的 agent 评测维度](https://www.braintrust.dev/learn/ai-agent-evaluation/v0)、[promptfoo / DeepEval / Braintrust 对比](https://www.developersdigest.tech/blog/ai-agent-evaluation-tools-compared-2026)、[agent 可靠性基准（多轮重复）](https://www.getwidget.dev/benchmarks/agent-reliability-2026-q3/)。

我们**没有**集成、以及原因：

- **美元花费（skill-up 侧）**：走内部网关（Athen）没有对外价格，硬按公开价折算会给出假数字；所以技能试用只记 token，`costUsd` 只在 promptfoo 真报价格时出现。
- **可靠性 / 抖动（pass^k、重复跑的方差）**：skill-up 有 `--iteration N` 可以直接重复采样，但**还没接进桥接**；现在的替代做法是"两次可复核试用"（见第六节）。要接的话是 `run --iteration` + 把方差记成 `measures.variance`。
- **安全 / 越权**：MCP 探针已经在查"密钥只写 `${ENV_VAR}` 占位"，但没有系统化的对抗样例；等有真实需求再加。
- **人评一致性（多人评分者间一致性）**：本仓库一人使用，无意义。

### 老记录怎么补上新维度

映射升级后不必重跑评测：`node tools/skillup-bridge.mjs remap --trial <trialId> --result <报告目录>` 会按最新映射重算 `measures` / `conditions` / `evidence` / `task` / `model`，**不动结论与人评**（原始报告还在 `*-workspace/iteration-N/` 里就能补）。已有记录就是这么补上 token / 耗时 / 轮次 / 工具调用的。

## 九、MCP 怎么评：三档深度，别混为一谈

MCP server 本质是"给 agent 加几个 API 工具"，所以它的问题不是"像不像 skill 那样能对照"，而是**问到哪一层**。我们分三档，逐档都能落到台账里：

| 档 | 做什么 | 成本 | 结论能到什么 | 实现 |
|---|---|---|---|---|
| ① **收录**（catalog） | 只登记来源、许可、`server.json` 预设与工具清单；一行都不跑 | 零 | `candidate`（页面显示"还没试过"） | 手写 `candidates/mcp/<名字>/{server.json,MCP.md,SOURCE.md}` |
| ② **可用性检查**（probe） | 起 server → `initialize` 握手 → `tools/list`（功能清单：名字 / 描述 / `inputSchema`）→ 抽样 `tools/call`；另外查密钥只写 `${ENV_VAR}` 占位、进程能干净退出 | **零模型成本** | **`available`（可用）/ `unavailable`（不可用）** 两档，**不是"挂起"、也不是"采纳"** | `node tools/mcp-probe.mjs --name <名字>`（CLI 可加 `--inspector` 用官方 Inspector 交叉验证） |
| ③ **任务级对照**（task A/B）**（未建，路线决定不做）** | 同一个任务跑两遍：A **不接**这个 server / B **接上**它，比正确性 + token/耗时/工具调用，并断言"确实调用了这个工具" | 一次 A/B 的模型花费 | 假如做了，这一档才谈得上"采纳" | `evals/eval.yaml` 的 `mcp.servers`（skill-up 支持：`mode: real\|mocked`、`transport: http\|stdio`、`config_ref` 指向 `evals/fixtures/mcp/<名字>.yaml`） |

**可用性检查的两个结论**（MCP 专用，和采纳流程分开）：

| 结论 | 什么时候 | 印章 | 能力级 `summary` |
|---|---|---|---|
| `available` | 全部检查项通过 | **可用**（玉色，和"采纳"同一档视觉，但语义是"能用"） | 「可用：可用性检查通过（6/6 项，工具 wc_stats / echo）。这一档只看"能不能用、工具全不全"，不判"值不值得装进项目"。」 |
| `unavailable` | 有检查项没过 | **不可用**（朱色） | 「不可用：可用性检查没过（N/M 项），卡在「握手」——协议层就有问题，先修好再用。」 |
| `retry` | 探针自己没跑起来（连 server.json 都读不到等） | 重试 | 不写能力级结论 |

- 这两档**不改生命周期状态**：MCP 的 `capability.status` 停在 `trialing`、`tags.stage` 不变（它反映"还没采纳"，不是"用不了"）；页面印章读的是"最近一次可用性检查"的结果，所以 MCP 行显示的是 **可用 / 不可用**，不会一直挂起。
- `previousPasses()` 跳过 `probeOnly` 记录 → 可用性检查**永远凑不出"采纳"**；
- 记录必须带 `measures.toolList`（功能清单）与 `probeOnly: true`，`ledger.test.ts` 守这两条。

> **路线决定（2026-09-11）**：MCP **只做 ① 收录 + ② 可用性检查，不做 ③**。理由：现在需要的是"这个 server 能不能用、工具全不全、密钥有没有落盘"这类**零成本、可判定**的事实；而"值不值得装"的判断在没有真实 server 要上线的场景下投入产出低。所以 MCP 的结论就是**可用 / 不可用**两档，**不会出现在"已采纳"里**——这正是它的真实状态。将来真要判价值时，③ 的入口就是上表最后一行（skill-up 原生支持），不用改数据结构。

**为什么 ② 不能采纳**：探针通过只证明"这个 server 起得来、工具列得出、调得通"——那是最低门槛，不是价值判断。谁都能通过的检查不该换来"已采纳"。所以：

- 探针记录会带 `probeOnly: true`，`previousPasses()` 跳过它，判定只能停在 `hold`，理由里会写明"要判采纳得跑一次任务级对照"；
- 页面把这类记录标成「**可用性检查**」（不是"试用"），明细里列出**功能清单**那一行；
- `ledger.test.ts` 守着：`source.tool === 'mcp-probe'` 的记录必须带 `probeOnly`，且这类记录不许出现 `adopt`。

**为什么 ③ 才算评测**：工具的价值只能体现在"有了它，任务做得更好或更省"。A/B 的两侧不是"带不带技能正文"，而是"连不连这个 server"；断言可以要求 `tool_called`（真的用上了），成本维度看它有没有省下步骤/token。**没有 ③ 的 MCP 只算收录 + 冒烟**，别在台账上给它"已采纳"的印章。

**不做的事**：不做 server 内部实现的单元测试（那是作者自己的 CI 该干的）；除探针里的静态密钥检查外，不做权限/越权的系统化对抗（等真实需求再补）。
