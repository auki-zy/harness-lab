// @vitest-environment jsdom
import { Modal } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const save = vi.fn((_input: { trialId: string; verdict: 'up' | 'down'; reason?: string }) => Promise.resolve({ ok: true as const, trialId: 'x' }));

vi.mock('../shared/trial-api', () => ({
  saveReview: (input: { trialId: string; verdict: 'up' | 'down'; reason?: string }) => save(input),
  evalStatus: () => Promise.resolve({ tools: [], capabilities: [], purposes: [], engines: [] }),
  writeApiAvailable: () => Promise.resolve(true),
  evalStart: () => Promise.resolve({ runId: 'r' }),
  evalRunState: () => Promise.resolve({ status: 'done' as const, code: 0, log: '' }),
  evalPrepare: () => Promise.resolve({ ok: true, code: 0, log: '' }),
  evalImport: () => Promise.resolve({ ok: true, code: 0, log: '' }),
}));

import { ReviewForm } from './review-form';
import type { Trial } from '../shared/types';

const trial = (humanReview: Trial['humanReview'] = null): Trial =>
  ({ trialId: '2026-09-11-demo-skillup', capability: { id: 'demo', type: 'skill' }, humanReview }) as Trial;

/** 点 👍 / 👎 两颗按钮（它们是 toggle：aria-pressed 表达当前选择） */
const pick = (label: string): void => {
  fireEvent.click(screen.getByRole('button', { name: label }));
};

/**
 * 二次确认现在是 `Modal.confirm`：它**异步**挂到 document.body 上的独立容器里（cleanup() 收不掉），
 * 所以要等它出现，并按文案找那颗按钮（不能按容器取，上一个用例的确认框可能还在淡出）。
 */
const confirmOk = async (label = '确认提交'): Promise<void> => {
  await waitFor(() => {
    const buttons = Array.from(document.querySelectorAll('.ant-modal-confirm button')) as HTMLElement[];
    expect(buttons.some((b) => (b.textContent ?? '').trim() === label)).toBe(true);
  });
  const buttons = (Array.from(document.querySelectorAll('.ant-modal-confirm button')) as HTMLElement[]).filter(
    (b) => (b.textContent ?? '').trim() === label,
  );
  fireEvent.click(buttons[buttons.length - 1]);
};

afterEach(() => {
  cleanup();
  Modal.destroyAll();
  // AntD 的静态确认框挂在 body 上、淡出动画在 jsdom 里不跑完，会留到下一个用例里（会点到上一个框的按钮）
  document.querySelectorAll('.ant-modal-root').forEach((el) => el.remove());
  save.mockClear();
});

/** 人评入口：👍/👎 + 可选文字 + **提交前二次确认**（这是验收点，别退化成点一下就写库） */
describe('人评入口', () => {
  it('没选 👍/👎 不能提交；选了之后要过一次确认才写库', async () => {
    const done = vi.fn();
    render(<ReviewForm trial={trial()} onDone={done} />);

    const submit = screen.getByRole('button', { name: '提交人评' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText(/先选 👍 或 👎/)).toBeTruthy();
    // 还没选时不许有"已经选了"的样子（踩过：Segmented 在 value=undefined 时会自己把第一项渲染成选中）
    expect(screen.getByRole('button', { name: '👍 赞' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: '👎 踩' }).getAttribute('aria-pressed')).toBe('false');

    // 选 👍：按钮可用，但点它只弹确认框，不能直接提交
    pick('👍 赞');
    await waitFor(() => expect((screen.getByRole('button', { name: '提交人评' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '提交人评' }));
    await waitFor(() => expect(screen.getAllByText('确认提交这次人评？').length).toBeGreaterThan(0));
    expect(save).not.toHaveBeenCalled();

    // 在确认框里点「确认提交」才真的写
    await confirmOk();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toEqual({ trialId: '2026-09-11-demo-skillup', verdict: 'up', reason: undefined });
    await waitFor(() => expect(done).toHaveBeenCalled());
  });

  it('理由是可选的：写就带上，不写就不带；并提前把「将记录什么」说清楚', async () => {
    render(<ReviewForm trial={trial()} onDone={() => {}} />);

    pick('👎 踩');
    await waitFor(() => expect(screen.getByText(/不写理由/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText('人评理由'), { target: { value: '省是省，但可读性差' } });
    await waitFor(() => expect(screen.getByText(/将记录：👎 踩，理由「省是省，但可读性差」/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '提交人评' }));
    await waitFor(() => expect(screen.getAllByText('确认提交这次人评？').length).toBeGreaterThan(0));
    await confirmOk();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatchObject({ verdict: 'down', reason: '省是省，但可读性差' });
  });

  it('已经有人评时：按钮变「更新人评」，没改动就不让重复提交', async () => {
    render(<ReviewForm trial={trial({ mode: 'quick', verdict: 'up', reason: '之前写过' })} onDone={() => {}} />);

    const submit = screen.getByRole('button', { name: '更新人评' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // 结论和理由都没变

    pick('👎 踩');
    await waitFor(() => expect((screen.getByRole('button', { name: '更新人评' }) as HTMLButtonElement).disabled).toBe(false));
  });
});
