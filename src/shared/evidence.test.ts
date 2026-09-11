import { describe, expect, it } from 'vitest';
import { failingNotes, parseRecord, recordPath, recordUrl, verdictRows } from './evidence';
import type { Trial } from './types';

const trial = {
  trialId: 't',
  conditions: [
    { name: 'A', withCapability: false, artifact: 'w/iteration-8/wc-cli/without_skill/outputs/workspace/wc.mjs' },
    { name: 'B', withCapability: true, artifact: 'w/iteration-8/wc-cli/with_skill/outputs/workspace/wc.mjs' },
  ],
  measures: { correctness: { A: 0, B: 1 } },
  evidence: ['w/iteration-8/result.json', 'w/iteration-8/report.html'],
} as unknown as Trial;

describe('判定记录的读法', () => {
  it('recordPath：挑出判定记录（result.json）', () => {
    expect(recordPath(trial)).toBe('w/iteration-8/result.json');
    expect(recordPath({ ...trial, evidence: ['w/x/benchmark.md'] } as unknown as Trial)).toBeNull();
    expect(recordUrl(trial)).toContain('evidence/w/iteration-8/result.json');
  });

  it('parseRecord：把 result.json 读成"每条用例 × 每侧 × 每条判据"', () => {
    const runs = parseRecord(
      {
        case_results: [
          {
            case_id: 'wc-cli',
            configuration: 'with_skill',
            status: 'PASS',
            turns: 1,
            duration_ms: 15706,
            grading: { status: 'PASS', assertion_results: [{ text: 'a', passed: true, evidence: 'ok' }] },
          },
          {
            case_id: 'wc-cli',
            configuration: 'without_skill',
            status: 'FAIL',
            turns: 2,
            duration_ms: 18848,
            grading: { status: 'FAIL', assertion_results: [{ text: 'a', passed: false, evidence: '多了防御代码' }] },
          },
        ],
      },
      trial,
    );

    expect(runs.length).toBe(1);
    expect(runs[0].caseId).toBe('wc-cli');
    expect(runs[0].sides.B.passed).toBe(true);
    expect(runs[0].sides.A.passedCount).toBe(0);
    expect(runs[0].sides.A.turns).toBe(2);

    // 逐条判据对齐成一行 × 两列
    expect(verdictRows(runs, ['A', 'B'])).toEqual([
      { text: 'a', sides: { A: { passed: false, evidence: '多了防御代码' }, B: { passed: true, evidence: 'ok' } } },
    ]);
  });

  it('failingNotes：只挑没过的判据（要解释的只有这些）', () => {
    const runs = parseRecord(
      {
        case_results: [
          {
            case_id: 'wc-cli',
            configuration: 'without_skill',
            grading: {
              status: 'FAIL',
              assertion_results: [
                { text: '过的', passed: true, evidence: '不用解释' },
                { text: '没过的', passed: false, evidence: '含未要求的防御代码' },
              ],
            },
          },
        ],
      },
      trial,
    );
    expect(failingNotes(runs, ['A', 'B'])).toEqual([{ side: 'A', text: '没过的', evidence: '含未要求的防御代码' }]);
  });

  it('认不出的结构返回空数组，不许瞎猜', () => {
    expect(parseRecord({}, trial)).toEqual([]);
    expect(parseRecord(null, trial)).toEqual([]);
    expect(parseRecord({ case_results: [{ case_id: 'x', configuration: '别的配置' }] }, trial)).toEqual([]);
  });
});
