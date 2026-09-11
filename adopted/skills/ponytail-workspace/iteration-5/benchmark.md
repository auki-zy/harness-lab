# Skill Benchmark: ponytail

**Date**: 2026-09-11T03:02:24Z
**Evals**: 用最省的写法做 wc 统计, 用最省的写法统计 NDJSON 日志里各等级出现次数 (1 runs each per configuration)

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
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\ponytail\evals\fixtures\scripts\check-wc.sh | ✅ | PASS: wc.mjs 输出正确（lines/words/chars = 5/10/58），空文件 0/0/0，缺文件时退出码非 0 |

### 用最省的写法统计 NDJSON 日志里各等级出现次数 (with_skill)

- **Pass Rate**: 100% (2/2)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\ponytail\evals\fixtures\scripts\check-log-tally.sh | ✅ | PASS: tally.mjs 输出正确（debug1/error1/info4/warn1），空文件、坏行、缺文件都按约定处理 |

### 用最省的写法做 wc 统计 (without_skill)

- **Pass Rate**: 100% (2/2)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\ponytail\evals\fixtures\scripts\check-wc.sh | ✅ | PASS: wc.mjs 输出正确（lines/words/chars = 5/10/58），空文件 0/0/0，缺文件时退出码非 0 |

### 用最省的写法统计 NDJSON 日志里各等级出现次数 (without_skill)

- **Pass Rate**: 100% (2/2)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\ponytail\evals\fixtures\scripts\check-log-tally.sh | ✅ | PASS: tally.mjs 输出正确（debug1/error1/info4/warn1），空文件、坏行、缺文件都按约定处理 |

