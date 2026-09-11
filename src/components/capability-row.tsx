import type { Capability, PendingTag, Taxonomy } from '../shared/types';
import { abView, capabilityDecisionView, capabilityDescription, trialDate } from '../shared/findings';
import { AbBeam } from './ab-beam';
import { InstallLine } from './install-line';
import { TagPills } from './tag-pills';
import { VerdictStamp } from './verdict-stamp';

interface Props {
  capability: Capability;
  taxonomy: Taxonomy;
  pending: PendingTag[];
  onOpen: (id: string) => void;
}

/**
 * 台账的一行：一个能力一条记录。
 * 结论印章 → 名称 + 一句话结论 + 标签 → 右侧这次怎么试的、试过几次、安装命令、看记录。
 * 状态词不重复写（印章已表达），人评不重复写（对照条下面那行已表达）。
 */
export function CapabilityRow({ capability, taxonomy, pending, onOpen }: Props) {
  const decision = capabilityDecisionView(capability);
  const trial = capability.latestTrial;
  const count = capability.trials.length;

  return (
    <li className="row" data-tone={decision.tone}>
      <div className="row__rail">
        <VerdictStamp decision={decision} />
      </div>

      <div className="row__main">
        <h3 className="row__name">
          <span className="row__id">{capability.id}</span>
        </h3>
        <p className="row__conclusion">{capabilityDescription(capability)}</p>
        <TagPills capabilityId={capability.id} tags={capability.tags} taxonomy={taxonomy} pending={pending} max={4} />
      </div>

      <div className="row__side">
        <AbBeam view={abView(trial)} />
        <p className="row__meta">
          {count > 0 ? `试过 ${count} 次 · 最近 ${trialDate(trial)}` : '还没试过'}
        </p>
        {capability.howToUse ? <InstallLine command={capability.howToUse} /> : null}
        <button type="button" className="row__open" onClick={() => onOpen(capability.id)}>
          看完整记录
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </li>
  );
}
