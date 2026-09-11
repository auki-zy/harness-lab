import type { PendingTag, Taxonomy } from '../shared/types';
import { DIMENSION_ORDER, type TagFacets } from '../shared/tags';
import { isEntryOpen } from '../shared/entries';

interface Props {
  taxonomy: Taxonomy;
  pending: PendingTag[];
  facets: TagFacets;
  selected: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
}

interface FacetValue {
  value: string;
  label: string;
  count: number;
  pending: boolean;
}

interface RowProps {
  label: string;
  values: FacetValue[];
  active: string[];
  onToggle: (value: string) => void;
}

function FacetRow({ label, values, active, onToggle }: RowProps) {
  return (
    <div className="facet">
      <span className="facet__label">{label}</span>
      <div className="facet__values">
        {values.map((v) => {
          const on = active.includes(v.value);
          const empty = v.count === 0 && !v.pending;
          return (
            <button
              key={v.value}
              type="button"
              className={`facet__chip${on ? ' facet__chip--on' : ''}${v.pending ? ' facet__chip--pending' : ''}${
                empty ? ' facet__chip--empty' : ''
              }`}
              aria-pressed={on}
              disabled={empty && !on}
              onClick={() => onToggle(v.value)}
            >
              {v.label}
              <span className="facet__count">{v.count}</span>
              {v.pending ? <span className="facet__flag">待确认</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 标签筛选：一个维度一行，行内可多选（任一命中即可），跨维度要同时满足。
 * 只列标签表（evals/tags.json）里登记过的取值；没登记的取值另标「待确认」，等你确认后再写回标签表。
 */
export function TagFilter({ taxonomy, pending, facets, selected, onChange }: Props) {
  const dims = DIMENSION_ORDER.filter((d) => taxonomy.dimensions[d]);

  return (
    <div className="facets">
      {dims.map((dim) => {
        const def = taxonomy.dimensions[dim];
        // 入口开关：类型维度只列已开放的类型（MCP / 子代理先注释，见 src/shared/entries.ts）
        const registered: FacetValue[] = Object.entries(def.values)
          .filter(([value]) => dim !== 'type' || isEntryOpen(value))
          .map(([value, label]) => ({
            value,
            label,
            count: facets.values[dim]?.[value] ?? 0,
            pending: false,
          }));
        const seen = new Set<string>();
        const unregistered: FacetValue[] = [];
        for (const p of pending) {
          if (p.dimension !== dim || seen.has(p.value)) continue;
          seen.add(p.value);
          unregistered.push({
            value: p.value,
            label: p.value,
            count: facets.pendingValues[dim]?.[p.value] ?? 0,
            pending: true,
          });
        }
        const active = selected[dim] ?? [];
        const toggle = (value: string) => {
          const next = active.includes(value) ? active.filter((v) => v !== value) : [...active, value];
          onChange({ ...selected, [dim]: next });
        };
        return <FacetRow key={dim} label={def.label} values={[...registered, ...unregistered]} active={active} onToggle={toggle} />;
      })}
    </div>
  );
}
