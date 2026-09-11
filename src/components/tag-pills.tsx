import { Tooltip } from 'antd';
import type { CapabilityTags, PendingTag, Taxonomy } from '../shared/types';
import { flattenTags } from '../shared/tags';

interface Props {
  capabilityId: string;
  tags: CapabilityTags | null | undefined;
  taxonomy: Taxonomy;
  pending: PendingTag[];
  /** 台账行只显示前几个，详情页全显示 */
  max?: number;
}

/**
 * 能力标签：`维度 | 取值` 两段式——维度名在浅底小格里（等宽小字），取值单独一段，
 * 让"是什么维度"和"值是什么"一眼分得开；未登记取值标成「待确认」。
 */
export function TagPills({ capabilityId, tags, taxonomy, pending, max }: Props) {
  const flat = flattenTags(tags, taxonomy, pending, capabilityId);
  const shown = typeof max === 'number' ? flat.slice(0, max) : flat;
  const rest = flat.length - shown.length;

  return (
    <span className="chips">
      {shown.map((t) => (
        <Tooltip key={`${t.dimension}:${t.value}`} title={`${taxonomy.dimensions[t.dimension]?.label ?? t.dimension}：${t.value}`}>
          <span className={`chip${t.pending ? ' chip--pending' : ''}`}>
            <span className="chip__dim">{taxonomy.dimensions[t.dimension]?.label ?? t.dimension}</span>
            <span className="chip__val">
              {t.label.replace(/（待确认）$/, '')}
              {t.pending ? <span className="chip__flag">待确认</span> : null}
            </span>
          </span>
        </Tooltip>
      ))}
      {rest > 0 ? <span className="chip chip--more">还有 {rest} 个</span> : null}
    </span>
  );
}
