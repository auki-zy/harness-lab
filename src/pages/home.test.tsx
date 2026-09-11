// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { getAppData } from '../shared/data';

const capabilities = getAppData().capabilities;
import { capabilityDecisionView, capabilityDescription, evidenceList } from '../shared/findings';
import type { Capability } from '../shared/types';

// 证据查看器会去抓文件内容：单测里挡掉网络（否则 jsdom 会真的去连 localhost:3000，慢十几秒）
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve('# 证据（测试里挡掉了网络）'),
        // 判定记录是 JSON：给一份最小可解析的，判定视图才渲染得出来
        json: () =>
          Promise.resolve({
            case_results: [
              {
                case_id: 'ask-dedupe',
                configuration: 'with_skill',
                status: 'PASS',
                grading: { status: 'PASS', assertion_results: [{ text: 'expect.exit_code', passed: true, evidence: 'ok' }] },
              },
              {
                case_id: 'ask-dedupe',
                configuration: 'without_skill',
                status: 'FAIL',
                grading: {
                  status: 'FAIL',
                  assertion_results: [{ text: 'expect.exit_code', passed: false, evidence: '多了未要求的防御代码' }],
                },
              },
            ],
          }),
      }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const cap = capabilities[0] as Capability;

/** 用真实评测数据渲染：这些断言就是「页面确实说明了什么」的证据 */
describe('能力台账页面', () => {
  it('台账行：印章、一句话说明、对照条（选中侧只打勾）、安装命令可复制', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('能力台账');

    expect(screen.getByText(String(cap.id))).toBeTruthy();
    // 行上的印章是"能力级结论"（能力状态），不是某一次试用的结论
    expect(screen.getAllByText(capabilityDecisionView(cap).stamp).length).toBeGreaterThan(0);
    // 行内那句是"这个能力是干什么的"（说明），不是结论
    expect(screen.getAllByText(capabilityDescription(cap)).length).toBeGreaterThan(0);

    // 对照条：两半写短标签，选中侧只打勾；不再有说明句
    expect(screen.getAllByText('不加载').length).toBeGreaterThan(0);
    expect(screen.getAllByText('加载').length).toBeGreaterThan(0);
    expect(document.querySelector('.beam__seg--win')).toBeTruthy();
    expect(document.querySelector('.beam__win')).toBeTruthy();
    expect(document.querySelector('.beam__caption')).toBeNull();
    expect(screen.queryAllByText(/人评更好/)).toHaveLength(0);

    // 已采纳的能力给出安装命令与复制按钮
    expect(screen.getAllByText(/harness-tool add /).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '复制安装命令' }).length).toBeGreaterThan(0);

    // 收录概况：三个统计项各带标签与数字
    const facts = screen.getByLabelText('收录概况');
    for (const label of ['收录', '已采纳', '试用中']) {
      expect(within(facts).getByText(label)).toBeTruthy();
    }
    expect(within(facts).getAllByText(String(capabilities.length)).length).toBeGreaterThan(0);
  });

  it('搜索只认名称与说明（来源、标签、试用内容不参与）', () => {
    render(<App />);
    const input = screen.getByLabelText('搜索能力');

    fireEvent.change(input, { target: { value: 'zzz-不存在' } });
    expect(screen.getByText(/没有匹配的能力/)).toBeTruthy();

    fireEvent.change(input, { target: { value: 'frontend' } });
    expect(screen.queryByText(/没有匹配的能力/)).toBeNull();

    // 说明里的词能命中（说明来自能力自身的描述字段）
    fireEvent.change(input, { target: { value: '字体排版' } });
    expect(screen.queryByText(/没有匹配的能力/)).toBeNull();

    // 来源仓库不进搜索
    fireEvent.change(input, { target: { value: 'anthropics' } });
    expect(screen.getByText(/没有匹配的能力/)).toBeTruthy();
  });

  it('标签筛选：chip 可切换，维度名与取值分两段显示', () => {
    render(<App />);
    const chip = screen.getByRole('button', { name: /界面设计/ });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(String(cap.id))).toBeTruthy();
  });

  it('详情：五个模块（结论 / 原因 / 如何使用 / 试用记录卡片 / 来源标签）+ 二级试用详情', async () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: /看完整记录/ })[0]);

    const panel = await screen.findByRole('dialog');
    // 不再有 eyebrow；五个模块标题清晰
    expect(within(panel).queryAllByText(/能力记录|结论（能力级）/)).toHaveLength(0);
    for (const title of ['结论', '采纳原因', '如何使用', '来源与标签']) {
      expect(within(panel).getAllByText(title).length).toBeGreaterThan(0);
    }
    expect(panel.textContent ?? '').toMatch(/试用记录（\d+ 次）/);
    // 结论模块只有一个印章：采纳 / 挂起 / 放弃 / 重试 / 未评估
    const expected = capabilityDecisionView(cap);
    expect(within(panel).getAllByText(expected.stamp).length).toBeGreaterThan(0);
    expect(within(panel).queryAllByText(expected.headline)).toHaveLength(0);
    // 如何使用：安装命令 + 复制
    expect(within(panel).getAllByText(/harness-tool add /).length).toBeGreaterThan(0);
    // 试用记录是紧凑小表格（卡片形态已撤）
    expect(panel.querySelectorAll('.trial-card').length).toBe(0);
    expect(panel.querySelectorAll('.ant-table-tbody tr.ant-table-row').length).toBe(cap.trials.length);

    fireEvent.click(within(panel).getAllByRole('button', { name: /详\s*情/ })[0]);
    const dialogs = await screen.findAllByRole('dialog');
    const detail = dialogs[dialogs.length - 1];
    expect(within(detail).getByText(/评审人怎么说/)).toBeTruthy();
    expect(within(detail).getByText(/客观指标/)).toBeTruthy();
    expect(within(detail).getByText(/为什么这么判/)).toBeTruthy();
    // 这条是人评 + 受控对比 → 不摆证据链，说明里指向「条件」里的 A/B 产物（不能说"别的仓库"）
    expect(within(detail).queryAllByText(/对比证据链/)).toHaveLength(0);
    expect(within(detail).getAllByText(/不摆证据链/).length).toBeGreaterThan(0);
    expect(within(detail).getAllByText(/「条件」/).length).toBeGreaterThan(0);
    expect(within(detail).queryAllByText(/别的仓库/)).toHaveLength(0);
  });

  it('两次试用互相隔离：各自详情里只出现自己的任务内容', async () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: /看完整记录/ })[0]);
    const panel = await screen.findByRole('dialog');
    const rows = within(panel).getAllByRole('button', { name: /详\s*情/ });
    // 列表是"最近一次在前面"，与 reverse 后的 trials 对齐
    const tasks = [...cap.trials].reverse().map((t) => t.task?.id ?? t.trialId);

    for (let i = 0; i < rows.length; i++) {
      fireEvent.click(rows[i]);
      const dialogs = await screen.findAllByRole('dialog');
      const text = dialogs[dialogs.length - 1].textContent ?? '';
      tasks.forEach((task, j) => {
        if (i === j) expect(text).toContain(task);
        else expect(text).not.toContain(task);
      });
    }
  });

  it('试用记录是分页小表格：一页 5 条，翻页能看到更早的记录', async () => {
    render(<App />);
    const ponytail = capabilities.find((c) => c.id === 'ponytail') as Capability;
    expect(ponytail.trials.length).toBeGreaterThan(5); // 这条用例靠"多于 5 条"才有意义

    const rowIds = screen.getAllByText(String(ponytail.id));
    const row = rowIds[0].closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /看完整记录/ }));

    const panel = await screen.findByRole('dialog');
    const wrap = (panel.querySelector('.ant-table-wrapper') ?? panel.querySelector('.ant-table')) as HTMLElement;
    expect(wrap).toBeTruthy();

    const heads = Array.from(wrap.querySelectorAll('.ant-table-thead th')).map((th) => (th.textContent ?? '').trim());
    expect(heads).toEqual(['结论', '日期', '任务', '方式', '人评', '']);

    const rows = (): HTMLElement[] => Array.from(wrap.querySelectorAll('.ant-table-tbody tr.ant-table-row')) as HTMLElement[];
    expect(rows().length).toBe(5);
    expect(wrap.textContent ?? '').toContain(`共 ${ponytail.trials.length} 次试用`);
    // 最近的一次在最前面：日期只留「月-日」，所以按短写法比
    const newest = ponytail.trials[ponytail.trials.length - 1];
    expect(rows()[0].textContent ?? '').toContain((newest.date ?? '').slice(5));
    // 任务列定宽省略：完整值放在 title 里
    const newestTask = newest.task?.id ?? newest.trialId;
    expect(rows()[0].querySelector('.trials__task')?.getAttribute('title')).toBe(newestTask);
    // 方式与人评都缩成短记号，完整说法在 title 里
    expect(['对比', '模拟', '实跑', '探针']).toContain(rows()[0].querySelector('.trials__kind')?.textContent);
    expect(rows()[0].querySelector('.trials__kind')?.getAttribute('title')).toMatch(/：/);
    expect(rows()[0].querySelector('.trials__review')?.textContent).toMatch(/👍|👎|—/);
    const firstRow = rows()[0].textContent ?? '';

    // 翻到第二页：剩下的是更早的记录
    fireEvent.click(wrap.querySelector('.ant-pagination-next button') as HTMLElement);
    await waitFor(() => expect(rows().length).toBe(ponytail.trials.length - 5));
    expect(rows()[0].textContent ?? '').not.toBe(firstRow);
  });

  it('入口开关：类型筛选只列已开放的类型（MCP / 子代理先注释掉了）', () => {
    render(<App />);
    // 台账里现在只有技能
    expect(capabilities.every((c) => c.type === 'skill')).toBe(true);
    // 类型维度只出现"技能"，不出现子代理 / MCP 服务的筛选项
    const filters = screen.getByLabelText('搜索与筛选');
    expect(within(filters).getAllByText('技能').length).toBeGreaterThan(0);
    expect(within(filters).queryByText('子代理')).toBeNull();
    expect(within(filters).queryByText('MCP 服务')).toBeNull();
    // 页眉的「发起评测」在测试环境（没有 dev 接口）本来就不出现
    expect(screen.queryByRole('button', { name: '发起评测' })).toBeNull();
  });

  // ↓ 这三条都要开二级抽屉：jsdom 里 AntD Table 一旦挂上，打开抽屉时重算样式很慢
  //   （实测 ~9s，浏览器里没有这个开销），所以单独放宽超时，别用它去卡"页面变慢了"
  it(
    '成本与效率维度真的出现在页面上（拿 ponytail 那条真跑记录验证）',
    async () => {
    render(<App />);
    // 找到 ponytail 那一行的「看完整记录」
    const ponytail = capabilities.find((c) => c.id === 'ponytail') as Capability;
    const rowIds = screen.getAllByText(String(ponytail.id));
    const row = rowIds[0].closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /看完整记录/ }));

    const panel = await screen.findByRole('dialog');
    // 有指标的那条是最后一次真跑（列表最近在前）
    fireEvent.click(within(panel).getAllByRole('button', { name: /详\s*情/ })[0]);
    const dialogs = await screen.findAllByRole('dialog');
    const detail = dialogs[dialogs.length - 1];
    const text = detail.textContent ?? '';

    for (const label of ['总 token', '输入 token', '输出 token', '耗时（单条用例）', '交互轮次', '工具调用次数', '工具调用构成']) {
      expect(text, `详情里少了「${label}」这一行`).toContain(label);
    }
    // 数字要可读：token 带千分位、耗时带"秒"、工具调用带"次"
    expect(text).toMatch(/[\d,]{5,}/);
    expect(text).toMatch(/\d+(\.\d+)? 秒/);
    expect(text).toMatch(/\d+ 次/);

    // 主角是"前后对照"：两栏（A 不加载 / B 加载）+ 结论 + 产物 + 一句"差在哪"，且排在明细之前
    const board = detail.querySelector('.board') as HTMLElement;
    expect(board, '详情里没有前后对照块').toBeTruthy();
    expect(board.querySelectorAll('.board__side').length).toBe(2);
    expect(board.textContent ?? '').toContain('不加载');
    expect(board.textContent ?? '').toContain('加载了');
    expect(board.textContent ?? '').toMatch(/做到了|没做到/);
    expect(within(board).getAllByRole('link', { name: '打开产物' }).length).toBeGreaterThan(0);
    expect(board.querySelector('.board__digest')?.textContent ?? '').toMatch(/→/);
    // 对照块在「客观指标」之前（重点先出，细节后置）
    const sections = Array.from(detail.querySelectorAll('.sheet'));
    const boardIndex = sections.findIndex((s) => s.querySelector('.board'));
    const tableIndex = sections.findIndex((s) => s.querySelector('.measure'));
    expect(boardIndex).toBeGreaterThanOrEqual(0);
    expect(boardIndex).toBeLessThan(tableIndex);

    // 证据区：默认只给"怎么判的"（一行一个用例、一行一条判据），原始文件收在折叠入口里
    //（A/B 各自的产物在上面那块对照板里已经能直接打开，不再重复摆一遍）
    expect(text).toContain('怎么证明的');
    // 判定结果是异步读 result.json 才有的，等它渲染出来
    await waitFor(() => expect(detail.querySelector('.judge')).toBeTruthy());
    const raw = within(detail).getByRole('button', { name: /原始记录（\d+ 个文件）/ });
    expect(raw.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(raw);
    const evTitles = Array.from(detail.querySelectorAll('.ev__group-title')).map((el) => el.textContent);
    expect(evTitles).toContain('A 版产物（不加载能力）');
    expect(evTitles).toContain('B 版产物（加载能力）');
    expect(evTitles).toContain('判定记录（工具报告）');
    // 组里的文件数加起来 = 展开后能看到的证据数（技能自带那组默认收着）
    const grouped = Array.from(detail.querySelectorAll('.ev__group')).reduce(
      (sum, g) => sum + g.querySelectorAll('.ev__file').length,
      0,
    );
    const newest = evidenceList(ponytail.trials[ponytail.trials.length - 1]);
    const collapsed = newest.filter((e) => /\/\.claude\/skills\//i.test(e.path)).length;
    expect(grouped).toBe(newest.length - collapsed);
    },
    30_000,
  );

  it(
    '系统小结：客观指标之后给出 A / B 各自好在哪 + 一句推荐，并把依据写在页面上',
    async () => {
    render(<App />);
    const ponytail = capabilities.find((c) => c.id === 'ponytail') as Capability;
    const rowIds = screen.getAllByText(String(ponytail.id));
    const row = rowIds[0].closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /看完整记录/ }));

    const panel = await screen.findByRole('dialog');
    fireEvent.click(within(panel).getAllByRole('button', { name: /详\s*情/ })[0]);
    const dialogs = await screen.findAllByRole('dialog');
    const detail = dialogs[dialogs.length - 1];

    // 最近一次真跑是 ask-dedupe：A 0/1、B 1/1 → 小结必须给出"推荐 B"，而不是罗列一堆数字
    expect(within(detail).getByText('系统小结：哪一版更好')).toBeTruthy();
    const sides = detail.querySelectorAll('.summary__side');
    expect(sides.length).toBe(2);
    expect(Array.from(sides).filter((s) => s.getAttribute('data-win') === 'true').length).toBe(1);

    const verdict = detail.querySelector('.summary__verdict') as HTMLElement;
    expect(verdict.textContent ?? '').toContain('推荐 B');
    expect(verdict.textContent ?? '').toContain('只有它做到了任务要求');
    expect(verdict.getAttribute('data-side')).toBe('B');

    // 推荐要给得出依据，且说清"这只判这一次对照"
    const rule = detail.querySelector('.summary__rule')?.textContent ?? '';
    expect(rule).toContain('正确性优先');
    expect(rule).toContain('值不值得采纳');

    // 位置：排在「客观指标」之后（先摆数字，再下小结）
    const sections = Array.from(detail.querySelectorAll('.sheet'));
    const summaryIndex = sections.findIndex((s) => s.querySelector('.summary__verdict'));
    const tableIndex = sections.findIndex((s) => s.querySelector('.measure'));
    expect(summaryIndex).toBeGreaterThan(tableIndex);
    },
    30_000,
  );

  it(
    '详情里所有模块标题同一层级（「这次是怎么跑的」不再单独压暗）',
    async () => {
    render(<App />);
    const ponytail = capabilities.find((c) => c.id === 'ponytail') as Capability;
    const rowIds = screen.getAllByText(String(ponytail.id));
    const row = rowIds[0].closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /看完整记录/ }));

    const panel = await screen.findByRole('dialog');
    fireEvent.click(within(panel).getAllByRole('button', { name: /详\s*情/ })[0]);
    const dialogs = await screen.findAllByRole('dialog');
    const detail = dialogs[dialogs.length - 1];

    expect(detail.querySelectorAll('.sheet--muted').length).toBe(0);
    const titles = Array.from(detail.querySelectorAll('.sheet > h3'));
    const howItRan = titles.find((t) => t.textContent === '这次是怎么跑的') as HTMLElement;
    const metrics = titles.find((t) => (t.textContent ?? '').startsWith('客观指标')) as HTMLElement;
    expect(howItRan).toBeTruthy();
    expect(howItRan.className).toBe('sheet__title');
    expect(howItRan.className).toBe(metrics.className);
    // 不只是没有压暗类：所有模块标题都用同一个类
    for (const title of titles) expect(title.className).toBe('sheet__title');
    },
    30_000,
  );
});
