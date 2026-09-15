import { Button, Modal, Space } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { runDuration, runStateView } from '../shared/findings';
import { evalRunState, type EvalRunInfo } from '../shared/trial-api';

interface Props {
  /** 要看的运行 id；null = 关着 */
  runId: string | null;
  /** 列表里那一行（先拿它画第一帧：能力名 + 已经跑了多久），之后以服务端每次的回报为准 */
  run?: EvalRunInfo | null;
  onClose: () => void;
}

/**
 * 一次后台评测的**进度窗口**：状态 + 完整日志，跑着的时候每 1.2 秒自己刷新。
 *
 * 为什么要单独一个窗口：发起评测是后台任务，用户会去干别的；回来时最想知道的就两件事——
 * 跑完没有、跑到哪一步了。日志由服务端从 `.trial-runs/<id>.log` 里读（见 `/api/eval/run?id=`）。
 *
 * **"已跑多久"一律用服务端给的值**（`run.startedAt` / `run.durationMs`），不在本地拿
 * "窗口什么时候打开的"当起点 —— 踩过：打开弹窗才开始计时，看着像刚跑了 3 秒，其实已经跑了 6 分钟。
 * 服务端每次回报都重算（跑着的 = 到现在），所以这个数字跟着刷新自己会走。
 */
export function RunProgress({ runId, run = null, onClose }: Props) {
  const [log, setLog] = useState('');
  const [current, setCurrent] = useState<EvalRunInfo | null>(run);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);
  // 列表那一行的最新快照：只用来画第一帧。走 ref 是因为**不能**把它写进下面那个 effect 的依赖 ——
  // 列表每 2 秒刷新一次会换掉对象，依赖它就会把进度轮询反复重置。
  const seed = useRef<EvalRunInfo | null>(run);
  useEffect(() => {
    seed.current = run;
  }, [run]);

  useEffect(() => {
    if (!runId) return;
    let alive = true;
    let timer: number | undefined;
    setError(null);
    setLog('');
    setCurrent(seed.current);
    const tick = async (): Promise<void> => {
      try {
        const state = await evalRunState(runId);
        if (!alive) return;
        setLog(state.log);
        if (state.run) setCurrent(state.run);
        if (state.status === 'running') timer = window.setTimeout(() => void tick(), 1200);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    void tick();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [runId]);

  // 新日志进来就贴到底部（跑评测时人最关心"最后一行"）
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const state = runStateView(current ?? { status: 'running' });
  const elapsed = current && current.status === 'running' ? `已跑 ${runDuration(current.durationMs)}` : current ? `用时 ${runDuration(current.durationMs)}` : '';

  return (
    <Modal
      open={runId !== null}
      onCancel={onClose}
      width={760}
      title={current?.name ? `评测进度 · ${current.name}` : '评测进度'}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
        </Space>
      }
    >
      <p className="run-progress__state">
        <span className="stamp" data-tone={state.tone}>
          {state.stamp}
        </span>
        <span className="run-progress__detail">{error ?? state.detail}</span>
        {elapsed ? <span className="run-progress__time mono">{elapsed}</span> : null}
      </p>
      <pre className="trial-log" aria-label="评测运行日志" ref={logRef}>
        {log || '（还没写日志，等一下…）'}
      </pre>
    </Modal>
  );
}
