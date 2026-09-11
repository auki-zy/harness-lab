// 技能内容解析的回归测试。守的是这两件事：
//   1. frontmatter 的 description 也算内容（以前只量正文，把"靠 description 说话"的技能判成空壳）
//   2. "转发壳"技能（grill-me → grilling）能被解析：被引用的技能拉下来、挂进 eval 配置的 skills 列表
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { materializeRefs, parseSkill, referencedSkills, skillMaterial, thinReason, withRefSkills } from './skill-content.mjs';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'skill-content-'));
const shell = (extra = '') =>
  `---\nname: grill-me\ndescription: A relentless interview to sharpen a plan or design.\ndisable-model-invocation: true\n---\n\nCall the Skill tool with "grilling".\n${extra}`;
const GRILLING = `---\nname: grilling\ndescription: Grill the user relentlessly about a plan.\n---\n\n${'Interview the user relentlessly and work the design tree in rounds. '.repeat(20)}`;

describe('parseSkill', () => {
  it('读出 frontmatter 的 name / description，正文单独给', () => {
    const s = parseSkill('\uFEFF---\r\nname: grill-me\r\ndescription: "带引号的说明"\r\n---\r\n\r\n正文第一行\r\n');
    expect(s.name).toBe('grill-me');
    expect(s.description).toBe('带引号的说明');
    expect(s.body).toBe('正文第一行');
  });

  it('没有 frontmatter 时整篇都是正文', () => {
    const s = parseSkill('# 标题\n\n做法一二三');
    expect(s.description).toBe('');
    expect(s.body).toBe('# 标题\n\n做法一二三');
  });
});

describe('referencedSkills', () => {
  it('认出 Skill tool 转发（grill-me 的真实写法）', () => {
    const own = parseSkill(shell());
    expect(referencedSkills(own)).toEqual(['grilling']);
  });

  it('认中文写法，且不把技能自己算成引用', () => {
    expect(referencedSkills({ name: 'foo', body: '先按 design-review 技能过一遍' })).toEqual(['design-review']);
    expect(referencedSkills({ name: 'grilling', body: 'Call the Skill tool with "grilling".' })).toEqual([]);
  });

  it('普通行文里出现 skill 不算转发（别把真技能误判成壳）', () => {
    const body = '# 这个技能教你怎么写 UI\n\n先看现有的设计系统，再决定排版。'.repeat(5);
    expect(referencedSkills({ name: 'ui', body })).toEqual([]);
  });
});

describe('skillMaterial / thinReason', () => {
  it('壳 + 已拉下来的被引用技能 = 有素材（不再判"评不了"）', () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'SKILL.md'), shell(), 'utf8');
    mkdirSync(path.join(dir, 'refs', 'grilling'), { recursive: true });
    writeFileSync(path.join(dir, 'refs', 'grilling', 'SKILL.md'), GRILLING, 'utf8');
    const mat = skillMaterial(dir);
    expect(mat.refs).toEqual([{ name: 'grilling', dir: 'refs/grilling', text: GRILLING.trim(), resolved: true }]);
    expect(mat.text).toContain('被引用的技能 grilling');
    expect(mat.chars).toBeGreaterThan(600);
    expect(thinReason(dir)).toBeNull();
  });

  it('壳但引用没拉下来：说清楚是"缺了被引用的技能"', () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'SKILL.md'), shell(), 'utf8');
    const reason = thinReason(dir);
    expect(reason).toContain('grilling');
    expect(reason).toContain('refs');
  });

  it('description 算内容：光有 description 的真技能不再被判成空', () => {
    const dir = tmp();
    const long = 'Use when the user wants to stress-test a plan. '.repeat(20);
    writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: x\ndescription: ${long}\n---\n\n短正文`, 'utf8');
    expect(thinReason(dir)).toBeNull();
  });

  // 起草模型会把 description 里的 "Use when the user wants to X" 当成用户的任务
  //（实测：grilling 的 "Grill the user relentlessly…" 被写成"把含糊处全给我逼出来"）。
  // 分节标题就是警告，它被删掉这个回归就会重现——所以把它钉在测试里。
  it('素材的每一节都写明"这是做法，不许写进提示词"', () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'SKILL.md'), shell(), 'utf8');
    mkdirSync(path.join(dir, 'refs', 'grilling'), { recursive: true });
    writeFileSync(path.join(dir, 'refs', 'grilling', 'SKILL.md'), GRILLING, 'utf8');
    const text = skillMaterial(dir).text;
    expect(text).toContain('触发说明');
    expect(text).toContain('不许');
    expect(text).toContain('技能的做法');
    expect(text).toContain('被引用的技能 grilling');
  });
});

describe('materializeRefs', () => {
  const source = { repo: 'mattpocock/skills', path: 'skills/productivity/grill-me/SKILL.md', commit: 'abc123' };

  it('回上游同一提交、同一目录把被引用的技能拉下来，并记出处', async () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'SKILL.md'), shell(), 'utf8');
    const asked = [];
    const fetchText = async (url) => {
      asked.push(url);
      return url.endsWith('/skills/productivity/grilling/SKILL.md') ? GRILLING : '';
    };
    const out = await materializeRefs({ dir, source, fetchText });
    expect(asked[0]).toBe('https://raw.githubusercontent.com/mattpocock/skills/abc123/skills/productivity/grilling/SKILL.md');
    expect(out.resolved.map((r) => r.name)).toEqual(['grilling']);
    expect(readFileSync(path.join(dir, 'refs', 'grilling', 'SKILL.md'), 'utf8')).toBe(GRILLING);
    expect(JSON.parse(readFileSync(path.join(dir, 'refs', 'SOURCES.json'), 'utf8')).grilling.commit).toBe('abc123');
    expect(thinReason(dir)).toBeNull();
  });

  it('本地候选里有同名技能就不走网络', async () => {
    const dir = tmp();
    const candidatesRoot = tmp();
    writeFileSync(path.join(dir, 'SKILL.md'), shell(), 'utf8');
    mkdirSync(path.join(candidatesRoot, 'grilling'), { recursive: true });
    writeFileSync(path.join(candidatesRoot, 'grilling', 'SKILL.md'), GRILLING, 'utf8');
    const out = await materializeRefs({ dir, source, candidatesRoot, fetchText: async () => '' });
    expect(out.resolved[0].origin).toContain('本地候选');
  });

  it('拉不到就报出来（不静默），已有副本不重复下载', async () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'SKILL.md'), shell(), 'utf8');
    const missing = await materializeRefs({ dir, source, fetchText: async () => '' });
    expect(missing.unresolved).toEqual(['grilling']);
    mkdirSync(path.join(dir, 'refs', 'grilling'), { recursive: true });
    writeFileSync(path.join(dir, 'refs', 'grilling', 'SKILL.md'), GRILLING, 'utf8');
    let called = 0;
    const again = await materializeRefs({ dir, source, fetchText: async () => (called++, '') });
    expect(called).toBe(0);
    expect(again.resolved[0].origin).toBe('already');
  });
});

describe('withRefSkills', () => {
  const YAML = [
    'schema_version: v1alpha1',
    '',
    'skills:',
    '  - source: local_path',
    '    path: .',
    '',
    'engine:',
    '  name: claude_code',
    '',
  ].join('\n');

  it('把 refs 挂进 skills 列表，空行结构不被打乱', () => {
    const out = withRefSkills(YAML, ['grilling']);
    expect(out).toBe(
      [
        'schema_version: v1alpha1',
        '',
        'skills:',
        '  - source: local_path',
        '    path: .',
        '  - source: local_path',
        '    path: refs/grilling',
        '',
        'engine:',
        '  name: claude_code',
        '',
      ].join('\n'),
    );
  });

  it('幂等：重复挂不会写两遍', () => {
    const once = withRefSkills(YAML, ['grilling']);
    expect(withRefSkills(once, ['grilling'])).toBe(once);
  });

  it('目录名里的危险字符会被清掉（拼路径用）', () => {
    expect(withRefSkills(YAML, ['../evil'])).toContain('path: refs/evil');
  });
});
