/**
 * 内部运营看板。
 *
 * 这份文件是 ask 用例 `ask-<id>` 的工作区输入（`context.repo_fixture`），
 * 不是仓库自己的产品代码——改它之前先看 `candidates/skills/react-best-practices/evals/cases/` 下的用例。
 *
 * 2026-09-15：已做一轮性能优化，原先故意留的性能问题都已修掉，改动说明见 `docs/notes.md`。
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

export interface Order {
  id: string;
  user: string;
  amount: number;
  status: 'paid' | 'pending' | 'refunded';
  region: string;
}

export interface Metric {
  key: string;
  label: string;
  value: number;
}

export interface User {
  id: string;
  name: string;
  team: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 模拟接口：各自要几百毫秒 */
export async function fetchOrders(): Promise<Order[]> {
  await sleep(600);
  return Array.from({ length: 480 }, (_, i) => ({
    id: `ord-${i}`,
    user: `u-${i % 60}`,
    amount: Math.round((i * 37) % 900) + 20,
    status: (['paid', 'pending', 'refunded'] as const)[i % 3],
    region: ['华东', '华北', '华南', '西南'][i % 4],
  }));
}

export async function fetchMetrics(): Promise<Metric[]> {
  await sleep(650);
  return [
    { key: 'gmv', label: '今日 GMV', value: 128430 },
    { key: 'orders', label: '订单数', value: 1742 },
    { key: 'refund', label: '退款率', value: 0.031 },
  ];
}

export async function fetchUsers(): Promise<User[]> {
  await sleep(550);
  return Array.from({ length: 60 }, (_, i) => ({ id: `u-${i}`, name: `成员 ${i + 1}`, team: ['增长', '交易', '履约'][i % 3] }));
}

/** 提成模块级常量，避免每次渲染都造新对象——行组件 memo 之后，新对象会让 memo 完全失效 */
const ROW_STYLE: CSSProperties = { padding: 8 };
const METRIC_STYLE: CSSProperties = { padding: 12 };

/** 输入防抖，避免每敲一个字就把 480 行重算 + 重渲染一遍 */
function useDebounced<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Order['status']>('all');
  const [width, setWidth] = useState(window.innerWidth);

  // 三份数据并行取，首屏从「三次串行相加」降到「最慢的那一个」
  useEffect(() => {
    let alive = true;
    void Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()]).then(([o, m, u]) => {
      // 请求返回时组件可能已经卸载，避免往已卸载的组件里写 state
      if (!alive) return;
      setOrders(o);
      setMetrics(m);
      setUsers(u);
    });
    return () => {
      alive = false;
    };
  }, []);

  const debouncedQuery = useDebounced(query, 200);

  // 筛选 + 排序改成 useMemo：它是从 orders/query/status 推出来的，不需要再用一份 state + effect 绕一圈，
  // 少一跳渲染，也不会出现 rows 与 orders 短暂不一致的中间态
  const rows = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const byStatus = status === 'all' ? orders : orders.filter((o) => o.status === status);
    const matched = q ? byStatus.filter((o) => o.user.toLowerCase().includes(q)) : byStatus;
    // 必须 slice：status === 'all' 且无关键字时 byStatus 就是 orders 本身，直接 sort 会原地改掉 state
    return matched.slice().sort((a, b) => b.amount - a.amount);
  }, [orders, debouncedQuery, status]);

  // 成员表一次建好，替代原来「每行都 users.find 一遍」的 O(行数 × 成员数)
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // resize 监听放进 effect 并清理：原来每次渲染挂一个、从不移除，重渲染越多次监听器越多
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // 稳定的回调，配合 memo 后的 Row，点任意一行都不会让 480 行全部重渲染
  const handlePick = useCallback((userId: string) => setQuery(userId), []);

  return (
    <div className="dashboard" style={{ width: width - 32 }}>
      <header>
        <h1>运营看板</h1>
        <input
          placeholder="按成员筛选"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as Order['status'])}>
          <option value="all">全部</option>
          <option value="paid">已支付</option>
          <option value="pending">待支付</option>
          <option value="refunded">已退款</option>
        </select>
      </header>

      <section className="metrics">
        {metrics.map((m) => (
          <div className="metric" key={m.key} style={METRIC_STYLE}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
          </div>
        ))}
      </section>

      <p>
        共 {rows.length} 条 / 成员 {users.length} 人
      </p>

      <table>
        <thead>
          <tr>
            <th>订单</th>
            <th>成员</th>
            <th>金额</th>
            <th>状态</th>
            <th>区域</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            // key 用订单 id：原来的 index 在筛选/排序后会错位，React 会误复用节点、多渲染一大批行
            <Row
              key={o.id}
              order={o}
              name={userMap.get(o.user)?.name ?? o.user}
              style={ROW_STYLE}
              onPick={handlePick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  order: Order;
  name: string;
  style: CSSProperties;
  onPick: (userId: string) => void;
}

const Row = memo(function Row({ order, name, style, onPick }: RowProps) {
  return (
    <tr style={style} onClick={() => onPick(order.user)}>
      <td>{order.id}</td>
      <td>{name}</td>
      <td>{order.amount}</td>
      <td>{order.status}</td>
      <td>{order.region}</td>
    </tr>
  );
});
