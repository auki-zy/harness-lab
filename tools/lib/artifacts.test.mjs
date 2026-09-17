// 产物核验的回归测试。守的是那次真实判断：A 侧"一个字没改"这件事，
// 应该是机器算出来的事实（与输入逐字节相同），而不是靠人肉 diff 出来的观感。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { changedLineCount, compareWithInput, describeComparison, expectFilesFromPrompt, mentionedPaths } from './artifacts.mjs';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'artifacts-'));

describe('mentionedPaths', () => {
  it('认出提示词里点名的文件路径', () => {
    const p = 'src/Dashboard.tsx 打开要好几秒，切筛选也卡，帮我优化一下。改完直接写回这个文件，改动说明放 docs/notes.md。';
    expect(mentionedPaths(p)).toEqual(['src/Dashboard.tsx', 'docs/notes.md']);
  });

  it('带反引号 / 括号 / 结句标点也能认', () => {
    expect(mentionedPaths('请改 `src/a.ts`（还有 src/b.vue）。')).toEqual(['src/a.ts', 'src/b.vue']);
  });

  it('不把普通词当路径（认后缀 + 要求带目录或像文件名）', () => {
    expect(mentionedPaths('这个 README 写得不错，帮我看看 useMemo 的用法')).toEqual([]);
  });

  it('去重、保序', () => {
    expect(mentionedPaths('改 src/x.ts，再说一次 src/x.ts')).toEqual(['src/x.ts']);
  });
});

describe('expectFilesFromPrompt', () => {
  it('只认工作区输入里真实存在的那些（提示词提到但没给的文件不算门槛）', () => {
    const dir = tmp();
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(path.join(dir, 'src', 'Dashboard.tsx'), 'export const Dashboard = () => null;\n', 'utf8');
    const prompt = 'src/Dashboard.tsx 打开要好几秒；顺手看看 src/Missing.tsx 和 docs/notes.md。';
    expect(expectFilesFromPrompt(prompt, dir)).toEqual(['src/Dashboard.tsx']);
  });

  it('没给工作区输入就返回空（别凭空造门槛）', () => {
    expect(expectFilesFromPrompt('改 src/a.ts', null)).toEqual([]);
  });
});

describe('changedLineCount', () => {
  it('一字未动 → 0', () => {
    expect(changedLineCount('a\nb\nc', 'a\nb\nc')).toBe(0);
  });

  it('换一行 → 2（删 1 加 1）', () => {
    expect(changedLineCount('a\nb\nc', 'a\nx\nc')).toBe(2);
  });

  it('末尾换行 / CRLF 不算改动', () => {
    expect(changedLineCount('a\nb\n', 'a\r\nb')).toBe(0);
  });

  it('整段新增 → 新增行数', () => {
    expect(changedLineCount('a', 'a\nb\nc')).toBe(2);
  });
});

describe('compareWithInput', () => {
  it('与输入逐字节相同 → same（这就是"A 侧一个字没改"的机械证据）', () => {
    const dir = tmp();
    const input = path.join(dir, 'in.tsx');
    const artifact = path.join(dir, 'out.tsx');
    writeFileSync(input, 'const a = 1;\n', 'utf8');
    writeFileSync(artifact, 'const a = 1;\n', 'utf8');
    const cmp = compareWithInput(input, artifact);
    expect(cmp).toMatchObject({ same: true, changedLines: 0, deltaBytes: 0 });
    expect(describeComparison('src/a.tsx', cmp)).toBe('src/a.tsx 与输入一致（未改动）');
  });

  it('改过 → 给出字节差与改动处数', () => {
    const dir = tmp();
    const input = path.join(dir, 'in.tsx');
    const artifact = path.join(dir, 'out.tsx');
    writeFileSync(input, 'a\nb\n', 'utf8');
    writeFileSync(artifact, 'a\nB\nc\n', 'utf8');
    const cmp = compareWithInput(input, artifact);
    expect(cmp.same).toBe(false);
    expect(cmp.deltaBytes).toBe(2);
    expect(cmp.changedLines).toBe(3);
    expect(describeComparison('src/a.tsx', cmp)).toContain('比输入 +2 B，改了 3 处');
  });

  it('文件缺失就返回 null（没得比就别硬写结论）', () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'in.tsx'), 'x', 'utf8');
    expect(compareWithInput(path.join(dir, 'in.tsx'), path.join(dir, 'nope.tsx'))).toBeNull();
  });
});
