# Skill Benchmark: pdf

**Date**: 2026-09-16T08:42:21Z
**Evals**: 验 PDF 技能能否为「加密归档 + 无文本层扫描件」给出正确的工具选择与执行顺序计划 (1 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|-----------|--------------|-------|
| Pass Rate | 100% ± 0% | 100% ± 0% | +0.00 |

## Per-Case Results

### 验 PDF 技能能否为「加密归档 + 无文本层扫描件」给出正确的工具选择与执行顺序计划 (with_skill)

- **Pass Rate**: 100% (2/2)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\pdf\evals\fixtures\scripts\check-pdf-routing-plan.sh | ✅ | PASS: plan.json 通过 3 条用例（structure、normal-decrypt-and-merge、edge-scanned-no-text-layer） |

### 验 PDF 技能能否为「加密归档 + 无文本层扫描件」给出正确的工具选择与执行顺序计划 (without_skill)

- **Pass Rate**: 100% (2/2)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\pdf\evals\fixtures\scripts\check-pdf-routing-plan.sh | ✅ | PASS: plan.json 通过 3 条用例（structure、normal-decrypt-and-merge、edge-scanned-no-text-layer） |

