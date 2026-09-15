// @vitest-environment jsdom
// 「发起评测 → 后台跑 → 列表里能看到、能点开看进度」这条链路的用例。
//
// 用户的要求（原话）："发起评测的时候可以先把任务在后台跑起来，关闭弹窗，在列表中加入新发起的这条，
// 可以查看后台该任务的评测进度"。所以这里守三件事：
//   1) 列表里挂出后台任务（状态印章 + 已跑多久 + 日志最后一行）；
//   2) 提交后弹窗关掉、这一条立刻出现在列表里（不等轮询）；
//   3) 跑完的瞬间重读台账，而且「看进度」能打开日志。
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvalRunInfo } from '../shared/trial-api';

const runOf = (over: Partial<EvalRunInfo> = {}): EvalRunInfo => ({
  id: 'r1',
  name: 'ponytail',
  tool: 'skill-up',
  toolLabel: '技能（skill-up）',
  kind: 'run',
  status: 'running',
  code: null,
  startedAt: Date.now() - 72_000,
  durationMs: 72_000,
  tail: '⏳ [1/2] wc-cli: 跑 A 侧…',
  ...over,
});

/** 轮询拿到的列表（每个用例自己摆） */
const runsRef: { list: EvalRunInfo[] } = { list: [] };
const startRef = vi.fn();
const logRef = { text: '$ node tools/skillup-bridge.mjs run --name ponytail\n✔ 已写试用记录' };

vi.mock('../shared/trial-api', () => ({
  evalRuns: () => Promise.resolve({ runs: runsRef.list }),
  evalRunState: () =>
    Promise.resolve({
      status: runsRef.list[0]?.status ?? 'done',
      code: runsRef.list[0]?.code ?? 0,
      log: logRef.text,
      // 服务端每次都会把这次运行的时间信息一并给回来（进度窗口的"已跑多久"用它，不用本地计时）
      run: runsRef.list[0],
    }),
  evalStatus: () =>
    Promise.resolve({
      tools: [{ id: 'skill-up', label: '技能（skill-up）', hint: '已就绪' }],
      capabilities: [{ id: 'ponytail', type: 'skill', tool: 'skill-up', hasConfig: true, registered: true }],
      purposes: ['code-quality'],
      engines: [{ name: 'codex', ok: true, detail: '登录状态：API key' }],
    }),
  evalStart: (input: { tool: string; name: string }) => startRef(input),
  evalAuto: (input: { input: string }) => startRef(input),
  draftPrompt: () => Promise.resolve({ prompt: '写一个 index.html' }),
  searchMarket: () => Promise.resolve({ skills: [] }),
  evalPrepare: () => Promise.resolve({ ok: true, code: 0, log: '' }),
  evalImport: () => Promise.resolve({ ok: true, code: 0, log: '' }),
  saveReview: () => Promise.resolve({ ok: true, trialId: 'x' }),
  saveCapabilityDecision: () => Promise.resolve({ ok: true, capabilityId: 'x', status: 'adopted' }),
  writeApiAvailable: () => Promise.resolve(true),
}));

const refresh = vi.fn(() => Promise.resolve());
vi.mock('../shared/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/data')>();
  return { ...actual, refreshAppData: () => refresh() };
});

import { getAppData } from '../shared/data';
import { HomePage } from './home';

const { capabilities, taxonomy, pendingTags } = getAppData();

const renderHome = (): void => {
  render(
    <HomePage
      capabilities={capabilities}
      taxonomy={taxonomy}
      pendingTags={pendingTags}
      onOpen={() => {}}
      canWrite
    />,
  );
};

beforeEach(() => {
  runsRef.list = [];
  refresh.mockClear();
  startRef.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('正在评测（后台任务）', () => {
  it('列表里挂出后台任务：能力名、状态印章、怎么发起的、已跑多久、日志最后一行', async () => {
    runsRef.list = [
      runOf(),
      runOf({ id: 'r2', name: 'ui-ux-pro-max', kind: 'ask', status: 'done', code: 0, durationMs: 305_000, tail: '✔ 已写试用记录' }),
      runOf({ id: 'r3', name: 'brainstorming', kind: 'auto', status: 'done', code: 1, durationMs: 12_000, tail: '✗ 跑前检查未通过' }),
    ];
    renderHome();

    expect(await screen.findByRole('heading', { name: /正在评测/ })).toBeTruthy();
    expect(screen.getByText('1 个在跑')).toBeTruthy();

    // 三条各一行：名字 + 印章 + 发起方式 + 时长 + 日志尾巴。
    // 注意范围只在「正在评测」这一块里找：能力列表里也有 ponytail 这个能力行。
    const block = screen.getByRole('region', { name: '正在评测' });
    expect(within(block).getByText('ponytail')).toBeTruthy();
    expect(within(block).getByText('评测中')).toBeTruthy();
    expect(within(block).getByText('跑已有用例')).toBeTruthy();
    expect(within(block).getByText('已跑 1 分 12 秒')).toBeTruthy();
    expect(within(block).getByText(/跑 A 侧/)).toBeTruthy();

    expect(within(block).getByText('完成')).toBeTruthy();
    expect(within(block).getByText('自己出题')).toBeTruthy();
    expect(within(block).getByText('5 分 5 秒')).toBeTruthy();

    expect(within(block).getByText('失败')).toBeTruthy();
    expect(within(block).getByText('一键评测')).toBeTruthy();
  });

  it('没有后台任务时不占地方', async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText(/个能力$/)).toBeTruthy());
    expect(screen.queryByRole('heading', { name: /正在评测/ })).toBeNull();
  });

  it('提交后弹窗关掉，这一条立刻出现在列表里（不等下一次轮询）', async () => {
    startRef.mockImplementation(() => Promise.resolve({ runId: 'r-new', run: runOf({ id: 'r-new', name: 'grill-me' }) }));
    const onClose = vi.fn();
    render(
      <HomePage
        capabilities={capabilities}
        taxonomy={taxonomy}
        pendingTags={pendingTags}
        onOpen={() => {}}
        canWrite
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /发起评测/ }));
    const capability = await screen.findByLabelText('能力', { selector: 'input' });
    fireEvent.change(capability, { target: { value: 'ponytail' } });
    const submit = screen.getByRole('button', { name: /提\s*交/ });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);

    // 列表里出现了刚发起的那条
    expect(await screen.findByText('grill-me')).toBeTruthy();
    expect(screen.getByText('评测中')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled(); // 页面自己传的 onClose（这里只确认提交确实交给了后台）
  });

  it('点「看进度」打开进度窗口，显示这次运行的日志', async () => {
    runsRef.list = [runOf()];
    renderHome();

    fireEvent.click(await screen.findByRole('button', { name: /看\s*进度/ }));
    expect(await screen.findByText(/评测进度 · ponytail/)).toBeTruthy();
    expect(await screen.findByLabelText('评测运行日志')).toBeTruthy();
    expect(screen.getByText(/已写试用记录/)).toBeTruthy();
  });

  // 踩过：进度窗口拿"弹窗是什么时候打开的"当起点，刚打开永远显示"已跑 0 秒"，
  // 而这次任务其实已经跑了 1 分 12 秒。时间只能来自服务端（startedAt / durationMs）。
  it('「已跑多久」用服务端的时间，不是打开窗口才开始计时', async () => {
    runsRef.list = [runOf({ durationMs: 372_000, startedAt: Date.now() - 372_000 })];
    renderHome();

    fireEvent.click(await screen.findByRole('button', { name: /看\s*进度/ }));
    const modal = await screen.findByText(/评测进度 · ponytail/);
    const box = modal.closest('.ant-modal') as HTMLElement;
    expect(within(box).getByText('已跑 6 分 12 秒')).toBeTruthy();
    expect(within(box).queryByText(/已跑 0 秒/)).toBeNull();
  });

  it('跑完的窗口显示总用时（服务端定稿的时长）', async () => {
    runsRef.list = [runOf({ status: 'done', code: 0, durationMs: 305_000, tail: '✔ 已写试用记录' })];
    renderHome();

    fireEvent.click(await screen.findByRole('button', { name: /看\s*进度/ }));
    const modal = await screen.findByText(/评测进度 · ponytail/);
    const box = modal.closest('.ant-modal') as HTMLElement;
    expect(within(box).getByText('用时 5 分 5 秒')).toBeTruthy();
  });

  it('任务从"跑着"变成"跑完"的那一刻，重读一次台账', async () => {
    vi.useFakeTimers();
    runsRef.list = [runOf()];
    renderHome();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50); // 第一次轮询
    });
    expect(refresh).not.toHaveBeenCalled();

    // 下一次轮询时它已经跑完了 → 台账重读（新试用记录 / 新结论这时才出现）
    runsRef.list = [runOf({ status: 'done', code: 0, tail: '✔ 已写试用记录' })];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2200);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
