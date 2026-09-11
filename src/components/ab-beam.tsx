import type { AbView } from '../shared/findings';

interface Props {
  view: AbView;
  /** compact：台账行里的窄条；full：试用详情里的大条 */
  variant?: 'compact' | 'full';
}

/** 小对勾：人评选中的那半只用一个图标标记，不再写"人评更好"这类重复文字 */
function WinMark() {
  return (
    <svg className="beam__win" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
      <path d="M2 6.4 4.6 9 10 3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A/B 对照条——这个实验室的核心仪器，只说一件事：人评选了哪一半。
 * 左半 A、右半 B（短标签"不加载 / 加载"），选中的那半点亮并打勾；
 * 没有结论时（没人评 / 人评没选 / 没有对照），杆子保持灰色并如实显示状态——不再配说明句。
 */
export function AbBeam({ view, variant = 'compact' }: Props) {
  const { winner, hasTrial, hasControl, hasReview, winnerText } = view;
  const win = (which: 'A' | 'B') => (winner === which ? ' beam__seg--win' : '');
  const title = hasControl
    ? `A＝不加载这个能力；B＝加载了这个能力；${winnerText}`
    : winnerText;

  if (!hasTrial) {
    return (
      <div className={`beam beam--${variant} beam--empty`}>
        <div className="beam__track beam__track--empty">还没跑过对照</div>
      </div>
    );
  }

  if (!hasControl) {
    return (
      <div className={`beam beam--${variant}${hasReview ? '' : ' beam--noreview'}`}>
        <div className="beam__track beam__track--single" role="img" aria-label={winnerText} title={title}>
          <span className="beam__seg beam__seg--only">{winnerText}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`beam beam--${variant}${hasReview ? '' : ' beam--noreview'}${winner ? '' : ' beam--nopick'}`}>
      <div className="beam__track" role="img" aria-label={`对照结果：${winnerText}`} title={title}>
        <span className={`beam__seg beam__seg--a${win('A')}`}>
          <span className="beam__seg-key">A</span>
          <span className="beam__seg-text">不加载</span>
          {winner === 'A' ? <WinMark /> : null}
        </span>
        <span className="beam__hinge" aria-hidden="true" />
        <span className={`beam__seg beam__seg--b${win('B')}`}>
          <span className="beam__seg-key">B</span>
          <span className="beam__seg-text">加载</span>
          {winner === 'B' ? <WinMark /> : null}
        </span>
      </div>
    </div>
  );
}
