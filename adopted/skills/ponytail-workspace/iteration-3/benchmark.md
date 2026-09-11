# Skill Benchmark: ponytail

**Date**: 2026-09-11T02:53:34Z
**Evals**: 用最省的写法做 wc 统计, 用最省的写法统计 NDJSON 日志里各等级出现次数 (1 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|-----------|--------------|-------|
| Pass Rate | 50% ± 0% | 50% ± 0% | +0.00 |

## Per-Case Results

### 用最省的写法做 wc 统计 (with_skill)

- **Pass Rate**: 50% (1/2)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\ponytail\evals\fixtures\scripts\check-wc.sh | ❌ | FAIL: 输出不是期望的统计值 → {"lines":2,"words":5,"chars":25} |

### 用最省的写法统计 NDJSON 日志里各等级出现次数 (with_skill)

- **Pass Rate**: 50% (1/2)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\ponytail\evals\fixtures\scripts\check-log-tally.sh | ❌ | FAIL: 工作区里没有 events.jsonl（fixture 没就位） |

### 用最省的写法做 wc 统计 (without_skill)

- **Pass Rate**: 50% (1/2)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\ponytail\evals\fixtures\scripts\check-wc.sh | ❌ | FAIL: 输出不是期望的统计值 → {"lines":2,"words":5,"chars":24} |

### 用最省的写法统计 NDJSON 日志里各等级出现次数 (without_skill)

- **Pass Rate**: 50% (1/2)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\ponytail\evals\fixtures\scripts\check-log-tally.sh | ❌ | FAIL: 工作区里没有 events.jsonl（fixture 没就位） |

