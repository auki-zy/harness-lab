// 网关客户端的"失败要说人话"部分：超时值怎么定、错误怎么描述。
//
// 起因（2026-09-14）：自动设计的第二次尝试是 max_tokens 32000，而超时写死 120 秒，
// 必炸；炸出来是裸的 DOMException + 调用栈，用户只看到"自动设计失败（看上面的输出）"。
import { describe, expect, it } from 'vitest';
import { describeAthenFailure, resolveTimeout } from './athen.mjs';

const timeoutErr = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });

describe('resolveTimeout', () => {
  it('默认 5 分钟（比原来的 2 分钟宽，够 32k token 的生成用）', () => {
    expect(resolveTimeout({})).toBe(300000);
  });

  it('ATHEN_TIMEOUT_MS 可覆盖（用户遇到超时时给的口子）', () => {
    expect(resolveTimeout({ ATHEN_TIMEOUT_MS: '600000' })).toBe(600000);
  });

  it('环境变量写坏了就退回默认，不把 NaN 传下去', () => {
    expect(resolveTimeout({ ATHEN_TIMEOUT_MS: '好久' })).toBe(300000);
    expect(resolveTimeout({ ATHEN_TIMEOUT_MS: '0' })).toBe(300000);
    expect(resolveTimeout({ ATHEN_TIMEOUT_MS: '-1' })).toBe(300000);
  });
});

describe('describeAthenFailure', () => {
  it('超时说清等了多久、怎么放宽，并带上可重试的语义', () => {
    const msg = describeAthenFailure(timeoutErr(), { timeoutMs: 300000, maxTokens: 32000, model: 'deepseek-v4-flash' });
    expect(msg).toContain('300 秒');
    expect(msg).toContain('deepseek-v4-flash');
    expect(msg).toContain('32000');
    expect(msg).toContain('ATHEN_TIMEOUT_MS');
  });

  it('undici 把超时包成 fetch failed 时，也要认出是超时（真因在 cause 里）', () => {
    const wrapped = Object.assign(new Error('fetch failed'), { cause: timeoutErr() });
    const msg = describeAthenFailure(wrapped, { timeoutMs: 300000, maxTokens: 32000 });
    expect(msg).toContain('没返回');
    expect(msg).not.toContain('连不上网关');
  });

  it('连不上网关时提示查网络 / ATHEN_BASE_URL', () => {
    const msg = describeAthenFailure(new Error('fetch failed'), { timeoutMs: 300000 });
    expect(msg).toContain('连不上网关');
    expect(msg).toContain('ATHEN_BASE_URL');
  });

  it('别的错误原样透出（别把"预算不够"这类已写好的说明改掉）', () => {
    const raw = '模型把 24000 token 的预算用完了还没开始输出——加大 max_tokens 重试';
    expect(describeAthenFailure(new Error(raw), { timeoutMs: 300000 })).toBe(raw);
  });
});
