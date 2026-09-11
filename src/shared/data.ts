import { useSyncExternalStore } from 'react';
import bundled from '../../evals/results/app-data.json';
import type { AppData } from './types';

/**
 * 应用数据（由 `tools/aggregate.mjs` 生成：`evals/results/app-data.json`）。
 *
 * 这里是一个**极小的订阅式 store**，而不是一个常量：dev 里写完数据（提交人评 / 给能力下结论 / 跑完评测）
 * 只需要**就地重读聚合产物**，页面自己重渲染——抽屉、滚动位置、当前看的那条试用都留着。
 * 以前写完调 `window.location.reload()`，整页重载会把用户正在看的抽屉全关掉（用户反馈）。
 */
let current = bundled as unknown as AppData;
const listeners = new Set<() => void>();

export const getAppData = (): AppData => current;

export function subscribeAppData(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 重新拉一次聚合产物（dev 的 `GET /api/eval/data`），成功后通知订阅者。
 * 静态构建里没有写接口、也没有这个端点——那些入口本来就不显示。
 */
export async function refreshAppData(): Promise<AppData> {
  const res = await fetch('/api/eval/data', { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`刷新台账失败（HTTP ${res.status}）`);
  current = (await res.json()) as AppData;
  for (const listener of listeners) listener();
  return current;
}

/** 组件里读数据：写完刷新时自动重渲染 */
export function useAppData(): AppData {
  return useSyncExternalStore(subscribeAppData, getAppData, getAppData);
}
