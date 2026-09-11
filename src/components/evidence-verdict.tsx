import { Skeleton } from 'antd';
import { useEffect, useState } from 'react';
import { failingNotes, parseRecord, recordPath, verdictRows, type CaseRun } from '../shared/evidence';
import { evidenceUrl } from '../shared/findings';
import type { Trial } from '../shared/types';

interface Props {
  trial: Trial;
}

/**
 * 「怎么判的」：**一行一个用例，一行一条判据**。
 *
 * 上一版把判定依据塞在表格单元格里的 `<details>` 里，长文本一展开表格就散架——用户反馈"不可读、样式太乱"。
 * 现在的读法是：顶部一行给每条用例的 A / B 得分 → 下面一张窄表只放 ✅/❌ → **没过的判据单独在下面解释**。
 * 要解释的只有没过的那些，全过的不用摆理由。
 */
export function EvidenceVerdict({ trial }: Props) {
  const record = recordPath(trial);
  const [runs, setRuns] = useState<CaseRun[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!record) return;
    let stale = false;
    setRuns(null);
    setFailed(false);
    fetch(evidenceUrl(record))
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json) => !stale && setRuns(parseRecord(json, trial)))
      .catch(() => !stale && setFailed(true));
    return () => {
      stale = true;
    };
  }, [record, trial]);

  if (!record) {
    return <p className="sheet__note">这次没有判定记录（工具每次跑都会写 result.json）——下面「原始记录」里有能看的东西。</p>;
  }
  if (failed) return <p className="sheet__note">判定记录读不出来——「原始记录」里可以直接打开它。</p>;
  if (runs === null) return <Skeleton active paragraph={{ rows: 3 }} title={false} />;
  if (runs.length === 0) {
    return <p className="sheet__note">判定记录里没有能识别的用例结果——「原始记录」里可以直接打开它。</p>;
  }

  const sides = (trial.conditions ?? []).map((c) => c.name);

  return (
    <div className="judge">
      {runs.map((run) => {
        const notes = failingNotes([run], sides);
        const rows = verdictRows([run], sides);
        return (
          <section className="judge__case" key={run.caseId}>
            <p className="judge__head">
              <span className="judge__case mono">{run.caseId}</span>
              {sides.map((side) => {
                const r = run.sides[side];
                const ok = r?.passed;
                return (
                  <span className="judge__score" key={side} data-ok={r ? String(ok) : 'none'}>
                    {side} {r ? `${r.passedCount}/${r.assertions.length}` : '—'} {r ? (ok ? '✓' : '✗') : ''}
                  </span>
                );
              })}
            </p>

            <ul className="judge__rows">
              {rows.map((row) => (
                <li className="judge__row" key={row.text}>
                  <span className="judge__row-text">{shorten(row.text)}</span>
                  {sides.map((side) => {
                    const cell = row.sides[side];
                    return (
                      <span className="judge__mark" key={side} data-ok={cell ? String(cell.passed) : 'none'}>
                        {cell ? (cell.passed ? '✅' : '❌') : '—'}
                      </span>
                    );
                  })}
                </li>
              ))}
            </ul>

            {notes.length > 0 ? (
              <ul className="judge__notes">
                {notes.map((n) => (
                  <li key={`${n.side}-${n.text}`}>
                    <span className="judge__note-side">{n.side} 没过</span>
                    {n.evidence}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="judge__pass">这条用例两边都过，没有要解释的。</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** 判据很长（模型自己写的一整句），列表里只留前半句，完整原文在 title 里 */
function shorten(text: string): string {
  return text.length > 46 ? `${text.slice(0, 46)}…` : text;
}
