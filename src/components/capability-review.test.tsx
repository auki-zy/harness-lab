// @vitest-environment jsdom
import { Modal } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Capability } from '../shared/types';

const save = vi.fn((_input: { capabilityId: string; verdict: string }) => Promise.resolve({ ok: true as const, capabilityId: 'x', status: 'adopted' }));

vi.mock('../shared/trial-api', () => ({
  saveCapabilityDecision: (input: { capabilityId: string; verdict: string }) => save(input),
}));

import { CapabilityReview } from './capability-review';

afterEach(() => {
  cleanup();
  Modal.destroyAll(); // Modal.confirm 挂在 body 上，cleanup() 收不掉
  document.querySelectorAll('.ant-modal-root').forEach((el) => el.remove());
  save.mockClear();
});

const cap = {
  id: 'ponytail',
  status: 'trialing',
  trials: [
    { trialId: 'a', date: '2026-09-11', humanReview: { mode: 'quick', verdict: 'up', better: 'B', scores: null } },
    { trialId: 'b', date: '2026-09-11', humanReview: { mode: 'quick', verdict: 'up', better: 'B', scores: null, reason: '十行搞定' } },
  ],
  latestTrial: { trialId: 'b', verdict: { decision: 'ready' } },
} as unknown as Capability;

/** 我的结论：人评汇总 + 由人拍板采纳与否（机器不会替你采纳） */
describe('能力级的「我的结论」', () => {
  it('先把人评汇总成一句话，再说清机器只到"证据够了"', () => {
    render(<CapabilityReview capability={cap} onDone={() => {}} />);

    expect(screen.getByText(/2 条试用人评：👍 2 · 👎 0/)).toBeTruthy();
    expect(screen.getByText(/2 次选了「加载能力」那版/)).toBeTruthy();
    expect(screen.getByText(/最近一条（2026-09-11）/)).toBeTruthy();
    expect(screen.getByText(/采不采纳等你说一句/)).toBeTruthy();
    // 还没给结论时不显示"结论行"，但按钮就是终局按钮
    expect(screen.queryByText(/你的结论：/)).toBeNull();
    expect(screen.getByRole('button', { name: '提交我的结论' })).toBeTruthy();
  });

  it('没选采纳/不采纳时提交不可点，点了也要过二次确认', async () => {
    render(<CapabilityReview capability={cap} onDone={() => {}} />);
    const submit = screen.getByRole('button', { name: '提交我的结论' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '采纳这个能力' }));
    await waitFor(() => expect((screen.getByRole('button', { name: '提交我的结论' }) as HTMLButtonElement).disabled).toBe(false));

    fireEvent.change(screen.getByLabelText('我的结论理由'), { target: { value: '省事' } });
    fireEvent.click(screen.getByRole('button', { name: '提交我的结论' }));
    // 先弹确认（Modal.confirm），还没有写库
    expect(save).not.toHaveBeenCalled();
    const box = await waitFor(() => {
      const el = document.querySelector('.ant-modal-confirm') as HTMLElement;
      expect(el).toBeTruthy();
      return el;
    });
    // AntD 在确认框里把标题渲了不止一处（标题 + 无障碍节点），所以用 getAllByText
    expect(within(box).getAllByText('确认采纳这个能力？').length).toBeGreaterThan(0);
    fireEvent.click(within(box).getByRole('button', { name: '确认采纳' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toEqual({ capabilityId: 'ponytail', verdict: 'adopt', reason: '省事' });
  });

  it('已经有结论时显示结论本身，按钮变成"更新我的结论"', () => {
    const decided = {
      ...cap,
      status: 'adopted',
      humanDecision: { verdict: 'adopt', reason: '省事', reviewedAt: '2026-09-11' },
    } as unknown as Capability;
    render(<CapabilityReview capability={decided} onDone={() => {}} />);

    expect(screen.getByText(/你的结论：采纳/)).toBeTruthy();
    // 理由出现在结论行里（输入框里的值不算文本，但结论行本身要带上它）
    expect(screen.getByText(/你的结论：采纳[\s\S]*省事/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '更新我的结论' })).toBeTruthy();
  });
});
