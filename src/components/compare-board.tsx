import { Button } from 'antd';
import { compareDigest, sideResults, type SideResult } from '../shared/findings';
import type { Trial } from '../shared/types';

interface Props {
  trial: Trial;
}

/**
 * 试用详情的主角：**前后对照**。
 * 两栏并排——A（不加载能力）与 B（加载了能力）各自：做到没有、产物能不能打开、两三个关键数字；
 * 下面一句"到底差在哪"，只陈述事实（A → B 变多变少多少），不替人下结论。
 * 其余内容（任务说明、评判方、模型、证据链）都往后放，属于"想看细节再看"。
 */
export function CompareBoard({ trial }: Props) {
  const sides = sideResults(trial);
  const digest = compareDigest(trial);
  if (sides.length === 0) return null;

  const toneOf = (side: SideResult): string => (side.done === null ? 'none' : side.done ? 'up' : 'down');
  // 条件名已经在卡片左上角写着了，含义里不必再重复一次"A："
  const meaningOf = (side: SideResult): string => side.meaning.replace(new RegExp(`^${side.name}[：:]\\s*`), '');

  return (
    <div className="board">
      <div className="board__grid" data-sides={sides.length}>
        {sides.map((side) => (
          <div key={side.name} className="board__side" data-tone={toneOf(side)} data-picked={side.picked ? 'true' : 'false'}>
            <p className="board__head">
              <span className="board__name">{side.name}</span>
              <span className="board__meaning">{meaningOf(side)}</span>
              {side.picked ? <span className="board__pick">人评选了这版</span> : null}
            </p>
            <p className="board__outcome">
              <span className="board__mark" aria-hidden="true">
                {side.done === null ? '—' : side.done ? '✓' : '✗'}
              </span>
              {side.doneLabel}
            </p>
            {side.highlights.length > 0 ? (
              <dl className="board__facts">
                {side.highlights.map((h) => (
                  <div key={h.label}>
                    <dt>{h.label.replace(/（.*?）/, '')}</dt>
                    <dd className="mono">{h.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {side.artifact ? (
              <p className="board__artifact">
                <Button size="small" href={side.artifact.url} target="_blank" rel="noreferrer">
                  打开产物
                </Button>
                <span className="mono board__file">{side.artifact.name}</span>
              </p>
            ) : (
              <p className="board__artifact board__artifact--none">没有可打开的产物</p>
            )}
          </div>
        ))}
      </div>
      {digest ? <p className="board__digest">{digest}</p> : null}
    </div>
  );
}
