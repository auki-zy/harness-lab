// 输出通道的约定：**stdout = 载荷，stderr = 诊断**。
//
// 这个约定是被一次真实事故逼出来的：`--draft-prompt` 把"生成的提示词"写 stdout，而端点整段取
// stdout 当提示词；当时 `log()` 写的是 stdout，于是那句"ℹ 这份 SKILL.md 是转发壳…"进了输入框，
// 用户一提交，A 侧就拿到了评测内部设定 —— 那次对照作废。所以把通道钉在测试里。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from './trial-record.mjs';

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
