# harness-lab

**能力评测实验室**：一个独立的小仓库，只回答一个问题——

> 某个 skill / agent / MCP **是不是真的提效、值不值得采纳**？

它把"试用 → 证据 → 打分 → 采纳/挂起/放弃"变成**可机读、可聚合、可回看**的数据和一个台账页面。**它是能力的唯一存放处**：已采纳的放 `adopted/`，候选放 `candidates/`，项目里只放安装副本（用 harness-tool 装）。

## 目录结构

```text
harness-lab/
├── AGENTS.md / ARCHITECTURE.md      # 入口路由与系统地图（含工程约定）
├── adopted/                         # 已采纳的能力（本仓库是唯一存放处）
│   └── skills/frontend-design/      # 例：技能 + SOURCE.md + 许可 + 试用产物
├── candidates/                      # 未采纳的候选：skills / agents / mcp 三类
│   ├── skills/ponytail/             # 技能候选：SKILL.md + evals/（skill-up 配置）
│   ├── agents/task-scout/           # 子代理候选：AGENT.md + evals/（promptfoo 配置）
│   └── mcp/mcp-demo/                # MCP 候选：server.json + MCP.md
├── evals/
│   ├── schema.md                    # 评测数据规范（三套工具的判定口径与落账方式）
│   ├── tags.json                    # 标签表（类型 / 用途 / 阶段 / 来源；新取值需确认）
│   ├── capabilities.json            # 能力登记（candidate → trialing → adopted/rejected）
│   ├── trials/<date>-<id>.json      # 单次试用记录（controlled / mock 两种）
│   └── results/                     # 聚合产物（页面读 app-data.json）与外部工具报告
├── tools/                           # 评测工具桥接 + 聚合（零依赖）
│   ├── aggregate.mjs                # evals/ → app-data.json
│   ├── skillup-bridge.mjs           # 技能：skill-up 报告 → trial（含 prepare 拉取技能）
│   ├── promptfoo-bridge.mjs         # 子代理：promptfoo 报告 → trial
│   ├── mcp-probe.mjs                # MCP：协议探针（可选官方 Inspector 交叉验证）
│   ├── lib/trial-record.mjs         # 共用记账：判定规则 / 能力登记 / 写 trial / 聚合
│   ├── engines/                     # 离线自检用的 stub 引擎（不调用模型）
│   └── __fixtures__/                # 演示用最小 MCP server
├── src/                             # 台账页面（Vite + React + TypeScript + AntD）
└── docs/                            # 计划、质量分、页面规格、设计决策
```

## 跑起来

```bash
npm install                 # 首次
npm run data                # 聚合 evals/ → evals/results/app-data.json
npm run dev                 # 台账页面：http://localhost:5183
```

五件套门禁：

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## 页面能做什么

- **台账行**：结论印章（采纳 / 挂起 / 放弃 / 重试 / 未评估）+ **一句话说明**（这个能力是干什么的）+ 标签；右侧是"这次是怎么试的"（A/B 对照条：选中侧只打勾）、试过几次、**已采纳能力的安装命令（点一下就复制）**。
- **搜索**：**只匹配名称与说明**（来源、标签、试用内容不参与——按标签找用下面的筛选）。
- **标签筛选**：按 `evals/tags.json` 的四个维度（类型 / 用途 / 阶段 / 来源）过滤；同维度多选＝任一命中，跨维度＝同时满足；未登记取值标成**待确认**。
- **详情（两级抽屉）**：
  - 一级 = 能力记录，五个模块：**结论 → 采纳/放弃原因 → 如何使用 → 试用记录（紧凑小表格，一页 5 条、可翻页）→ 来源与标签**；
  - 二级 = 单次试用详情，**重点是开头那块前后对照**：A / B 两栏各自「做到了没有 + 关键数字 + 打开产物」，下面一句 `A → B` 的对照结论（例：`两版都做到了任务要求；产物 0.6 KB → 0.7 KB（变大 17%）；token 80,731 → 83,451（变多 3%）`）；接着是**全部客观指标**，再一块**「系统小结：哪一版更好」**——分栏说清 A / B 各自好在哪，给一句推荐并写明依据（正确性优先 → 人评优先 → 比总 token / 耗时 / 工具调用 / 产物大小，差 5% 以内算持平），它**只判这一次对照、不改判定**；任务说明、评判方、模型都往后放，属于"想看细节再看"；**人评入口也在这一层**；
  - 二级末尾是**对比证据链**，做成**三档视图**（默认落在最该看的那个）：**A / B 对照**（只有两栏，栏头写清哪一边 + 做到没有，可切「并排 / 差异」看逐行增删）→ **怎么判的**（把判定记录读成"逐条判据 × A / B 过没过"，过没过一目了然）→ **原始文件（N）**（按"证明什么"分组的文件列表 + 右侧原文，技能自带那组默认折叠）。
- **比什么**：不只比"做没做对"，还逐行比**成本与效率**——输入/输出/总 token、缓存命中、耗时（秒）、交互轮次、工具调用次数与构成、花费、产物大小（拿不到的不摆空行）。这些只作对照，**判定仍只看客观通过率**；维度定义与来源见 `evals/schema.md` 第八节，「哪一版更好」的小结规则见第六节。
- 不暴露原始 JSON：要看数据就改 `evals/` 再 `npm run data`。

## 评测怎么跑：三套开源工具 + 一个台账

**评测引擎不自己造**——按能力类型选用成熟工具，各自跑完由 `tools/` 里的 bridge 把报告落成台账里的 trial：

| 能力类型 | 评测工具 | 跑评测 | 落账 |
|---|---|---|---|
| 技能（skill） | [skill-up](https://github.com/alibaba/skill-up)（Apache-2.0） | `skill-up run <技能>/evals/eval.yaml`（`benchmark.enabled` 会同时跑 with/without = B/A） | `node tools/skillup-bridge.mjs run --name <名字>` |
| 子代理（agent） | [promptfoo](https://github.com/promptfoo/promptfoo)（MIT） | 同一任务跑 A（不给规格）/ B（带 AGENT.md），用断言判定 | `node tools/promptfoo-bridge.mjs run --name <名字>` |
| MCP server | 内置协议探针（可选官方 [MCP Inspector](https://github.com/modelcontextprotocol/inspector) 交叉验证） | `node tools/mcp-probe.mjs --name <名字>` | 探针自己就写台账 |

> **MCP 分三档看深度**（详见 `evals/schema.md` 第九节）：**① 收录**（只登记来源与工具清单，不跑）→ **② 可用性检查**（协议探针：握手 / 功能清单 / 样例调用 / 密钥占位，**零模型成本，但判不成"已采纳"**）→ **③ 任务级对照**（同一任务 A 不接 server / B 接上它，比正确性与 token、耗时、工具调用；skill-up 原生支持，但目前**不做**）。
> **当前路线：MCP 只做 ①②**——结论就是 **可用 / 不可用** 两档（印章直接显示，不会一直"挂起"，也不会出现在"已采纳"里）；详情里给它一行**功能清单（tools/list）**。要升级到 ③ 时不用改数据结构，只加 `mcp.servers` + 用例。

> **技能评测需要一个能用的 agent CLI（引擎）**：skill-up 自己不做推理，它调用 `claude` / `codex` / `qodercli` / `qwen` 之一干活，写在能力的 `evals/eval.yaml` 的 `engine.name` 里。
> 跑前检查会先确认两件事：**命令在 PATH 上**，而且**已经能用**（claude 走内部网关或 `claude auth status`、codex 走 `codex login status` + 本地 key 健全性检查——都是本地命令、不花额度）。任一不满足就直接报错、**不跑也不写记录**，否则每个用例都会以 exit 127 / 401 报错，白跑一轮还留一条没信息量的"重试"。
>
> **内部网关（Athen）**：`claude_code` 可以完全不走官方登录——只要 `$ANTHROPIC_AUTH_TOKEN` / `$ANTHROPIC_API_KEY` / `$DEEPSEEK_API_KEY` 之一有值，或者 DSH 的凭据文件（`~/.dsh/.credentials.yaml`）里有 key，桥接就会给子进程注入 `ANTHROPIC_BASE_URL=https://athenai.mihoyo.com` + token，**模型默认 `deepseek-v4-flash`**（`ATHEN_MODEL` 可换）。key 只在运行时从环境/凭据文件读，**不落进本仓库、也不打印**。实测：`deepseek-v4-flash` 走网关能被 Claude Code 正常驱动（含工具调用、写文件），一条用例约 5–50 秒。
> 换引擎：`node tools/skillup-bridge.mjs run --name <名字> --engine codex`，或在页面的「更多选项 → 引擎」里选（默认会挑本机可用的那个）。子代理（promptfoo exec provider）与 MCP 探针不需要引擎。

也可以**只导入报告**（不需要装工具/引擎）：`…-bridge.mjs import --name <名字> --result <报告路径>`。

命令行跑一遍（以技能为例）：

```bash
# 1) 拉技能进候选池，并按 skill-up 约定脚手架出 evals/ 模板
node tools/skillup-bridge.mjs prepare --source DietrichGebert/ponytail --name ponytail
# 2) 改 evals/cases/*.yaml 的用例与 evals/fixtures/scripts/check.sh，然后校验/运行
skill-up validate candidates/skills/ponytail/evals/eval.yaml
skill-up run    candidates/skills/ponytail/evals/eval.yaml
# 3) 把报告映射成台账记录（并更新登记、聚合）
node tools/skillup-bridge.mjs import --name ponytail --result candidates/skills/ponytail-workspace/iteration-1
```

## 在页面上发起评测

页眉的「发起评测」按钮（**只在 `npm run dev` 下出现**）打开一个弹窗，就是一个 **AntD Form**：

| 位置 | 填什么 | 会发生什么 |
|---|---|---|
| **能力**（Input） | 候选/已采纳里的**名字** | 直接用它的评测配置跑（工具按类型自动定：技能→skill-up、子代理→promptfoo、MCP→协议探针） |
| | **链接**（见下），或点右边的「**技能市场**」搜 | 拉取进候选池 → **按 `SKILL.md` 自动设计针对性用例** → 校验 → 跑 → 落账（技能路径） |
| **提示词**（TextArea，可选） | 你自己出的任务 | 按它跑 A/B：**A 只给这段提示词 / B 再附上技能正文**，由 LLM 裁判判达标。label 右边有「**根据能力生成**」：读这个能力的 `SKILL.md` 起草一条贴合它的任务（视觉类给页面、代码类给小程序），**只填进框里，你改完再提交** |
| 页脚右下角 | **关闭** + **提交** | 「提交」就是开始跑（跑完多一颗「刷新台账」） |

**链接怎么写**（把浏览器地址栏里的东西直接粘进来就行）：

| 写法 | 例子 |
|---|---|
| 仓库页 | `nextlevelbuilder/ui-ux-pro-max-skill` 或 `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill` |
| **指定某一个技能**（多技能仓库必填） | `owner/repo:.claude/skills/ui-ux-pro-max` |
| 文件页（blob） | `https://github.com/owner/repo/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md` |
| 目录页（tree） | `https://github.com/owner/repo/tree/main/.claude/skills/ui-ux-pro-max` |
| 直链 | `https://raw.githubusercontent.com/owner/repo/main/…/SKILL.md` |

技能名会自动取**子路径最后一段**（`…/ui-ux-pro-max` → `ui-ux-pro-max`）；仓库里有多个 `SKILL.md` 时会直接把可复制的候选列出来让你挑。不确定能不能跑，可以先干跑一遍（不拉取、不出题、不花额度）：`node tools/skillup-bridge.mjs auto --input "<链接>" --dry-run`。

**不知道有哪些技能可试？** 点「能力」右边的「技能市场」，按**名称或描述关键词**搜 [skillsmp.com](https://skillsmp.com/zh/search)（走服务端代理 `/api/eval/market`，避开跨域）：结果里给技能名、星数、描述、`作者 · owner/repo:目录`，**点一下就填进「能力」**，行尾的「评测」则直接开跑。市场只是"找候选"的便利入口——搜不到或市场不通，手填 `owner/repo` / 链接照旧。

**表单下方没有常驻提示**：能跑的时候一句话都不说；只有"点了也跑不了"时才弹一条说明（类型入口没开 / 没找到这个名字也不像链接 / 本机没有可用引擎），并把「提交」置灰。

**三种能力各自怎么发起**（页面与 CLI 是同一套）：

| 类型 | 发起方式 | 成本 | 结论长什么样 | 入口 |
|---|---|---|---|---|
| 技能 | 候选名（跑已有用例）或 `owner/repo`（拉取 + 自动出题） | 一次 A/B 的模型花费 | 采纳 / 挂起 / 放弃 / 重试 | **开放** |
| 子代理 | 候选名：promptfoo 跑 A（无规格）/ B（带 `AGENT.md`），走内部网关真模型 | 一次 A/B 的模型花费 | 采纳 / 挂起 / 放弃 / 重试 | **先注释** |
| MCP | 候选名：协议探针，秒级 | **零成本** | **可用 / 不可用**（不判采纳） | **先注释** |

> **子代理与 MCP 的页面入口和类型筛选目前是注释掉的**（2026-09-11）：两者的评测口径还没想清楚。工具、桥接、探针都留在仓库里，放开时改两处：`src/shared/entries.ts` 的 `OPEN_CAPABILITY_TYPES` 与 `vite.config.ts` 的 `OPEN_TOOLS` 各加上对应类型 / 工具。CLI 也不受页面开关影响，但**先别急着用**，等口径定了再跑。

**没有任何可选项**：工具按能力类型自动定；**引擎内置**（`claude_code` 走内部网关 Athen，模型默认 `deepseek-v4-flash`）；**用途标签**在自动设计用例时一并判定（只能从已登记取值里挑）；原来的「已有报告路径」和 Inspector 交叉验证已从界面去掉（CLI 仍在）。

**想自己出题就填「提示词」那一格**（可选）：

> 任务提示词：`写一个 Node 脚本 dedupe.mjs：按行去重后打印到 stdout，只交付这一个文件`

填了就按这段提示词跑 A/B——**A 只给这段提示词 / B 再附上技能正文**，由 **LLM 裁判**（走同一个网关）判达标，结果照常落进台账（用例会存成 `evals/cases/ask-<id>.yaml`，配置单独放 `evals/eval.ask.yaml`，不动技能原有的用例套件）。CLI 等价：

```bash
node tools/skillup-bridge.mjs auto --input ponytail --prompt "<你的任务>" --task ask-dedupe
```

实测（ponytail + 上面那段提示词）：**A 0/1（被裁判判"多余解释、产出不能直接用"）/ B 1/1**，token A 19,703 / B 18,181、耗时 18.8 / 15.7 秒。

自动出的用例不是"随便编一道题"：模型只负责设计任务与可判定用例（外加一份参考实现），**判分 shell 由代码生成**，并且生成后**先拿参考实现跑一遍自检**——跑不过就把失败原因回给模型重设计，两次都不过就不写任何文件。详见 `evals/schema.md` 3.4。

跑完自动写 `evals/trials/`、更新能力登记、聚合，弹窗底部出现「刷新台账」。

**要凑够两次就是再点一次。** 第一次通过会判 `hold`；第二次仍全过就判 `ready`（机器判定达标，**等你给结论**）。想换题目重跑（更值得的那种"第二次"）：

```bash
node tools/skillup-bridge.mjs auto --input ponytail --task 换个用例id      # 重新设计一条针对性用例并跑
node tools/skillup-bridge.mjs add-case --name ponytail --task my-case      # 或者自己起个用例骨架
```

**离线自检**（不调用任何模型，验证链路本身）：技能用 `evals/eval.stub.yaml` + `tools/engines/stub.mjs`，子代理用 `tools/engines/stub-agent.mjs`，MCP 用 `candidates/mcp/mcp-demo`（演示 server 在 `tools/__fixtures__/mcp-demo-server.mjs`）。
自检产物是**假数据，不要导入台账**：skill-up 的报告落在 `adopted/skills/<名字>-workspace/`（已 gitignore，可随时重跑生成），只想验证映射就用 `--dry-run`：

```bash
node tools/skillup-bridge.mjs import --name ponytail --result adopted/skills/ponytail-workspace/iteration-1 --dry-run
```

## 在页面上写人评（👍 / 👎）

打开任一能力的**试用记录 → 看详情**，在「评审人怎么说」下面就是人评入口（**只在 `npm run dev` 下出现**）：

1. 点 **👍 赞** 或 **👎 踩**（必须选一个）；
2. 下面是可以留空的理由输入框（最多 300 字，会提示"将记录什么"）；
3. 点「提交人评」→ **弹一次确认**（确认框里写清会落到 `evals/trials/<id>.json` 的 `humanReview` 并重新聚合）→ 「确认提交」才真的写。

规则：人评是**附加信号**，不改这次的判定（判定只看客观检查）；**只记你自己给过的东西**——同结论重提且不写理由时保留你上次那句，换了结论又不写理由就留空，不替你想一句。写入路径是 dev 接口 `POST /api/review`（静态构建里没有，页面退回只读）。

## 把能力装进项目

```bash
harness-tool add frontend-design            # 在项目目录里执行；默认从本仓库 adopted/ 找
harness-tool add frontend-design --from .   # 指定源（本地路径 / owner/repo）时才需要 --from
```

页面里每个已采纳能力的安装命令都可以**点一下复制**。

## 决策规则（写死，避免摇摆）

| 结论 | 含义 | 之后怎么走 |
|---|---|---|
| `ready` | 连续 **2 次**试用都通过、无退步——**机器判定达标，但采不采纳由你定** | 停在候选池；在能力详情「我的结论」里点「采纳这个能力」才会变成 `adopted` |
| `hold` | 第一次就全过，但还没有第二次佐证 | 留在 `candidates/`，再跑一次同类试用 |
| `reject` | 试用里 B 侧（带能力）没全过：无增益或明显更差 | 从候选池删除，trial 里留原因 |
| `retry` | 工具自己报错、证据不足或中途卡住 | 修条件重跑，不算结论 |

判定写在 `tools/lib/trial-record.mjs` 的 `decide()`，bridge 只负责把报告翻译成它的输入。**机器不替你采纳**：`adopted` / `rejected` 只能由人在页面上给（写 `capabilities.json` 的 `humanDecision`）——"任务做对没有"是客观问题，"值不值得装进我的项目"是你自己的判断。试用人评（👍/👎 + 选了哪版）是素材：页面把散在 N 条试用里的人评汇总成一句话，你下结论时看的就是它。

**离线自检不算证据**：用 stub 引擎 / 仓库内夹具跑出来的记录会带 `selfCheck: true`，它证明评测链路通、不证明能力有效——`previousPasses()` 跳过它，判定只能停在 `hold`，页面在试用详情里也会写明。所以"再跑一次"必须是真的跑一次（真实引擎 / 真实 provider / 真实 MCP server）。

## 语言策略

仓库正文中文；导入的第三方候选保持**原文（英文）**并附 `SOURCE.md` 说明来源与许可。
