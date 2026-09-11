# 来源与许可

- 上游仓库: https://github.com/DietrichGebert/ponytail
- 路径: skills/ponytail/SKILL.md
- 导入时的上游提交: 356918eba965ee1eac64bd3a7f0dd02108350de5（见同目录 `COMMIT.txt`）
- 抓取日期: 2026-09-10（**原样导入**，未改写 `SKILL.md`）
- 许可: MIT — 见同目录 `LICENSE.txt`（上游随仓库附带）

## 台账里的「一句话说明」是哪来的

`evals/capabilities.json` 的 `description` 来自上游 `SKILL.md` frontmatter 的 `description:`，**直译**（触发词清单缩写为"任何编码任务／非编码请求不要用"一句，原文照抄如下）：

> Forces the laziest solution that actually works, simplest, shortest, most minimal. Channels a senior dev who has seen everything: question whether the task needs to exist at all (YAGNI), reach for the standard library before custom code, native platform features before dependencies, one line before fifty. Supports intensity levels: lite, full (default), ultra. Use on ANY coding task … Do NOT use for non-coding requests (general knowledge, prose, translation, summaries, recipes).

下面是**我们自己的理解**（不是上游原文，只用于解释试用里看到的差别）：它不改技术栈，改的是**默认动作**——从"要不要做这件事"开始爬梯子，输出"代码在前、解释最多三行"，非平凡逻辑要留一个可运行的自检。

## 本次试用

- 任务与产物：`benchmarks/tasks/wc-cli/`（固定任务 + 输入 + `check.mjs` 客观检查 + A/B 两版产物）
- 试用记录：`evals/trials/2026-09-10-ponytail.json`
