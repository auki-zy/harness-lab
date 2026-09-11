# Skill Benchmark: ponytail

**Date**: 2026-09-10T10:17:43Z
**Evals**: 用最省的写法做 wc 统计 (1 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|-----------|--------------|-------|
| Pass Rate | 100% ± 0% | 100% ± 0% | +0.00 |

## Per-Case Results

### 用最省的写法做 wc 统计 (with_skill)

- **Pass Rate**: 100% (2/2)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\ponytail\evals\fixtures\scripts\check-wc.sh | ✅ | PASS: wc.mjs 输出正确（lines/words/chars = 5/10/58），缺文件时退出码非 0 |

### 用最省的写法做 wc 统计 (without_skill)

- **Pass Rate**: 100% (2/2)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\ponytail\evals\fixtures\scripts\check-wc.sh | ✅ | PASS: wc.mjs 输出正确（lines/words/chars = 5/10/58），缺文件时退出码非 0 |

