// @vitest-environment jsdom
// 对比板的「对比两版」：点开之后要能看出**代码类产物的改了哪几行**
//（用户的原始诉求："这个库是对 react 写法的优化，预期产物不应该是 react 文件的对比嘛"）。
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Trial } from '../shared/types';

const ARTIFACTS: Record<string, string> = {
  'candidates/x/A.tsx': ['export function Card() {', '  const [rows] = useState(all);', '  return <ul>{rows.map(r => <li>{r}</li>)}</ul>;', '}'].join('\n'),
  'candidates/x/B.tsx': [
    'export function Card() {',
    '  const [rows] = useState(all);',
    '  const visible = useMemo(() => rows.filter(Boolean), [rows]);',
    '  return <ul>{visible.map(r => <li key={r.id}>{r}</li>)}</ul>;',
    '}',
  ].join('\n'),
};

const CONDITIONS = [
  { name: 'A', withCapability: false, artifact: 'candidates/x/A.tsx' },
  { name: 'B', withCapability: true, artifact: 'candidates/x/B.tsx' },
];

const trial = {
  trialId: 't1',
  capability: { id: 'react-best-practices', type: 'skill' },
  conditions: CONDITIONS,
  measures: { correctness: { A: 0, B: 1 }, staticChecks: { A: '用例 0/1 通过', B: '用例 1/1 通过' } },
  judge: ['auto'],
  verdict: { decision: 'ready', confidence: 'medium', reason: 'x' },
  evidence: [],
  task: { id: 'ask-1' },
  model: 'claude_code / deepseek-v4-flash',
  date: '2026-09-15',
  humanReview: null,
} as unknown as Trial;

import { CompareBoard } from './compare-board';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('对比板：对比两版', () => {
  const stubEvidence = (): void => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const key = Object.keys(ARTIFACTS).find((k) => String(url).includes(k));
        return Promise.resolve({ ok: Boolean(key), status: key ? 200 : 404, text: () => Promise.resolve(key ? ARTIFACTS[key] : '') });
      }),
    );
  };

  it('两边都有产物时给一颗「对比两版」，默认不展开', () => {
    render(<CompareBoard trial={trial} />);
    const button = screen.getByRole('button', { name: /对比两版/ });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('两版产物差异')).toBeNull();
  });

  it('展开后读出两版产物，给出变化行数与逐行差异', async () => {
    stubEvidence();
    render(<CompareBoard trial={trial} />);
    fireEvent.click(screen.getByRole('button', { name: /对比两版/ }));

    const diff = await screen.findByLabelText('两版产物差异');
    expect(diff.textContent).toContain('B 比 A 多 1 行');
    expect(diff.textContent).toContain('新增 2 行');
    // 新增的那两行要能被认出来（一行是 useMemo、一行是 key）
    expect(diff.textContent).toContain('useMemo');
    expect(diff.textContent).toContain('key={r.id}');
  });

  it('只有一侧有产物时不出现对比入口', () => {
    const onlyB = { ...trial, conditions: [CONDITIONS[1]] } as unknown as Trial;
    render(<CompareBoard trial={onlyB} />);
    expect(screen.queryByRole('button', { name: /对比两版/ })).toBeNull();
  });

  it('产物读不到时给一句人话，不是白屏', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') })));
    render(<CompareBoard trial={trial} />);
    fireEvent.click(screen.getByRole('button', { name: /对比两版/ }));
    expect(await screen.findByText(/两版对比没能算出来/)).toBeTruthy();
  });
});
