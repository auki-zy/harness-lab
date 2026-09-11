// @vitest-environment jsdom
import { Modal } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const saveDecision = vi.fn((_input: unknown) => Promise.resolve({ ok: true as const, capabilityId: 'ponytail', status: 'adopted' }));
const refresh = vi.fn();

/**
 * 「写完数据就地刷新，别整页重载」——这是用户反馈的那条：
 * 以前提交人评 / 给能力下结论之后调 `window.location.reload()`，正在看的抽屉、二级试用全被关掉。
 * 现在走 `refreshAppData()`：重读聚合产物 + 通知订阅者，页面自己重渲染，**抽屉留着**。
 * 这里用真数据 + 一个最小 store 替身验证这条契约（真实现见 `src/shared/data.ts`）。
 */
vi.mock('../shared/trial-api', () => ({
  writeApiAvailable: () => Promise.resolve(true),
  saveCapabilityDecision: (input: unknown) => saveDecision(input),
  saveReview: () => Promise.resolve({ ok: true as const, trialId: 'x' }),
  evalStatus: () => Promise.resolve({ tools: [], capabilities: [], purposes: [], engines: [] }),
  evalStart: () => Promise.resolve({ runId: 'r' }),
  evalRunState: () => Promise.resolve({ status: 'done' as const, code: 0, log: '' }),
  evalAuto: () => Promise.resolve({ runId: 'r' }),
  evalPrepare: () => Promise.resolve({ ok: true, code: 0, log: '' }),
  evalImport: () => Promise.resolve({ ok: true, code: 0, log: '' }),
  draftPrompt: () => Promise.resolve({ prompt: '' }),
  searchMarket: () => Promise.resolve({ skills: [] }),
}));

vi.mock('../shared/data', async () => {
  const raw = (await import('../../evals/results/app-data.json')).default;
  const React = await import('react');
  let current = raw as typeof raw;
  const listeners = new Set<() => void>();
  const getAppData = () => current;
  const subscribeAppData = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return {
    getAppData,
    subscribeAppData,
    useAppData: () => React.useSyncExternalStore(subscribeAppData, getAppData, getAppData),
    refreshAppData: async () => {
      refresh();
      // 模拟"人的结论写回去之后"服务端给的新数据
      current = {
        ...current,
        capabilities: current.capabilities.map((c) =>
          c.id === 'ponytail'
            ? {
                ...c,
                status: 'adopted',
                humanDecision: { verdict: 'adopt' as const, reason: '', reviewedAt: '2026-09-11' },
                summary: '值得用：你自己确认采纳了。',
              }
            : c,
        ),
      } as typeof raw;
      for (const l of listeners) l();
      return current;
    },
  };
});

import App from '../App';
import { getAppData } from '../shared/data';

beforeEach(() => {
  refresh.mockClear();
  saveDecision.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve('x'),
        json: () => Promise.resolve({ case_results: [] }),
      }),
    ),
  );
});

afterEach(() => {
  cleanup();
  Modal.destroyAll(); // Modal.confirm 挂在 body 上，cleanup() 收不掉
  document.querySelectorAll('.ant-modal-root').forEach((el) => el.remove());
  vi.unstubAllGlobals();
});

describe('写完数据就地刷新（不整页重载）', () => {
  it(
    '给能力下结论后：数据刷新了，抽屉还开着，试用记录也还在',
    async () => {
      render(<App />);
      const row = screen.getAllByText('ponytail')[0].closest('li') as HTMLElement;
      fireEvent.click(within(row).getByRole('button', { name: /看完整记录/ }));

      // 按 class 找抽屉：此时页面上可能还有 Modal.confirm 留下的 dialog 节点（也带 role=dialog）
      const panel = (await waitFor(() => {
        const el = document.querySelector('.record-drawer') as HTMLElement;
        expect(el).toBeTruthy();
        return el;
      })) as HTMLElement;
      expect(within(panel).getByText('我的结论')).toBeTruthy();

      // 选「采纳」→ 提交 → 二次确认
      fireEvent.click(within(panel).getByRole('button', { name: '采纳这个能力' }));
      const submit = within(panel).getByRole('button', { name: '提交我的结论' }) as HTMLButtonElement;
      await waitFor(() => expect(submit.disabled).toBe(false));
      fireEvent.click(submit);

      await waitFor(() => {
        const buttons = Array.from(document.querySelectorAll('.ant-modal-confirm button')) as HTMLElement[];
        expect(buttons.some((b) => (b.textContent ?? '').trim() === '确认采纳')).toBe(true);
      });
      const ok = (Array.from(document.querySelectorAll('.ant-modal-confirm button')) as HTMLElement[]).filter(
        (b) => (b.textContent ?? '').trim() === '确认采纳',
      );
      fireEvent.click(ok[ok.length - 1]);

      // 写了库、也刷新了数据
      await waitFor(() => expect(saveDecision).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

      // 关键：没有整页重载 —— 还是同一个抽屉节点，里面已经换成新结论，试用记录也还在
      const stillOpen = document.querySelector('.record-drawer') as HTMLElement;
      expect(stillOpen).toBe(panel);
      await waitFor(() => expect(within(stillOpen).getAllByText('采纳').length).toBeGreaterThan(0));
      expect(within(stillOpen).getAllByRole('button', { name: /详\s*情/ }).length).toBeGreaterThan(0);
      expect(getAppData().capabilities.find((c) => c.id === 'ponytail')?.status).toBe('adopted');
    },
    30_000,
  );
});
