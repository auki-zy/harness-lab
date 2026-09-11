// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trial } from '../shared/types';
import { EvidenceVerdict } from './evidence-verdict';

const trial = {
  trialId: 't',
  kind: 'controlled',
  conditions: [
    { name: 'A', withCapability: false },
    { name: 'B', withCapability: true },
  ],
  evidence: ['w/iteration-8/result.json', 'w/iteration-8/report.html', 'w/iteration-8/benchmark.md'],
} as unknown as Trial;

/** skill-up 的 result.json：每条用例 × 每个配置（with_skill / without_skill）各一条 */
const RECORD = {
  skill_name: 'ponytail',
  case_results: [
    {
      case_id: 'ask-dedupe',
      configuration: 'with_skill',
      status: 'PASS',
      turns: 1,
      duration_ms: 15706,
      grading: {
        status: 'PASS',
        assertion_results: [
          { text: 'expect.exit_code', passed: true, evidence: 'all checks passed' },
          { text: '产出要能直接用', passed: true, evidence: '目录下只有 dedupe.mjs。' },
        ],
      },
    },
    {
      case_id: 'ask-dedupe',
      configuration: 'without_skill',
      status: 'FAIL',
      turns: 2,
      duration_ms: 18848,
      grading: {
        status: 'FAIL',
        assertion_results: [
          { text: 'expect.exit_code', passed: true, evidence: 'all checks passed' },
          { text: '产出要能直接用', passed: false, evidence: '含未要求的防御代码：缺参数 argv 守卫 + usage 输出。' },
        ],
      },
    },
  ],
};

const fetchMock = vi.fn((url: string) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve(url.includes('result.json') ? RECORD : {}),
    text: () => Promise.resolve('{}'),
  }),
);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 怎么判的：一行一个用例、一行一条判据，只解释没过的 */
describe('证据的「怎么判的」', () => {
  it('用例一行给 A / B 得分，判据一行给 ✅ / ❌', async () => {
    render(<EvidenceVerdict trial={trial} />);

    expect(await screen.findByText('ask-dedupe')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/B 2\/2 ✓/)).toBeTruthy());
    expect(screen.getByText(/A 1\/2 ✗/)).toBeTruthy();

    // 判据行：一列判据名 + 两列记号（A / B 各一）
    const rows = Array.from(document.querySelectorAll('.judge__row')).map((row) => ({
      text: row.querySelector('.judge__row-text')?.textContent,
      marks: Array.from(row.querySelectorAll('.judge__mark')).map((m) => m.textContent),
    }));
    expect(rows).toEqual([
      { text: 'expect.exit_code', marks: ['✅', '✅'] },
      { text: '产出要能直接用', marks: ['❌', '✅'] },
    ]);
  });

  it('只解释没过的判据，并标清是哪一侧没过', async () => {
    render(<EvidenceVerdict trial={trial} />);

    const notes = await screen.findAllByText(/含未要求的防御代码/);
    expect(notes.length).toBe(1);
    expect(screen.getByText('A 没过')).toBeTruthy();
    // 过的那条不用摆理由
    expect(screen.queryByText(/目录下只有 dedupe.mjs/)).toBeNull();
  });

  it('没有判定记录时说清楚，而不是空白', () => {
    render(<EvidenceVerdict trial={{ ...trial, evidence: ['w/x/benchmark.md'] } as unknown as Trial} />);
    expect(screen.getByText(/这次没有判定记录/)).toBeTruthy();
  });
});
