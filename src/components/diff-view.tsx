import { Alert } from 'antd';
import { useEffect, useState } from 'react';
import { describeDiff, diffLines, type DiffResult } from '../shared/diff';

interface Props {
  /** A 侧（不加载能力）的产物 */
  left: { url: string; name: string };
  /** B 侧（加载能力）的产物 */
  right: { url: string; name: string };
}

/** 一次最多画多少行（超长文件只给结论 + 两个打开入口，别把抽屉拖死） */
const MAX_RENDERED_ROWS = 400;

/**
 * 两版产物的**并排 diff**：左 A、右 B，新增绿、删除红，行号各归各侧。
 *
 * 为什么需要它：对照板本来只能各自「打开产物」——代码 / 组件类技能（React 那种）最该看的
 * 恰恰是"改了哪几行"，并排开两个标签页人肉比对不是办法。数据就是两侧的产物文件（走证据接口）。
 */
export function DiffView({ left, right }: Props) {
  const [texts, setTexts] = useState<{ left: string; right: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setTexts(null);
    setError(null);
    Promise.all([
      fetch(left.url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`读不到 ${left.name}（HTTP ${r.status}）`)))),
      fetch(right.url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`读不到 ${right.name}（HTTP ${r.status}）`)))),
    ])
      .then(([a, b]) => {
        if (alive) setTexts({ left: a, right: b });
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [left.url, left.name, right.url, right.name]);

  if (error) return <Alert type="warning" showIcon title={`两版对比没能算出来：${error}`} />;
  if (!texts) return <p className="diff__note">正在读两版产物…</p>;

  const diff: DiffResult = diffLines(texts.left, texts.right);
  const rows = diff.rows.slice(0, MAX_RENDERED_ROWS);

  return (
    <div className="diff" aria-label="两版产物差异">
      <p className="diff__sum">
        <span className="mono">{left.name}</span> → <span className="mono">{right.name}</span>：{describeDiff(diff)}
      </p>
      {diff.tooLarge ? (
        <p className="diff__note">文件太长，没算逐行差异——用上面两个「打开产物」并排看。</p>
      ) : (
        <>
          <div className="diff__body">
            {rows.map((row, i) => (
              <div className="diff__row" key={i} data-kind={row.type}>
                <span className="diff__no mono">{row.leftNo ?? ''}</span>
                <span className="diff__cell">{row.type === 'add' ? '' : row.text}</span>
                <span className="diff__no mono">{row.rightNo ?? ''}</span>
                <span className="diff__cell">{row.type === 'del' ? '' : row.text}</span>
              </div>
            ))}
          </div>
          {diff.rows.length > MAX_RENDERED_ROWS ? (
            <p className="diff__note">只画了前 {MAX_RENDERED_ROWS} 行（一共 {diff.rows.length} 行）——完整内容点上面的「打开产物」。</p>
          ) : null}
        </>
      )}
    </div>
  );
}
