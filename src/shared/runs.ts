import { useCallback, useEffect, useRef, useState } from 'react';
import { refreshAppData } from './data';
import { evalRuns, type EvalRunInfo } from './trial-api';

/** 有任务在跑时勤问一点（进度要跟手），都跑完了就慢下来（只是为了让"最近跑过"那一行别消失） */
const RUNNING_POLL_MS = 2000;
const IDLE_POLL_MS = 8000;

/**
 * 后台评测的进度。
 *
 * 为什么是**轮询**而不是"发起时把任务交给某个组件盯着"：任务跑在服务端（关弹窗、刷新页面都不影响），
 * 页面只要问一句"现在有哪些在跑"。这样从哪个入口发起的都看得见——弹窗、技能市场的「评测」、
 * 甚至命令行里跑的（同一个 dev server）——列表里都会出现。
 *
 * 另外：任务从"跑着"变成"跑完"的那一刻顺手**重读台账**，新试用记录与新的机器结论才会出现在列表里。
 */
export function useRuns(enabled: boolean): { runs: EvalRunInfo[]; add: (run: EvalRunInfo) => void } {
  const [runs, setRuns] = useState<EvalRunInfo[]>([]);
  const prevRunning = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) {
      setRuns([]);
      return;
    }
    let alive = true;
    let timer: number | undefined;
    const tick = async (): Promise<void> => {
      try {
        const payload = await evalRuns();
        if (!alive) return;
        // 别信形状：服务端回的不是我们预期的那份（代理、报错页、接口改版）就当"没有在跑"，
        // 页面不该因为一个轮询崩掉（jsdom 里用一个通用 fetch 替身时就是这么炸的）
        const next = Array.isArray(payload?.runs) ? payload.runs : [];
        setRuns(next);
        const running = new Set(next.filter((r) => r.status === 'running').map((r) => r.id));
        const finished = [...prevRunning.current].some((id) => !running.has(id));
        prevRunning.current = running;
        if (finished) void refreshAppData();
        timer = window.setTimeout(() => void tick(), running.size > 0 ? RUNNING_POLL_MS : IDLE_POLL_MS);
      } catch {
        // 拿不到就先按"没有在跑"处理，别让页面报错（下一轮还会再问）
        if (alive) timer = window.setTimeout(() => void tick(), IDLE_POLL_MS);
      }
    };
    void tick();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled]);

  /** 刚发起的那条：立刻放进列表，别等下一次轮询（用户点了提交就该马上看到） */
  const add = useCallback((run: EvalRunInfo) => {
    setRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)]);
    if (run.status === 'running') prevRunning.current.add(run.id);
  }, []);

  return { runs, add };
}
