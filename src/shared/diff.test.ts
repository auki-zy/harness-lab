import { describe, expect, it } from 'vitest';
import { describeDiff, diffLines } from './diff';

describe('diffLines', () => {
  it('完全相同 → 全 same、identical', () => {
    const d = diffLines('a\nb\n', 'a\nb');
    expect(d.identical).toBe(true);
    expect(d.rows.every((r) => r.type === 'same')).toBe(true);
    expect(describeDiff(d)).toBe('两版内容完全一致');
  });

  it('改一行 → 一行删除 + 一行新增，行号各归各侧', () => {
    const d = diffLines('a\nb\nc', 'a\nB\nc');
    expect(d.rows.map((r) => r.type)).toEqual(['same', 'del', 'add', 'same']);
    const del = d.rows[1];
    expect(del).toMatchObject({ text: 'b', leftNo: 2, rightNo: null });
    expect(d.rows[2]).toMatchObject({ text: 'B', leftNo: null, rightNo: 2 });
    expect(describeDiff(d)).toBe('行数相同：新增 1 行 / 删除 1 行');
  });

  it('纯新增 → 只出 add 行，并说清多了几行', () => {
    const d = diffLines('a', 'a\nb\nc');
    expect(d.added).toBe(2);
    expect(d.removed).toBe(0);
    expect(describeDiff(d)).toBe('B 比 A 多 2 行：新增 2 行 / 删除 0 行');
  });

  it('空文件 ↔ 有内容', () => {
    expect(diffLines('', 'x\ny').added).toBe(2);
    expect(diffLines('x\ny', '').removed).toBe(2);
  });

  it('CRLF 与末尾换行不算差异（不然 code review 全是噪声）', () => {
    expect(diffLines('a\r\nb\r\n', 'a\nb').identical).toBe(true);
  });

  it('行数超上限就不硬算（页面改说"太长"）', () => {
    const big = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const d = diffLines(big, `${big}\nextra`, 10);
    expect(d.tooLarge).toBe(true);
    expect(d.rows).toEqual([]);
    expect(describeDiff(d)).toContain('文件太长');
  });

  it('React 那种"加了几个 hook"的场景能定位到具体行', () => {
    const before = ['export function Dashboard() {', '  const [rows, setRows] = useState([]);', '  return <Table rows={rows} />;', '}'].join('\n');
    const after = [
      'export function Dashboard() {',
      '  const [rows, setRows] = useState([]);',
      '  const visible = useMemo(() => rows.filter(Boolean), [rows]);',
      '  return <Table rows={visible} />;',
      '}',
    ].join('\n');
    const d = diffLines(before, after);
    expect(d.added).toBeGreaterThan(0);
    expect(d.rows.some((r) => r.type === 'add' && r.text.includes('useMemo'))).toBe(true);
  });
});
