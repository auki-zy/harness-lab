// 重复跑合并口径的回归测试。守的是那个真实教训：同一条用例两次跑，A 侧结果翻转了
// （一次 1/1、一次 0/1），所以结论必须说清"B 在几次里过了几次"，并且不许把一次运行当结论。
import { describe, expect, it } from 'vitest';
import { repeatNote, repeatsLabel, summarizeRuns } from './repeats.mjs';

const c = (configuration, status, extra = {}) => ({ configuration, status, ...extra });

describe('summarizeRuns', () => {
  it('一次运行：跟原来的单次口径一致', () => {
    const s = summarizeRuns([{ cases: [c('without_skill', 'PASS'), c('with_skill', 'PASS')] }]);
    expect(s.n).toBe(1);
    expect(s.A).toMatchObject({ passed: 1, total: 1, passRate: 1, perfectRuns: 1 });
    expect(s.B).toMatchObject({ passed: 1, total: 1, passRate: 1, perfectRuns: 1 });
  });

  it('三次重复：过几次就是几次（react-best-practices 那次的形状）', () => {
    const s = summarizeRuns([
      { cases: [c('without_skill', 'PASS'), c('with_skill', 'PASS')] },
      { cases: [c('without_skill', 'FAIL'), c('with_skill', 'PASS')] },
      { cases: [c('without_skill', 'FAIL'), c('with_skill', 'PASS')] },
    ]);
    expect(s.n).toBe(3);
    expect(s.A).toMatchObject({ passed: 1, total: 3, perfectRuns: 1 });
    expect(s.A.passRate).toBeCloseTo(1 / 3);
    expect(s.B).toMatchObject({ passed: 3, total: 3, perfectRuns: 3, passRate: 1 });
  });

  it('B 只过一部分时 perfectRuns 也小于 n（判定据此判"不稳定"）', () => {
    const s = summarizeRuns([
      { cases: [c('with_skill', 'PASS')] },
      { cases: [c('with_skill', 'FAIL')] },
    ]);
    expect(s.B).toMatchObject({ perfectRuns: 1, passed: 1, total: 2 });
    expect(s.B.passRate).toBe(0.5);
  });

  it('多条用例：一次运行内全过才算这一侧的 perfectRun', () => {
    const s = summarizeRuns([{ cases: [c('with_skill', 'PASS'), c('with_skill', 'FAIL')] }]);
    expect(s.B).toMatchObject({ passed: 1, total: 2, perfectRuns: 0 });
  });

  it('没有 A 侧时 B 用全部结果兜底（与单次口径一致）', () => {
    const s = summarizeRuns([{ cases: [c('with_skill', 'PASS'), c('with_skill', 'PASS')] }]);
    expect(s.A.total).toBe(0);
    expect(s.B).toMatchObject({ passed: 2, total: 2 });
  });

  it('成本按次累加（一份试用的总量），不丢小数', () => {
    const s = summarizeRuns([
      { cases: [c('with_skill', 'PASS', { input_tokens: 100, output_tokens: 20, duration_ms: 1000, turns: 2 })] },
      { cases: [c('with_skill', 'PASS', { input_tokens: 50, output_tokens: 10, duration_ms: 500, turns: 1 })] },
    ]);
    expect(s.B.tokensIn).toBe(150);
    expect(s.B.tokensOut).toBe(30);
    expect(s.B.durationMs).toBe(1500);
    expect(s.B.turns).toBe(3);
  });

  it('空输入不炸', () => {
    const s = summarizeRuns([]);
    expect(s).toMatchObject({ n: 0 });
    expect(s.B.passRate).toBe(0);
  });
});

describe('说法（给人看的两行）', () => {
  it('重复 label 用"全过几次 / 共几次"', () => {
    const s = summarizeRuns([
      { cases: [c('without_skill', 'PASS'), c('with_skill', 'PASS')] },
      { cases: [c('without_skill', 'FAIL'), c('with_skill', 'PASS')] },
    ]);
    expect(repeatsLabel(s)).toEqual({ A: '1/2', B: '2/2' });
  });

  it('只有一次重复时不写这句（免得噪声）', () => {
    const s = summarizeRuns([{ cases: [c('with_skill', 'PASS')] }]);
    expect(repeatNote(s)).toBe('');
  });

  it('多次重复时把两边的次数都写出来', () => {
    const s = summarizeRuns([
      { cases: [c('without_skill', 'PASS'), c('with_skill', 'PASS')] },
      { cases: [c('without_skill', 'FAIL'), c('with_skill', 'PASS')] },
    ]);
    expect(repeatNote(s)).toBe('重复 2 次（同一条用例）：A 全过 1/2、B 全过 2/2');
  });
});
