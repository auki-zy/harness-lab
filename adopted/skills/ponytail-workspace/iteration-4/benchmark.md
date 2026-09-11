# Skill Benchmark: ponytail

**Date**: 2026-09-11T02:58:33Z
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
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\ponytail\evals\fixtures\scripts\check-wc.sh | ❌ | FAIL: 运行 wc.mjs 出错：Error: cannot read file "/tmp/tmp.eAoqN8dU7P/input.txt": ENOENT: no such file or directory, open 'C:\tmp\tmp.eAoqN8dU7P\input.txt' |

### 用最省的写法统计 NDJSON 日志里各等级出现次数 (with_skill)

- **Pass Rate**: 50% (1/2)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\ponytail\evals\fixtures\scripts\check-log-tally.sh | ❌ | FAIL: 运行 tally.mjs 出错：Error: cannot read file '/tmp/tmp.Zf31DcEzVS/events.jsonl': ENOENT: no such file or directory, open 'C:\tmp\tmp.Zf31DcEzVS\events.jsonl' |

### 用最省的写法做 wc 统计 (without_skill)

- **Pass Rate**: 50% (1/2)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\ponytail\evals\fixtures\scripts\check-wc.sh | ❌ | FAIL: 运行 wc.mjs 出错：Error: cannot read file '/tmp/tmp.y0mXtOldaE/input.txt': ENOENT: no such file or directory, open 'C:\tmp\tmp.y0mXtOldaE\input.txt' |

### 用最省的写法统计 NDJSON 日志里各等级出现次数 (without_skill)

- **Pass Rate**: 50% (1/2)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| script: D:\learning\deepseek-harness-workspace\harness-lab\candidates\skills\ponytail\evals\fixtures\scripts\check-log-tally.sh | ❌ | FAIL: 运行 tally.mjs 出错：Error: cannot read file "/tmp/tmp.t0IC1bX95L/events.jsonl": ENOENT: no such file or directory, open 'C:\tmp\tmp.t0IC1bX95L\events.jsonl' |

