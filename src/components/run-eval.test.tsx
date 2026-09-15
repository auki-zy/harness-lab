// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvalRunInfo } from '../shared/trial-api';

/** 服务端发起评测后返回的那条运行信息（页面列表拿它立刻显示"正在评测"） */
const runOf = (over: Partial<EvalRunInfo> = {}): EvalRunInfo => ({
  id: 'r-run',
  name: 'ponytail',
  tool: 'skill-up',
  toolLabel: '技能（skill-up）',
  kind: 'run',
  status: 'running',
  code: null,
  startedAt: Date.now(),
  durationMs: 0,
  tail: '▶ node tools/skillup-bridge.mjs run --name ponytail',
  ...over,
});

const auto = vi.fn((_input: { input: string; task?: string }) =>
  Promise.resolve({ runId: 'r-auto', run: runOf({ id: 'r-auto', name: 'ui-ux-pro-max', kind: 'auto' }) }),
);
const start = vi.fn((_input: { tool: string; name: string; repeat?: number }) => Promise.resolve({ runId: 'r-run', run: runOf() }));
const draft = vi.fn((input: { name?: string; input?: string }) =>
  Promise.resolve({
    prompt: '做一个落地页：只交付 index.html，用浏览器打开就能看到效果',
    pulled: input.input ? 'ui-ux-pro-max' : undefined,
  }),
);
const market = vi.fn((_q: string) =>
  Promise.resolve({
    skills: [
      {
        id: 'ui-ux-pro-max',
        name: 'ui-ux-pro-max',
        author: 'nextlevelbuilder',
        description: '面向 Web、移动端与桌面端的 UI/UX 设计知识库',
        source: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/main/.claude/skills/ui-ux-pro-max',
        url: 'https://skillsmp.com/creators/nextlevelbuilder/ui-ux-pro-max-skill',
        stars: 1200,
      },
    ],
  }),
);

interface EvalEngine {
  name: string;
  ok: boolean;
  detail: string;
}

/** 本机引擎与登录状态（可改：模拟没装 / 没登录） */
const enginesRef: { list: EvalEngine[] } = { list: [{ name: 'codex', ok: true, detail: '登录状态：API key' }] };

vi.mock('../shared/trial-api', () => ({
  evalStatus: () =>
    Promise.resolve({
      tools: [
        { id: 'skill-up', label: '技能（skill-up）', hint: '已就绪' },
        { id: 'promptfoo', label: '子代理（promptfoo）', hint: '' },
        { id: 'mcp-probe', label: 'MCP（协议探针）', hint: '' },
      ],
      capabilities: [
        { id: 'ponytail', type: 'skill', tool: 'skill-up', hasConfig: true, registered: true },
        { id: 'no-config', type: 'skill', tool: 'skill-up', hasConfig: false, registered: false },
        { id: 'mcp-demo', type: 'mcp', tool: 'mcp-probe', hasConfig: true, registered: true },
        { id: 'task-scout', type: 'agent', tool: 'promptfoo', hasConfig: true, registered: true },
      ],
      purposes: ['code-quality', 'integration'],
      engines: enginesRef.list,
    }),
  evalAuto: (input: { input: string }) => auto(input),
  evalStart: (input: { tool: string; name: string }) => start(input),
  draftPrompt: (input: { name?: string; input?: string }) => draft(input),
  searchMarket: (q: string) => market(q),
  evalRunState: () => Promise.resolve({ status: 'done' as const, code: 0, log: '✔ 已生成：evals/cases/x.yaml\n已写试用记录' }),
  evalPrepare: () => Promise.resolve({ ok: true, code: 0, log: '' }),
  evalImport: () => Promise.resolve({ ok: true, code: 0, log: '' }),
  saveReview: () => Promise.resolve({ ok: true as const, trialId: 'x' }),
  writeApiAvailable: () => Promise.resolve(true),
}));

import { RunEval } from './run-eval';

/** AntD 会在两个汉字的按钮文案中间插一个空格（`提交` 渲染成 `提 交`），所以按钮用正则找 */
const SUBMIT = /提\s*交/;

afterEach(() => {
  cleanup();
  auto.mockClear();
  start.mockClear();
  draft.mockClear();
  enginesRef.list = [{ name: 'codex', ok: true, detail: '登录状态：API key' }];
});

/** 「发起评测」的验收：**一个表单（能力 + 提示词）+ 页脚一颗「提交」**，没有别的可选项 */
describe('发起评测弹窗', () => {
  it('是表单：能力是 Input、提示词是 TextArea；「提交」在右下角「关闭」旁边，初始点不动', async () => {
    render(<RunEval open onClose={() => {}} />);
    const submit = await screen.findByRole('button', { name: SUBMIT });
    const capability = screen.getByLabelText('能力', { selector: 'input' }) as HTMLInputElement;
    const task = screen.getByLabelText(/提示词/, { selector: 'textarea' }) as HTMLTextAreaElement;

    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(capability.tagName).toBe('INPUT');
    expect(capability.placeholder).toContain('owner/repo');
    expect(task.tagName).toBe('TEXTAREA');
    expect(task.placeholder).toContain('你自己出的任务');

    // 真的是 AntD Form 的字段结构（label 与控件成对）；提示词那格的 label 里带一个小动作
    for (const label of ['能力', '提示词']) {
      const el = Array.from(document.querySelectorAll('.ant-form-item-label label')).find((l) =>
        (l.textContent ?? '').startsWith(label),
      );
      expect(el, `表单里少了「${label}」这一格`).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: '根据能力生成' })).toBeTruthy();

    // 那些"要人做选择"的东西都该消失
    for (const gone of ['更多选项', '引擎', '用途标签', '导入', 'Inspector']) {
      expect(screen.queryByText(new RegExp(gone))).toBeNull();
    }
    // 表单下方不再挂常驻提示：能跑的时候一句话都不多说
    expect(screen.queryByText(/名字直接用/)).toBeNull();
    expect(screen.queryByText(/配置就绪/)).toBeNull();
    expect(document.querySelectorAll('.ant-alert').length).toBe(0);

    // 页脚：关闭在左、提交在右，紧挨着（AntD 插的空格先去掉再比）
    const footer = document.querySelector('.ant-modal-footer') as HTMLElement;
    const labels = Array.from(footer.querySelectorAll('button')).map((b) => (b.textContent ?? '').replace(/\s+/g, ''));
    expect(labels).toEqual(['关闭', '提交']);
  });

  it('填已有候选的名字 → 直接跑它的配置；填链接 → 走"拉取 + 自动设计用例"', async () => {
    const onClose = vi.fn();
    const started = vi.fn();
    render(<RunEval open onClose={onClose} onStarted={started} />);
    const submit = await screen.findByRole('button', { name: SUBMIT });
    const capability = screen.getByLabelText('能力', { selector: 'input' });

    fireEvent.change(capability, { target: { value: 'ponytail' } });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start.mock.calls[0][0]).toEqual({ tool: 'skill-up', name: 'ponytail' });
    expect(auto).not.toHaveBeenCalled();
    // 提交即关窗：这次运行交给列表去盯（不再把人关在弹窗里等十几分钟）
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(started.mock.calls[0][0]).toMatchObject({ id: 'r-run', status: 'running', name: 'ponytail' });

    cleanup();
    auto.mockClear();
    start.mockClear();
    const onClose2 = vi.fn();
    const started2 = vi.fn();
    render(<RunEval open onClose={onClose2} onStarted={started2} />);
    const capability2 = await screen.findByLabelText('能力', { selector: 'input' });
    fireEvent.change(capability2, { target: { value: 'DietrichGebert/ponytail' } });
    const submit2 = screen.getByRole('button', { name: SUBMIT });
    await waitFor(() => expect((submit2 as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit2);
    await waitFor(() => expect(auto).toHaveBeenCalledTimes(1));
    expect(auto.mock.calls[0][0]).toEqual({ input: 'DietrichGebert/ponytail' });
    expect(start).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose2).toHaveBeenCalledTimes(1));
  });

  it('「根据能力生成」：先起草一条贴合能力的提示词，用户改完再提交', async () => {
    render(<RunEval open onClose={() => {}} />);
    const submit = await screen.findByRole('button', { name: SUBMIT });
    const capability = screen.getByLabelText('能力', { selector: 'input' });
    const task = screen.getByLabelText(/提示词/, { selector: 'textarea' }) as HTMLTextAreaElement;

    // 还没填能力名时按钮不可点（不知道该按哪个能力起草）
    const generate = screen.getByRole('button', { name: '根据能力生成' }) as HTMLButtonElement;
    expect(generate.disabled).toBe(true);

    fireEvent.change(capability, { target: { value: 'ponytail' } });
    await waitFor(() => expect((generate as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(generate);
    await waitFor(() => expect(draft).toHaveBeenCalledWith({ name: 'ponytail' }));
    // 起草的内容只是填进输入框，**不自动开跑**
    await waitFor(() => expect(task.value).toContain('index.html'));
    expect(auto).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();

    // 改完再提交：按"这段提示词"跑 A/B
    fireEvent.change(task, { target: { value: `${task.value}（我改了一下）` } });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(auto).toHaveBeenCalledTimes(1));
    expect(auto.mock.calls[0][0].task).toContain('我改了一下');
  });

  it('「根据能力生成」对**来源链接**也管用：先把它拉进候选池，再按它的 SKILL.md 起草', async () => {
    render(<RunEval open onClose={() => {}} />);
    const capability = (await screen.findByLabelText('能力', { selector: 'input' })) as HTMLInputElement;
    const task = screen.getByLabelText(/提示词/, { selector: 'textarea' }) as HTMLTextAreaElement;
    const generate = screen.getByRole('button', { name: '根据能力生成' }) as HTMLButtonElement;

    // 从技能市场选出来的就是这种链接：以前这种输入下按钮永远是灰的（用户反馈）
    fireEvent.change(capability, {
      target: { value: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/main/.claude/skills/ui-ux-pro-max' },
    });
    await waitFor(() => expect(generate.disabled).toBe(false));

    fireEvent.click(generate);
    await waitFor(() => expect(draft).toHaveBeenCalledWith({ input: capability.value }));
    await waitFor(() => expect(task.value).toContain('index.html'));
    // 顺手把"已经拉进候选池"这件事说出来，别让人以为凭空读到了 SKILL.md
    await waitFor(() => expect(screen.getByText(/拉进候选池/)).toBeTruthy());
  });

  it('技能市场：按关键词搜出来，选中即填「能力」，点「评测」直接开跑', async () => {
    render(<RunEval open onClose={() => {}} />);
    const capability = (await screen.findByLabelText('能力', { selector: 'input' })) as HTMLInputElement;

    // 默认收着：弹窗保持"两格 + 页脚"
    expect(screen.queryByLabelText('搜索技能市场')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '技能市场' }));

    const box = await screen.findByLabelText('搜索技能市场');
    fireEvent.change(box, { target: { value: 'ui' } });
    fireEvent.click(screen.getByRole('button', { name: /搜\s*索/ }));
    await waitFor(() => expect(market).toHaveBeenCalledWith('ui'));

    // 结果里要有：名字、作者+来源、描述、星数
    expect(await screen.findByText('ui-ux-pro-max')).toBeTruthy();
    expect(screen.getByText(/nextlevelbuilder\/ui-ux-pro-max-skill:ui-ux-pro-max/)).toBeTruthy();
    expect(screen.getByText(/UI\/UX 设计知识库/)).toBeTruthy();
    expect(screen.getByText(/★ 1.2k/)).toBeTruthy();

    // 选中一条 → 填进「能力」（市场给的就是我们认的 GitHub 来源写法），面板收起
    fireEvent.click(screen.getByText('ui-ux-pro-max'));
    await waitFor(() => expect(capability.value).toContain('github.com/nextlevelbuilder/ui-ux-pro-max-skill'));
    expect(screen.queryByLabelText('搜索技能市场')).toBeNull();

    // 再搜一次，用「评测」按钮：填 + 直接开跑（走 auto 那条路）
    fireEvent.click(screen.getByRole('button', { name: '技能市场' }));
    fireEvent.change(screen.getByLabelText('搜索技能市场'), { target: { value: 'ui' } });
    fireEvent.click(screen.getByRole('button', { name: /搜\s*索/ }));
    fireEvent.click(await screen.findByRole('button', { name: /评\s*测/ }));
    await waitFor(() => expect(auto).toHaveBeenCalledTimes(1));
    expect(auto.mock.calls[0][0].input).toContain('github.com/nextlevelbuilder/ui-ux-pro-max-skill');
  });

  it('可以自己出题：填了提示词就走"按这段提示词跑 A/B"，并原样带上', async () => {
    render(<RunEval open onClose={() => {}} />);
    const submit = await screen.findByRole('button', { name: SUBMIT });
    const capability = screen.getByLabelText('能力', { selector: 'input' });
    const task = screen.getByLabelText(/提示词/, { selector: 'textarea' });

    fireEvent.change(capability, { target: { value: 'ponytail' } });
    fireEvent.change(task, { target: { value: '写一个 Node 脚本 dedupe.mjs：按行去重后打印到 stdout' } });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(submit);
    await waitFor(() => expect(auto).toHaveBeenCalledTimes(1));
    expect(auto.mock.calls[0][0]).toEqual({ input: 'ponytail', task: '写一个 Node 脚本 dedupe.mjs：按行去重后打印到 stdout' });
    // 自己出题时不走"跑它已有用例"那条路
    expect(start).not.toHaveBeenCalled();
  });

  it('跑不了的时候才给一条原因：入口没开 / 名字对不上 / 没有可用引擎', async () => {
    render(<RunEval open onClose={() => {}} />);
    const capability = await screen.findByLabelText('能力', { selector: 'input' });

    fireEvent.change(capability, { target: { value: 'mcp-demo' } });
    await waitFor(() => expect(screen.getAllByText(/MCP 的评测入口暂未开放/).length).toBeGreaterThan(0));
    expect((screen.getByRole('button', { name: SUBMIT }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(capability, { target: { value: 'task-scout' } });
    await waitFor(() => expect(screen.getAllByText(/子代理 的评测入口暂未开放/).length).toBeGreaterThan(0));
    expect((screen.getByRole('button', { name: SUBMIT }) as HTMLButtonElement).disabled).toBe(true);
    expect(start).not.toHaveBeenCalled();

    // 名字对不上、也不像链接 → 说清是名字的问题，不是环境的问题
    fireEvent.change(capability, { target: { value: '并不存在的技能' } });
    await waitFor(() => expect(screen.getAllByText(/也不像 owner\/repo 链接/).length).toBeGreaterThan(0));
    expect((screen.getByRole('button', { name: SUBMIT }) as HTMLButtonElement).disabled).toBe(true);

    cleanup();
    start.mockClear();
    enginesRef.list = [{ name: 'claude_code', ok: false, detail: '装了但没登录 —— 运行 `claude auth login`' }];
    render(<RunEval open onClose={() => {}} />);
    const capability2 = await screen.findByLabelText('能力', { selector: 'input' });
    fireEvent.change(capability2, { target: { value: 'no-config' } });
    await waitFor(() => expect(screen.getAllByText(/引擎装了但都不可用/).length).toBeGreaterThan(0));
    expect((screen.getByRole('button', { name: SUBMIT }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(/claude auth login/).length).toBeGreaterThan(0);
  });
});

  it('可以要求重复跑：选 2 次 → 提交时带上 repeat（结论里会给"全过几次"）', async () => {
    render(<RunEval open onClose={() => {}} onStarted={() => {}} />);
    const submit = await screen.findByRole('button', { name: SUBMIT });
    const capability = screen.getByLabelText('能力', { selector: 'input' });
    fireEvent.change(capability, { target: { value: 'ponytail' } });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));

    // AntD 的 Select：先按下选择器（展开下拉），再点选项
    fireEvent.mouseDown(screen.getByLabelText('重复跑次数'));
    fireEvent.click(await screen.findByText('2 次'));

    fireEvent.click(submit);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start.mock.calls[0][0]).toEqual({ tool: 'skill-up', name: 'ponytail', repeat: 2 });
  });

  it('默认不重复：repeat 不带上（别让 1 次运行看起来像"重复过"）', async () => {
    render(<RunEval open onClose={() => {}} onStarted={() => {}} />);
    const submit = await screen.findByRole('button', { name: SUBMIT });
    const capability = screen.getByLabelText('能力', { selector: 'input' });
    fireEvent.change(capability, { target: { value: 'ponytail' } });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start.mock.calls[0][0].repeat).toBeUndefined();
  });
