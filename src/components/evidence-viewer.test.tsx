// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evidenceGroups } from '../shared/findings';
import type { Trial } from '../shared/types';
import { EvidenceViewer } from './evidence-viewer';

const A_PATH = 'w/iteration-8/wc-cli/without_skill/outputs/workspace/wc.mjs';
const B_PATH = 'w/iteration-8/wc-cli/with_skill/outputs/workspace/wc.mjs';

const trial = {
  trialId: 't',
  kind: 'controlled',
  conditions: [
    { name: 'A', withCapability: false, artifact: A_PATH },
    { name: 'B', withCapability: true, artifact: B_PATH },
  ],
  measures: { correctness: { A: 1, B: 1 } },
  evidence: [A_PATH, B_PATH, 'w/iteration-8/result.json', 'w/iteration-8/report.html'],
} as unknown as Trial;

const groups = evidenceGroups(trial);

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '10' }),
        text: () => Promise.resolve('x'),
        json: () =>
          Promise.resolve({
            case_results: [
              { case_id: 'wc-cli', configuration: 'with_skill', grading: { status: 'PASS', assertion_results: [] } },
              { case_id: 'wc-cli', configuration: 'without_skill', grading: { status: 'FAIL', assertion_results: [] } },
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

/** 证据区：先给"怎么判的"，原始文件默认收着 */
describe('证据区', () => {
  it('默认只显示判定结果，原始文件收在一个折叠入口里', async () => {
    render(<EvidenceViewer trial={trial} groups={groups} />);

    // 判定结果区在（fetch 完才渲染）
    expect(await screen.findByText('wc-cli')).toBeTruthy();
    expect(document.querySelector('.judge')).toBeTruthy();
    // 原始文件：默认不展开
    const toggle = screen.getByRole('button', { name: '原始记录（4 个文件）' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('证据文件')).toBeNull();

    // 展开后才是分组文件列表
    fireEvent.click(toggle);
    expect(screen.getByLabelText('证据文件')).toBeTruthy();
    expect(screen.getByRole('button', { name: '收起原始记录' })).toBeTruthy();
  });

  it('不再摆 A / B 对照（详情顶部的对照板已经能直接打开两侧产物）', () => {
    render(<EvidenceViewer trial={trial} groups={groups} />);
    expect(screen.queryByText(/A \/ B 对照/)).toBeNull();
    expect(document.querySelector('.cmp')).toBeNull();
  });
});
