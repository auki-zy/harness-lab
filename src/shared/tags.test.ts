import { describe, expect, it } from 'vitest';
import type { Capability, PendingTag, Taxonomy } from './types';
import { DIMENSION_ORDER, flattenTags, matchesQuery, matchesTagFilters, tagFacets } from './tags';
import { getAppData } from './data';

const appData = getAppData();

const taxonomy: Taxonomy = {
  version: 1,
  dimensions: {
    type: { label: '类型', values: { skill: '技能', agent: '子代理' } },
    purpose: { label: '用途', values: { 'ui-design': '界面设计', testing: '测试' } },
    stage: { label: '阶段', values: { trialing: '试用中' } },
  },
};

const cap: Capability = {
  id: 'frontend-design',
  type: 'skill',
  status: 'trialing',
  description: '做界面时的视觉方向与排版主张。',
  summary: '值得用：界面更像有意设计。',
  source: { repo: 'anthropics/skills', license: 'Apache-2.0' },
  localPath: 'candidates/skills/frontend-design',
  tags: { type: 'skill', purpose: ['ui-design'], stage: 'trialing' },
  trials: [
    {
      trialId: 't1',
      capability: { id: 'frontend-design' },
      task: { id: 'page-card', description: '同一个成员卡片页任务，跑两遍' },
      verdict: { decision: 'hold', reason: '受控对比通过，但还没在真实项目用过' },
    },
  ],
  latestTrial: null,
};

describe('标签与检索', () => {
  it('flattenTags 输出维度/取值/人话标签，未登记取值标记 pending', () => {
    const pending: PendingTag[] = [{ capability: 'frontend-design', dimension: 'purpose', value: 'mystery' }];
    const flat = flattenTags({ type: 'skill', purpose: ['ui-design', 'mystery'] }, taxonomy, pending, 'frontend-design');
    expect(flat.find((t) => t.value === 'ui-design')?.label).toBe('界面设计');
    expect(flat.find((t) => t.value === 'mystery')?.pending).toBe(true);
    expect(flat.find((t) => t.value === 'mystery')?.label).toContain('待确认');
  });

  it('tagFacets 统计每个取值命中多少能力，并把未登记取值分开放', () => {
    const pending: PendingTag[] = [{ capability: 'frontend-design', dimension: 'purpose', value: 'mystery' }];
    const other: Capability = { ...cap, id: 'x', tags: { purpose: ['mystery'] } };
    const facets = tagFacets([cap, other], taxonomy, pending);
    expect(facets.values.purpose['ui-design']).toBe(1);
    expect(facets.values.purpose.testing).toBe(0);
    expect(facets.values.type.skill).toBe(1);
    expect(facets.pendingValues.purpose.mystery).toBe(1);
  });

  it('matchesQuery 只匹配名称与说明（来源/标签/试用内容不参与）', () => {
    expect(matchesQuery(cap, 'frontend')).toBe(true);
    expect(matchesQuery(cap, '界面')).toBe(true); // 命中说明
    expect(matchesQuery(cap, '排版主张')).toBe(true);
    expect(matchesQuery(cap, 'anthropics')).toBe(false); // 来源不进搜索
    expect(matchesQuery(cap, '界面设计')).toBe(false); // 标签靠筛选，不进搜索
    expect(matchesQuery(cap, '成员卡片页')).toBe(false); // 试用内容不进搜索
    expect(matchesQuery(cap, 'zzz')).toBe(false);
    expect(matchesQuery(cap, '')).toBe(true);
  });

  it('matchesTagFilters 同维度 OR、跨维度 AND', () => {
    expect(matchesTagFilters(cap, taxonomy, [], { purpose: ['ui-design'] })).toBe(true);
    expect(matchesTagFilters(cap, taxonomy, [], { purpose: ['testing'] })).toBe(false);
    expect(matchesTagFilters(cap, taxonomy, [], { purpose: ['ui-design'], type: ['skill'] })).toBe(true);
    expect(matchesTagFilters(cap, taxonomy, [], { purpose: ['ui-design'], type: ['agent'] })).toBe(false);
    expect(matchesTagFilters(cap, taxonomy, [], { purpose: ['testing', 'ui-design'] })).toBe(true);
  });

  it('页面维度与 evals/tags.json 保持一致（删掉的维度不该再出现）', () => {
    expect(Object.keys(appData.taxonomy.dimensions).sort()).toEqual([...DIMENSION_ORDER].sort());
    for (const capability of appData.capabilities) {
      for (const dimension of Object.keys(capability.tags ?? {})) {
        expect(DIMENSION_ORDER).toContain(dimension);
      }
    }
  });
});
