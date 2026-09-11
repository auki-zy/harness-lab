// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evidenceGroups } from '../shared/findings';
import type { Trial } from '../shared/types';
import { EvidenceFiles } from './evidence-files';

/** 真实 skill-up 产物路径的形状：iteration-N/<用例>/without_skill|with_skill/... + 根上的报告 */
const FILES = [
  'adopted/skills/ponytail-workspace/iteration-6/wc-cli/without_skill/outputs/workspace/wc.mjs',
  'adopted/skills/ponytail-workspace/iteration-6/wc-cli/with_skill/outputs/workspace/wc.mjs',
  'adopted/skills/ponytail-workspace/iteration-6/wc-cli/with_skill/outputs/workspace/.claude/skills/ponytail/SKILL.md',
  'adopted/skills/ponytail-workspace/iteration-6/result.json',
  'adopted/skills/ponytail-workspace/iteration-6/benchmark.md',
  'adopted/skills/ponytail-workspace/iteration-6/report.html',
  'adopted/skills/ponytail-workspace/iteration-6/shot.png',
  'adopted/skills/ponytail-workspace/iteration-6/report.pdf',
];

const trial = { trialId: 't', kind: 'controlled', evidence: FILES } as unknown as Trial;
const groups = evidenceGroups(trial);

const fetchMock = vi.fn();

function textResponse(body: string, length = body.length) {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-length': String(length) }),
    text: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => textResponse('# 判定记录\n用例 wc-cli 2/2 通过'));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 证据链查看器：左边按"证明什么"分组的文件、右边内容 */
describe('证据原始文件视图', () => {
  it('文件按 A 版 / B 版 / 判定记录 / 技能自带 分组，每组说清这组是什么', () => {
    render(<EvidenceFiles groups={groups} />);

    const titles = Array.from(document.querySelectorAll('.ev__group-title')).map((el) => el.textContent);
    expect(titles).toEqual([
      'A 版产物（不加载能力）',
      'B 版产物（加载能力）',
      '判定记录（工具报告）',
      '随技能一起进去的文件',
      '其它留档',
    ]);

    // 分组说明：A / B 各一句，"判定记录"要说清结论是按它算的
    expect(screen.getByText(/不加载技能这一版留下的东西/)).toBeTruthy();
    expect(screen.getByText(/加载了技能这一版留下的东西/)).toBeTruthy();
    expect(screen.getByText(/结论就是按它算的/)).toBeTruthy();

    // A 组只有 A 侧文件；B 组只放这次跑出来的产物，技能自带的那些单独一组（不然会被淹）
    const [aGroup, bGroup, , skillGroup] = Array.from(document.querySelectorAll('.ev__group')) as HTMLElement[];
    expect(aGroup.querySelectorAll('.ev__file').length).toBe(1);
    expect(aGroup.textContent).not.toContain('with_skill');
    expect(bGroup.querySelectorAll('.ev__file').length).toBe(1);
    expect(bGroup.textContent).toContain('wc.mjs');
    expect(bGroup.textContent).not.toContain('SKILL.md');
    // 技能自带的那组默认收着（和这次跑出来的东西无关），展开才看得到
    expect(skillGroup.querySelectorAll('.ev__file').length).toBe(0);
    fireEvent.click(within(skillGroup).getByRole('button', { name: '展开' }));
    expect(skillGroup.querySelectorAll('.ev__file').length).toBe(1);
    expect(skillGroup.textContent).toContain('SKILL.md');
  });

  it('左边列出全部文件，右边默认显示第一个文件的内容（代码块）', async () => {
    render(<EvidenceFiles groups={groups} />);

    // 技能自带那组默认收着，所以第一眼看到的是 7 个（展开后 8 个）
    expect(screen.getByLabelText('证据文件').querySelectorAll('.ev__file').length).toBe(FILES.length - 1);
    fireEvent.click(screen.getByRole('button', { name: '展开' }));
    expect(screen.getByLabelText('证据文件').querySelectorAll('.ev__file').length).toBe(FILES.length);
    // A、B 两侧的产物常常同名（都叫 wc.mjs），所以这里用 getAll
    expect(screen.getAllByText('wc.mjs').length).toBe(2);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain('without_skill');
    expect((await screen.findByLabelText('wc.mjs 的内容')).textContent).toContain('2/2 通过');
    expect(document.querySelector('.ev__file[aria-current="true"]')?.textContent).toContain('wc.mjs');
  });

  it('点另一个文件 → 换成它的内容，且内容框高度不塌（不闪）', async () => {
    render(<EvidenceFiles groups={groups} />);
    await screen.findByLabelText('wc.mjs 的内容');

    const code = document.querySelector('.ev__code') as HTMLElement;
    fetchMock.mockImplementation(() => textResponse('用例 wc-cli 1/2 通过'));
    fireEvent.click(screen.getByText('result.json'));

    // 切过去的瞬间：同一个代码块还在（不卸载、不清空高度），只是标记为读取中
    expect(document.querySelector('.ev__code')).toBe(code);
    expect(code.getAttribute('aria-busy')).toBe('true');

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('result.json')));
    expect((await screen.findByLabelText('result.json 的内容')).textContent).toContain('1/2 通过');
    expect(code.getAttribute('aria-busy')).toBe('false');
  });

  it('图片直接预览（不抓文本），认不出的二进制只给一句说明', async () => {
    render(<EvidenceFiles groups={groups} />);
    await screen.findByLabelText('wc.mjs 的内容');
    const callsAfterFirst = fetchMock.mock.calls.length;

    fireEvent.click(screen.getByText('shot.png'));
    const img = (await screen.findByAltText('shot.png')) as HTMLImageElement;
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toContain('shot.png');

    fireEvent.click(screen.getByText('report.pdf'));
    await waitFor(() => expect(screen.getAllByText(/这个文件不是文本/).length).toBeGreaterThan(0));
    // 图片与二进制都不去抓文本；注意 report.html 是判定记录、会被抓，所以这里只比"点图片前后"
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(callsAfterFirst + 1);
  });

  it('读不出来就说读不出来，并指向「新窗口打开」', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 404, headers: new Headers(), text: () => Promise.resolve('') }));
    render(<EvidenceFiles groups={groups} />);

    await waitFor(() => expect(screen.getAllByText(/内容读不出来（读取失败（HTTP 404））/).length).toBeGreaterThan(0));
    expect(screen.getAllByRole('link', { name: '新窗口打开' }).length).toBeGreaterThan(0);
  });

  it('超长文件只渲染前面一段，并说明截断了', async () => {
    fetchMock.mockImplementation(() => textResponse('x'.repeat(50_000)));
    render(<EvidenceFiles groups={groups} />);

    const code = await screen.findByLabelText('wc.mjs 的内容');
    expect((code.textContent ?? '').length).toBe(40_000);
    expect(screen.getAllByText(/只显示前 40,000 字/).length).toBeGreaterThan(0);
  });

  it('没有证据文件时说清楚，而不是空白', () => {
    render(<EvidenceFiles groups={[]} />);
    expect(screen.getByText('这次没有留下可复核的证据文件')).toBeTruthy();
  });
});
