import { Button } from 'antd';
import { runDuration, runKindView, runStateView } from '../shared/findings';
import type { EvalRunInfo } from '../shared/trial-api';

interface Props {
  runs: EvalRunInfo[];
  /** 点「看进度」→ 打开这个运行的进度窗口（日志 + 状态） */
  onOpen: (id: string) => void;
}

/**
 * 「正在评测」：**后台任务列表**。
 *
 * 发起评测提交完弹窗就关了（一次评测十几分钟，不该把人关在只能等的窗口里），这次运行挂在这里：
 * 一行看进度（状态印章 + 已跑多久 + 日志最后一行），点开是完整日志（RunProgress）。
 * 服务端保留最近 2 小时的运行，所以刷新页面也还在。
 */
export function RunningRuns({ runs, onOpen }: Props) {
  if (runs.length === 0) return null;
  const running = runs.filter((r) => r.status === 'running').length;
  return (
    <section className="runs" aria-label="正在评测">
      <div className="runs__head">
        <h2 className="runs__title">
          正在评测
          {running > 0 ? <span className="runs__count">{running} 个在跑</span> : null}
        </h2>
        <p className="runs__hint">后台任务：关掉弹窗、刷新页面都不影响，跑完自动进台账。</p>
      </div>
      <ul className="runs__list">
        {runs.map((run) => {
          const state = runStateView(run);
          const kind = runKindView(run.kind);
          const detail = run.tail || state.detail;
          return (
            <li className="run-row" key={run.id} data-status={run.status}>
              <span className="run-row__name mono" title={run.name}>
                {run.name}
              </span>
              <span className="stamp run-row__stamp" data-tone={state.tone} title={state.detail}>
                {state.stamp}
              </span>
              <span className="run-row__meta" title={`${kind.label}：${kind.detail}`}>
                {kind.label}
                <span className="run-row__tool">
                  {' '}
                  · {run.toolLabel}
                  {run.repeat && run.repeat > 1 ? ` · 重复 ${run.repeat} 次` : ''}
                </span>
              </span>
              <span className="run-row__time mono" title={state.detail}>
                {run.status === 'running' ? `已跑 ${runDuration(run.durationMs)}` : runDuration(run.durationMs)}
              </span>
              <span className="run-row__tail" title={detail}>
                {detail}
              </span>
              <Button size="small" type="link" onClick={() => onOpen(run.id)}>
                看进度
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
