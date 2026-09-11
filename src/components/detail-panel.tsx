import { Drawer, Empty } from 'antd';
import { useMemo, useState } from 'react';
import type { Capability, PendingTag, Taxonomy } from '../shared/types';
import {
  capabilityConclusion,
  capabilityDecisionView,
  capabilityReasonTitle,
  humanDecisionView,
  humanSummary,
} from '../shared/findings';
import { flattenTags } from '../shared/tags';
import { useMediaQuery } from '../shared/viewport';
import { refreshAppData } from '../shared/data';
import { CapabilityReview } from './capability-review';
import { InstallLine } from './install-line';
import { TrialDetail } from './trial-detail';
import { TrialList } from './trial-list';
import { VerdictStamp } from './verdict-stamp';

interface Props {
  capability: Capability | null;
  taxonomy: Taxonomy;
  pending: PendingTag[];
  onClose: () => void;
  /** dev 里才有写接口：有它才在试用详情里显示人评入口 */
  canReview?: boolean;
}

/**
 * 一级抽屉（能力记录），五个模块：
 * 结论 → 采纳/放弃原因 → 如何使用 → 试用记录（卡片）→ 来源与标签。
 * 每条试用只占一张卡片，点「看详情」开二级抽屉看那一次的细节。
 */
export function DetailPanel({ capability, taxonomy, pending, onClose, canReview = false }: Props) {
  const narrow = useMediaQuery('(max-width: 820px)');
  const [openTrialId, setOpenTrialId] = useState<string | null>(null);
  // 最近一次在前面；用 useMemo 稳住引用，打开详情时不必把试用表整张重算（见 trial-list.tsx）
  const trials = useMemo(() => (capability ? [...capability.trials].reverse() : []), [capability]);
  if (!capability) return null;

  const decision = capabilityDecisionView(capability);
  const tags = flattenTags(capability.tags, taxonomy, pending, capability.id);
  const pendingHere = pending.filter((p) => p.capability === capability.id);
  const openTrial = trials.find((t) => t.trialId === openTrialId) ?? null;

  return (
    <>
      <Drawer
        open
        placement="right"
        size={narrow ? '100%' : 620}
        onClose={onClose}
        destroyOnHidden
        className="record-drawer"
        title={<span className="record__id mono">{capability.id}</span>}
      >
        <article className="record">
          <section className="sheet sheet--verdict" data-tone={decision.tone}>
            <h3 className="sheet__title">结论</h3>
            <div className="verdict">
              <VerdictStamp decision={decision} size="large" />
            </div>
          </section>

          <section className="sheet" data-tone={decision.tone}>
            <h3 className="sheet__title">{capabilityReasonTitle(capability)}</h3>
            <p className="verdict__summary">{capabilityConclusion(capability)}</p>
          </section>

          <section className="sheet">
            <h3 className="sheet__title">我的结论</h3>
            {canReview ? (
              <CapabilityReview capability={capability} onDone={() => void refreshAppData()} />
            ) : (
              <>
                <p className="myverdict__summary">{humanSummary(capability).line}</p>
                <p className="myverdict__machine">{humanDecisionView(capability).machineHint}</p>
                <p className="sheet__note">写结论的入口只在 `npm run dev` 下出现（静态构建是只读的）。</p>
              </>
            )}
          </section>

          <section className="sheet">
            <h3 className="sheet__title">如何使用</h3>
            {capability.howToUse ? (
              <InstallLine command={capability.howToUse} />
            ) : (
              <p className="sheet__note">还没记录用法（装法或调用方式）。</p>
            )}
          </section>

          <section className="sheet">
            <h3 className="sheet__title">试用记录（{capability.trials.length} 次）</h3>
            {trials.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没跑过试用：先固定一个任务，做一次 A/B 对照" />
            ) : (
              <TrialList trials={trials} onOpen={setOpenTrialId} />
            )}
          </section>

          <section className="sheet">
            <h3 className="sheet__title">来源与标签</h3>
            <dl className="kv">
              <div className="kv__row">
                <dt>来源</dt>
                <dd>
                  <span className="mono">{capability.source?.repo ?? '没有记录'}</span>
                  {capability.source?.license ? ` · ${capability.source.license}` : ''}
                </dd>
              </div>
              <div className="kv__row">
                <dt>说明来源</dt>
                <dd className={capability.descriptionSource ? undefined : 'sheet__note'}>
                  {capability.descriptionSource ?? '还没标注：第三方能力要写「上游哪个字段的直译」，自研能力写「本仓库自研规格」'}
                </dd>
              </div>
              <div className="kv__row">
                <dt>标签</dt>
                <dd>
                  <span className="chips">
                    {tags.length === 0 ? <span className="sheet__note">还没打标签</span> : null}
                    {tags.map((t) => (
                      <span key={`${t.dimension}:${t.value}`} className={`chip${t.pending ? ' chip--pending' : ''}`}>
                        <span className="chip__dim">{taxonomy.dimensions[t.dimension]?.label ?? t.dimension}</span>
                        <span className="chip__val">
                          {t.label.replace(/（待确认）$/, '')}
                          {t.pending ? <span className="chip__flag">待确认</span> : null}
                        </span>
                      </span>
                    ))}
                  </span>
                </dd>
              </div>
            </dl>

            {pendingHere.length > 0 ? (
              <div className="notice notice--inline" role="status">
                <span className="notice__mark" aria-hidden="true">
                  !
                </span>
                <div>
                  <p className="notice__title">有标签取值还没登记</p>
                  <p className="notice__body">
                    {pendingHere.map((p) => `${taxonomy.dimensions[p.dimension]?.label ?? p.dimension}＝${p.value}`).join('、')}
                    。确认后写回 <span className="mono">evals/tags.json</span>，它才变成正式标签。
                  </p>
                </div>
              </div>
            ) : null}
          </section>

          <p className="record__foot">
            本地位置 <span className="mono">{capability.localPath ?? '—'}</span>
          </p>
        </article>
      </Drawer>

      <TrialDetail trial={openTrial} taxonomy={taxonomy} onClose={() => setOpenTrialId(null)} canReview={canReview} />
    </>
  );
}
