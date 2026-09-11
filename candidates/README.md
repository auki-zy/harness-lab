# candidates/ — 候选池

放**尚未采纳**的能力（skill / agent / MCP）：只用于试用与评测，不是产品目录，也不随任何东西分发。

```text
candidates/
├── skills/<name>/     # 技能：SKILL.md + SOURCE.md + evals/（skill-up 配置：eval.yaml、cases/、fixtures/）
├── agents/<name>/     # 子代理：AGENT.md（职责/边界/产出格式）+ evals/（promptfoo 配置）+ SOURCE.md
└── mcp/<name>/        # MCP 预设：server.json（{ name, config }）+ MCP.md（用途/需要的 env/风险）+ SOURCE.md
```

MCP 铁律：**默认关、按需开；密钥只写 `${ENV_VAR}` 占位，绝不入库**。

## 流程

1. 选一个候选，按 `evals/schema.md` 第三节准备它的 `evals/`（用例 + 检查方式），用对应工具跑一次评测（技能 → skill-up、子代理 → promptfoo、MCP → 协议探针；页面的「发起评测」或命令行桥接都行）；
2. 评测跑完由桥接自动记一条 `evals/trials/<date>-<id>-<工具>.json`，状态同步回 `evals/capabilities.json`；
3. 判 `adopted` 的**移到 `adopted/<type>/<name>/`**（本仓库是能力的唯一存放处，项目侧用 `harness-tool add <name>` 安装）；判 `rejected` 的删掉并在 trial 里留原因。

候选目录保留试用痕迹（配置、产物、探针报告、来源说明），方便以后回看结论是怎么来的。
