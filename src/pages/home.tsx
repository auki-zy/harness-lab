import { Button, Empty, Input } from 'antd';
import { useMemo, useState } from 'react';
import type { Capability, PendingTag, Taxonomy } from '../shared/types';
import { matchesQuery, matchesTagFilters, tagFacets } from '../shared/tags';
import { CapabilityRow, RunEval, TagFilter } from '../components';
import { isEntryOpen } from '../shared/entries';

interface Props {
  capabilities: Capability[];
  taxonomy: Taxonomy;
  pendingTags: PendingTag[];
  onOpen: (id: string) => void;
  /** 写接口（发起评测 / 提交人评）是否可用：静态构建里没有，按钮就不显示 */
  canWrite?: boolean;
}

/** 首页：台账 —— 搜索 + 标签筛选 + 一行一个能力的记录列表 */
export function HomePage({ capabilities, taxonomy, pendingTags, onOpen, canWrite = false }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [trialOpen, setTrialOpen] = useState(false);

  // 入口开关：类型筛选只列已开放的类型（MCP / 子代理先注释，见 src/shared/entries.ts）
  const facets = useMemo(() => {
    const all = tagFacets(capabilities, taxonomy, pendingTags);
    const typeValues = all.values.type ?? {};
    return {
      ...all,
      values: { ...all.values, type: Object.fromEntries(Object.entries(typeValues).filter(([value]) => isEntryOpen(value))) },
    };
  }, [capabilities, taxonomy, pendingTags]);
  const filtered = useMemo(
    () => capabilities.filter((c) => matchesQuery(c, query) && matchesTagFilters(c, taxonomy, pendingTags, selected)),
    [capabilities, taxonomy, pendingTags, query, selected],
  );

  const activeCount = Object.values(selected).reduce((n, v) => n + v.length, 0);
  const adopted = capabilities.filter((c) => c.status === 'adopted').length;
  const trialing = capabilities.filter((c) => c.status === 'trialing').length;

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <p className="eyebrow">harness-lab</p>
          <h1 className="masthead__h1">能力台账</h1>
          <p className="masthead__lede">
            记录候选能力评测结论、怎么试的、证据在哪。
          </p>
        </div>
        <div className="masthead__side">
          <dl className="facts" aria-label="收录概况">
            {[
              { key: 'all', label: '收录', value: capabilities.length, hint: '本仓库登记的能力总数' },
              { key: 'adopted', label: '已采纳', value: adopted, hint: '真实项目用过且达标，可以装进项目' },
              { key: 'trialing', label: '试用中', value: trialing, hint: '正在收集证据，结论还没定' },
            ].map((f) => (
              <div
                key={f.key}
                className={`facts__item facts__item--${f.key}${f.value === 0 ? ' facts__item--zero' : ''}`}
                title={f.hint}
              >
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
          <a className="masthead__link" href="./evidence/evals/schema.md" target="_blank" rel="noreferrer">
            评测规范
          </a>
          {canWrite ? (
            <Button size="small" onClick={() => setTrialOpen(true)}>
              发起评测
            </Button>
          ) : null}
        </div>
      </header>

      {pendingTags.length > 0 ? (
        <div className="notice" role="status">
          <span className="notice__mark" aria-hidden="true">
            !
          </span>
          <div>
            <p className="notice__title">有 {pendingTags.length} 个标签取值还没登记</p>
            <p className="notice__body">
              新出现的取值先标成「待确认」，确认后写回 <span className="mono">evals/tags.json</span> 才成为正式标签。
            </p>
          </div>
        </div>
      ) : null}

      <section className="controls" aria-label="搜索与筛选">
        <div className="controls__search">
          <Input
            allowClear
            size="large"
            placeholder="搜索：能力名称或说明"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索能力"
          />
          <p className="controls__count">
            <span className="mono">{filtered.length}</span> / {capabilities.length} 个能力
            {activeCount > 0 ? <span className="controls__count-filter"> · 已选 {activeCount} 个标签</span> : null}
          </p>
        </div>

        <TagFilter taxonomy={taxonomy} pending={pendingTags} facets={facets} selected={selected} onChange={setSelected} />

        <div className="controls__foot">
          <p className="controls__hint">同一行里多选＝任一命中；不同行之间要同时满足。</p>
          <Button type="link" size="small" disabled={activeCount === 0} onClick={() => setSelected({})}>
            清空筛选{activeCount > 0 ? `（${activeCount}）` : ''}
          </Button>
        </div>
      </section>

      {filtered.length === 0 ? (
        <Empty
          className="ledger__empty"
          description={
            <span>
              没有匹配的能力。
              <br />
              换个关键词，或者清空标签筛选再看看。
            </span>
          }
        >
          <Button
            onClick={() => {
              setQuery('');
              setSelected({});
            }}
          >
            清空搜索和筛选
          </Button>
        </Empty>
      ) : (
        <ul className="ledger">
          {filtered.map((c) => (
            <CapabilityRow key={c.id} capability={c} taxonomy={taxonomy} pending={pendingTags} onOpen={onOpen} />
          ))}
        </ul>
      )}

      <RunEval open={trialOpen} onClose={() => setTrialOpen(false)} />
    </div>
  );
}
