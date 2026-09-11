import { Drawer, Tooltip } from 'antd';
import type { Taxonomy, Trial } from '../shared/types';
import {
  conditionLabel,
  decisionView,
  evidenceGroups,
  evidenceList,
  evidenceProofNote,
  hasEvidenceChain,
  humanReviewView,
  judgeText,
  measureColumns,
  measureNotes,
  measureRows,
  measureRules,
  noEvidenceNote,
  systemSummary,
  trialKindView,
  trialTask,
  trialTitle,
} from '../shared/findings';
import { useMediaQuery } from '../shared/viewport';
import { refreshAppData } from '../shared/data';
import { CompareBoard } from './compare-board';
import { EvidenceViewer } from './evidence-viewer';
import { ReviewForm } from './review-form';
import { VerdictStamp } from './verdict-stamp';

const CONFIDENCE: Record<string, string> = {
  high: '高：证据够，不用再犹豫',
  medium: '中：有证据，但还没在真实项目里长期用过',
  low: '低：证据偏少，结论可能还会变',
};

interface Props {
  trial: Trial | null;
  taxonomy: Taxonomy;
  onClose: () => void;
  /** dev 里才有写接口：有它才显示人评入口（👍/👎 + 可选理由 + 二次确认） */
  canReview?: boolean;
}

/** 二级抽屉：单次试用的详情（条件、人评、指标、判定依据、证据） */
export function TrialDetail({ trial, taxonomy, onClose, canReview = false }: Props) {
  const narrow = useMediaQuery('(max-width: 820px)');
  if (!trial) return null;

  const decision = decisionView(trial.verdict?.decision);
  const review = humanReviewView(trial);
  const rows = measureRows(trial);
  const columns = measureColumns(trial);
  const notes = measureNotes(trial);
  const summary = systemSummary(trial);
  const kind = trialKindView(trial);
  const evidence = evidenceList(trial);
  const groups = evidenceGroups(trial);
  const showEvidence = hasEvidenceChain(trial);

  return (
    <Drawer
      open
      placement="right"
      size={narrow ? '100%' : 620}
      onClose={onClose}
      destroyOnHidden
      className="record-drawer trial-detail"
      title={<span className="record__id mono">{trialTitle(trial)}</span>}
    >
      <article className="record">
        {/* ① 主角：这次试用的结论 + 前后对照（谁做到了、产物在哪、差在哪） */}
        <section className="sheet sheet--verdict" data-tone={decision.tone}>
          <div className="trial__head">
            <VerdictStamp decision={decision} />
            <span className="trial__kind" title={kind.detail}>
              {kind.label}
            </span>
          </div>
          <p className="trial__line">
            {decision.headline}——{decision.detail}
          </p>
          <CompareBoard trial={trial} />
        </section>

        {/* ② 全量指标：上面是重点，这里是明细 */}
        <section className="sheet">
          <h3 className="sheet__title">
            客观指标（全部维度）
            <Tooltip
              title={
                <div className="rules">
                  <p className="rules__lead">每一行只说事实（谁比谁多多少）；怎么读这些维度看这里：</p>
                  {measureRules().map((group) => (
                    <p className="rules__row" key={group.group}>
                      <span className="rules__group">{group.group}</span>
                      {group.items.join(' ')}
                    </p>
                  ))}
                </div>
              }
              placement="right"
            >
              <span className="hint" role="img" aria-label="每个维度怎么读">
                ?
              </span>
            </Tooltip>
          </h3>
          {rows.length === 0 ? (
            <p className="sheet__note">这次没记客观指标，结论主要靠人评。</p>
          ) : (
            <div className="tablewrap">
              <table className="measure">
                <thead>
                  <tr>
                    <th scope="col">看什么</th>
                    {columns.map((c) => (
                      <th key={c} scope="col">
                        {conditionLabel(trial, c)}
                      </th>
                    ))}
                    <th scope="col">差别</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label}>
                      <th scope="row">{r.label}</th>
                      {columns.map((c) => (
                        <td key={c} className="mono">
                          {r.values[c] ?? '—'}
                        </td>
                      ))}
                      <td>{r.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {notes ? <p className="sheet__note">{notes}</p> : null}
        </section>

        {/* 系统小结：A/B 各自好在哪 + 一句推荐（规则写在 findings.ts，页面照原样写明依据） */}
        {summary.available && summary.recommendation ? (
          <section className="sheet">
            <h3 className="sheet__title">系统小结：哪一版更好</h3>
            <div className="summary__grid">
              {summary.sides.map((s) => (
                <div key={s.name} className="summary__side" data-win={summary.recommendedSide === s.name ? 'true' : 'false'}>
                  <p className="summary__head">
                    <span className="mono">{s.name}</span> · {s.meaning.replace(new RegExp(`^${s.name}[：:]\\s*`), '')}
                  </p>
                  <ul className="summary__list">
                    {s.pros.length === 0 && s.cons.length === 0 ? <li data-none="true">没有可比的证据</li> : null}
                    {s.pros.map((p) => (
                      <li key={p}>好：{p}</li>
                    ))}
                    {s.cons.map((c) => (
                      <li key={c}>差：{c}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="summary__verdict" data-side={summary.recommendedSide ?? 'none'}>
              {summary.recommendation}
            </p>
            <p className="summary__rule">{summary.rationale}</p>
          </section>
        ) : null}

        <section className="sheet">
          <h3 className="sheet__title">评审人怎么说</h3>
          <div className={`review review--${review.verdictTone}`}>
            <p className="review__verdict">{review.verdictLabel}</p>
            <p className="review__better">{review.betterText}</p>
            {review.reason ? <p className="review__reason">理由：{review.reason}</p> : null}
            <p className="review__mode">
              {review.modeText}
              {review.reviewedAt ? ` · 记录于 ${review.reviewedAt.slice(0, 10)}` : ''}
            </p>
            {review.scores.length > 0 ? (
              <ul className="scores">
                {review.scores.map((s) => (
                  <li key={s.name}>
                    {taxonomy.dimensions[s.name]?.label ?? s.name}
                    <span className="mono">{s.value}/5</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {canReview ? (
            <ReviewForm trial={trial} onDone={() => void refreshAppData()} />
          ) : (
            <p className="sheet__note">人评入口只在 `npm run dev` 下出现（静态构建是只读的）。</p>
          )}
        </section>

        {/* ⑤ 背景信息：想知道"这次到底怎么跑的"再看 */}
        <section className="sheet">
          <h3 className="sheet__title">这次是怎么跑的</h3>
          {trial.task?.description ? <p className="trial__note">{trial.task.description}</p> : null}
          {trial.selfCheck ? (
            <p className="trial__note" role="note">
              离线自检：这一次用 stub 引擎 / 仓库内夹具跑出来，只证明评测链路通，不证明能力有效，不计入采纳计数。
            </p>
          ) : null}
          <p className="trial__meta">
            {kind.detail} · {judgeText(trial)}
            {trial.model ? ` · ${trial.model}` : ''}
          </p>
        </section>

        <section className="sheet">
          <h3 className="sheet__title">为什么这么判</h3>
          <p className="judgement">
            {trial.verdict?.reason ?? '没有写结论依据。'}
            {trial.verdict?.confidence ? (
              <span className="judgement__confidence">
                置信度：{CONFIDENCE[trial.verdict.confidence] ?? trial.verdict.confidence}
              </span>
            ) : null}
          </p>
        </section>

        {showEvidence ? (
          <section className="sheet">
            <h3 className="sheet__title">对比证据链（{evidence.length}）</h3>
            <p className="sheet__note">{evidenceProofNote(trial)}</p>
            <EvidenceViewer trial={trial} groups={groups} />
          </section>
        ) : (
          <section className="sheet">
            <p className="sheet__note">{noEvidenceNote(trial)}</p>
          </section>
        )}

        <p className="record__foot">
          任务 <span className="mono">{trialTask(trial)}</span>
        </p>
      </article>
    </Drawer>
  );
}
