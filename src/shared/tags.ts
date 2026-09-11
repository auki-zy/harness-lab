import type { Capability, CapabilityTags, PendingTag, Taxonomy } from './types';

/** 标签维度的展示顺序（首页筛选用）；维度与取值登记在 evals/tags.json */
export const DIMENSION_ORDER = ['type', 'purpose', 'stage', 'source'] as const;

/** 结论语气的统一色板（对应 styles/tokens.css 里的 --tone-* 映射） */
export type Tone = 'adopt' | 'ready' | 'hold' | 'reject' | 'retry' | 'none';

export interface FlatTag {
  dimension: string;
  value: string;
  label: string;
  pending: boolean;
}

/** 把一个能力的标签拍平成 [{dimension,value,label}]，未登记取值标记 pending */
export function flattenTags(
  tags: CapabilityTags | null | undefined,
  taxonomy: Taxonomy,
  pending: PendingTag[],
  capabilityId: string,
): FlatTag[] {
  const out: FlatTag[] = [];
  if (!tags) return out;
  for (const dimension of DIMENSION_ORDER) {
    const raw = tags[dimension];
    if (raw == null) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    const dict = taxonomy.dimensions[dimension]?.values ?? {};
    for (const value of values) {
      const isPending = pending.some((p) => p.capability === capabilityId && p.dimension === dimension && p.value === value);
      out.push({ dimension, value, label: dict[value] ?? `${value}（待确认）`, pending: isPending || !dict[value] });
    }
  }
  return out;
}

/** 每个维度每个取值分别命中多少个能力（筛选项上显示的数字） */
export interface TagFacets {
  /** values[维度][取值] = 命中的能力数（取值来自标签表） */
  values: Record<string, Record<string, number>>;
  /** pendingValues[维度][原始取值] = 命中的能力数（取值还没登记，需要确认） */
  pendingValues: Record<string, Record<string, number>>;
}

export function tagFacets(capabilities: Capability[], taxonomy: Taxonomy, pending: PendingTag[]): TagFacets {
  const values: Record<string, Record<string, number>> = {};
  const pendingValues: Record<string, Record<string, number>> = {};
  for (const dimension of DIMENSION_ORDER) {
    const dict = taxonomy.dimensions[dimension]?.values ?? {};
    values[dimension] = Object.fromEntries(Object.keys(dict).map((value) => [value, 0]));
    pendingValues[dimension] = {};
  }
  for (const cap of capabilities) {
    const seen = new Set<string>();
    for (const tag of flattenTags(cap.tags, taxonomy, pending, cap.id)) {
      const key = `${tag.dimension}:${tag.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (tag.pending) {
        const bucket = (pendingValues[tag.dimension] ??= {});
        bucket[tag.value] = (bucket[tag.value] ?? 0) + 1;
      } else if (values[tag.dimension]) {
        values[tag.dimension][tag.value] = (values[tag.dimension][tag.value] ?? 0) + 1;
      }
    }
  }
  return { values, pendingValues };
}

/** 关键词搜索：只匹配**名称**与**一句话说明**（按来源、标签找用筛选，不占搜索框） */
export function matchesQuery(cap: Capability, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${cap.id} ${cap.description ?? ''}`.toLowerCase().includes(q);
}

/** 标签筛选：同维度内 OR，跨维度 AND */
export function matchesTagFilters(
  cap: Capability,
  taxonomy: Taxonomy,
  pending: PendingTag[],
  selected: Record<string, string[]>,
): boolean {
  const active = Object.entries(selected).filter(([, v]) => v.length > 0);
  if (active.length === 0) return true;
  const tags = flattenTags(cap.tags, taxonomy, pending, cap.id);
  return active.every(([dimension, values]) => tags.some((t) => t.dimension === dimension && values.includes(t.value)));
}
