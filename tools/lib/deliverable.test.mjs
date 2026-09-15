// 交付物形态的回归测试。守的是这次踩的两个坑：
//   1) React 写法类技能被降级成 Node 小程序（形态里没有"组件源码"这一档）
//   2) 模型选的后缀不被认识时被**静默**改写成 impl.mjs（用户就是这么发现产物不对的）
import { describe, expect, it } from 'vitest';
import { cleanDeliverablePath, deliverableKind, normalizeDeliverable } from './deliverable.mjs';

describe('deliverableKind', () => {
  it('认得出四档', () => {
    expect(deliverableKind('index.html')).toBe('page');
    expect(deliverableKind('src/Dashboard.tsx')).toBe('component');
    expect(deliverableKind('Widget.jsx')).toBe('component');
    expect(deliverableKind('App.vue')).toBe('component');
    expect(deliverableKind('Chart.svelte')).toBe('component');
    expect(deliverableKind('impl.mjs')).toBe('program');
    expect(deliverableKind('scripts/x.js')).toBe('program');
    expect(deliverableKind('report.md')).toBe('doc');
    expect(deliverableKind('data.json')).toBe('doc');
  });

  it('认不出就是 null（交给调用方兜底，不在这里猜）', () => {
    expect(deliverableKind('main.py')).toBeNull();
    expect(deliverableKind('')).toBeNull();
    expect(deliverableKind(undefined)).toBeNull();
  });
});

describe('normalizeDeliverable', () => {
  it('组件文件原样保留（以前会被静默改成 impl.mjs）', () => {
    expect(normalizeDeliverable('src/Dashboard.tsx')).toEqual({
      name: 'src/Dashboard.tsx',
      kind: 'component',
      rewritten: false,
      from: '',
    });
  });

  it('认不出的后缀兜底成小程序，但要标记"改写过了"并说明原来是什么', () => {
    const out = normalizeDeliverable('perfkit.rb');
    expect(out).toMatchObject({ name: 'impl.mjs', kind: 'program', rewritten: true, from: 'perfkit.rb' });
  });

  it('空值也走兜底', () => {
    expect(normalizeDeliverable('')).toMatchObject({ name: 'impl.mjs', rewritten: true });
  });
});

describe('cleanDeliverablePath', () => {
  it('允许子路径（组件产物天然带目录）', () => {
    expect(cleanDeliverablePath('src/components/Card.tsx')).toBe('src/components/Card.tsx');
  });

  it('不许绝对路径与 ..（这些会进判分脚本）', () => {
    expect(cleanDeliverablePath('/etc/passwd')).toBe('etc/passwd');
    expect(cleanDeliverablePath('../../secrets.md')).toBe('secrets.md');
    expect(cleanDeliverablePath('src/../x.tsx')).toBe('src/x.tsx');
    // Windows 盘符也去掉，剩下的当相对路径用
    expect(cleanDeliverablePath('C:\\tmp\\a.tsx')).toBe('tmp/a.tsx');
  });
});
