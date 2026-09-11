import type { DecisionView } from '../shared/findings';

interface Props {
  decision: DecisionView;
  /** 大号用于详情页结论区 */
  size?: 'inline' | 'large';
}

/** 结论印章：把「采纳 / 挂起 / 放弃 / 重试 / 未评估」盖成方章，颜色只用来强化，文案本身可读 */
export function VerdictStamp({ decision, size = 'inline' }: Props) {
  return (
    <span
      // data-tone 必须挂在印章自己身上：颜色来自 `[data-tone]` 上的 --tone 变量，
      // 靠祖先元素继承的话，放在别的位置（比如试用记录表格里）就会掉成灰色——踩过。
      data-tone={decision.tone}
      className={`stamp stamp--${decision.tone}${size === 'large' ? ' stamp--large' : ''}`}
      title={`${decision.headline}：${decision.detail}`}
    >
      {decision.stamp}
    </span>
  );
}
