# adopted/ — 已采纳的能力（本仓库是唯一存放处）

判 `adopt` 的能力放这里，按类型分子目录：

```text
adopted/
├── skills/<name>/     # 技能：SKILL.md + SOURCE.md（来源/许可/采纳记录）+ 可选 evals/（评测配置）
├── agents/<name>/     # 子代理：AGENT.md + SOURCE.md
└── mcp/<name>/        # MCP 预设：server.json + MCP.md + SOURCE.md
```

- **安装**（内容不用复制到别的仓库，按名字装进项目即可）：

  ```bash
  harness-tool add <name>            # 在项目里执行：默认从本仓库的 adopted/ 找
  harness-tool add <name> --from .   # 想指定源（本地路径或 owner/repo）时用 --from
  ```

  类型自动识别：含 `SKILL.md` 是技能、`AGENT.md` 是子代理、`server.json` 是 MCP 预设。
  找不到会提示去 `adopted/` 与 `candidates/` 里核对名字。

- 判 `adopt` 的依据写在各自的 `SOURCE.md`（采纳记录）与 `EVIDENCE.md` 里，完整试用数据在 `evals/trials/`。
- 上游更新时：先按 `evals/schema.md` 重跑一次对照，再替换内容并更新 `SOURCE.md`，不要直接覆盖了事。
