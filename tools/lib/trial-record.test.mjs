// 输出通道的约定：**stdout = 载荷，stderr = 诊断**。
//
// 这个约定是被一次真实事故逼出来的：`--draft-prompt` 把"生成的提示词"写 stdout，而端点整段取
// stdout 当提示词；当时 `log()` 写的是 stdout，于是那句"ℹ 这份 SKILL.md 是转发壳…"进了输入框，
// 用户一提交，A 侧就拿到了评测内部设定 —— 那次对照作废。所以把通道钉在测试里。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decide, log } from './trial-record.mjs';

describe('输出通道', () => {
  afterEach(() => vi.restoreAllMocks());

  it('log() 只写 stderr，绝不碰 stdout', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    log('ℹ 这份 SKILL.md 是转发壳');
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0]).toContain('转发壳');
    expect(out).not.toHaveBeenCalled();
  });

  it('stdout 上没有别的写入者（载荷通道只能有一个来源）', async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const spies = [vi.spyOn(process.stdout, 'write').mockImplementation(() => true)];
    const mod = await import('./trial-record.mjs');
    // 这些纯函数都不该往 stdout 写东西
    mod.P('a', 'b');
    mod.trialId('probe-capability-that-does-not-exist', 'skill-up');
    expect(spies.every((s) => s.mock.calls.length === 0)).toBe(true);
    expect(out).not.toHaveBeenCalled();
  });
});

// ── 判定规则：重复跑（`--repeat N`）带来的两条新规矩 ──
// 实测背景（2026-09-15）：react-best-practices 同一条用例两次跑，A 侧从 1/1 翻成 0/1，
// 所以"B 只过了一部分"既不能算达标、也不能算能力不行 —— 那是"不稳定"，得重跑。
describe('decide：重复跑', () => {
  it('单次运行的老口径没变（B 全过 + 此前通过过 → ready）', () => {
    const v = decide({ passRateB: 1, totalB: 1, name: '__no_such_capability__', perfectRunsB: 1, runs: 1 });
    expect(v.decision).toBe('hold'); // 之前没有可复核通过 → 挂起，等第二次
    expect(v.reason).not.toContain('次重复里');
  });

  it('B 三次里只全过两次 → retry（不稳定），既不是达标也不是能力不行', () => {
    const v = decide({
      passRateB: 2 / 3,
      totalB: 3,
      name: '__no_such_capability__',
      runs: 3,
      perfectRunsB: 2,
      perfectRunsA: 1,
    });
    expect(v.decision).toBe('retry');
    expect(v.reason).toContain('不稳定');
    expect(v.reason).toContain('B 全过 2/3');
    expect(v.reason).toContain('A 全过 1/3');
  });

  it('B 三次全过 → 结论里带上"依据是三次重复"和 A 的次数（区分度看得见）', () => {
    const v = decide({ passRateB: 1, totalB: 3, name: '__no_such_capability__', runs: 3, perfectRunsB: 3, perfectRunsA: 1 });
    // 第一次可复核试用仍然是 hold（要再来一次才能采纳），但话里必须写清重复了几次、两边各过几次
    expect(v.decision).toBe('hold');
    expect(v.confidence).toBe('medium');
    expect(v.reason).toContain('3 次重复里 B 全过 3/3、A 全过 1/3');
    expect(v.reason).toContain('重复 3 次都对上了');
  });

  it('B 三次一次都没全过（有报错痕迹）→ reject，但仍写清次数', () => {
    const v = decide({ passRateB: 0, totalB: 3, name: '__no_such_capability__', runs: 3, perfectRunsB: 0, perfectRunsA: 0 });
    expect(v.decision).toBe('reject');
    expect(v.reason).toContain('0%');
  });

  it('单次运行的 confidence 仍是中等（别把一次运行说成"高置信"）', () => {
    const v = decide({ passRateB: 1, totalB: 1, name: '__no_such_capability__' });
    expect(v).toMatchObject({ decision: 'hold', confidence: 'medium' });
  });
});

// ── 区分度提示（A2）：B 全过不等于"技能有用" ──
// 实测（react-best-practices，--repeat 3）：B 3/3 全过，**A 也 3/3 全过** —— 达标是真的，
// 但这条题证明不了技能有用。结论里必须把这句话说出来，否则人会把它读成"技能有效"。
describe('decide：区分度', () => {
  const base = { passRateB: 1, totalB: 1, name: '__no_such_capability__' };

  it('重复跑里 A 也全过 → 明说"这条题分不出技能的作用"', () => {
    const v = decide({ ...base, runs: 3, totalB: 3, perfectRunsB: 3, perfectRunsA: 3 });
    expect(v.reason).toContain('这条题分不出技能的作用');
    expect(v.reason).toContain('换一条能区分 A/B 的用例');
  });

  it('单次运行里 A 也过 → 说"可能分不出"，并建议重复跑', () => {
    const v = decide({ ...base, runs: 1, perfectRunsA: 1 });
    expect(v.reason).toContain('可能分不出技能的作用');
    expect(v.reason).toContain('重复跑几次再看');
  });

  it('A 只过了一部分 → 说"两边有区别"（这条题是有用的）', () => {
    const v = decide({ ...base, runs: 3, totalB: 3, perfectRunsB: 3, perfectRunsA: 1 });
    expect(v.reason).toContain('对照 A 只全过 1/3，两边有区别');
  });

  it('没有对照（A 缺失）时不提区分度', () => {
    const v = decide({ ...base, runs: 2, totalB: 2, perfectRunsB: 2 });
    expect(v.reason).not.toContain('分不出');
    expect(v.reason).not.toContain('有区别');
  });
});
