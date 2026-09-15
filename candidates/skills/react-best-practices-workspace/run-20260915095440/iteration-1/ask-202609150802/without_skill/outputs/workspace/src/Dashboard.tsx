/**
 * 内部运营看板。
 *
 * 这份文件是 ask 用例 `ask-<id>` 的工作区输入（`context.repo_fixture`），
 * 不是仓库自己的产品代码——改它之前先看 `candidates/skills/react-best-practices/evals/cases/` 下的用例。
 *
 * 2026-09-15 做过一轮性能优化，每处改动对应解决哪个问题见 docs/notes.md。
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

/** 内联样式提到模块级：每次渲染新建对象会让下面的 memo 比较永远失败 */
const ROW_STYLE: CSSProperties = { padding: 8 };
const METRIC_STYLE: CSSProperties = { padding: 12 };

export function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Order['status']>('all');
  const [width, setWidth] = useState(() => window.innerWidth);

  // 三份数据互不依赖，并行取；原来串行要 600 + 650 + 550ms
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [o, m, u] = await Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()]);
      if (cancelled) return;
      setOrders(o);
      setMetrics(m);
      setUsers(u);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // 筛选和排序从 state + effect 改成派生值：少一次「用旧数据渲染 → effect → 再渲染」
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => (status === 'all' || o.status === status) && (!q || o.user.toLowerCase().includes(q)))
      .sort((a, b) => b.amount - a.amount);
  }, [orders, query, status]);

  // 成员 id -> 名字，避免在 480 行里对 60 个成员各做一次线性查找（每次渲染约 2.9 万次比较）
  const nameById = useMemo(
    () => new Map<string, string>(users.map((u) => [u.id, u.name] as const)),
    [users],
  );

  // resize 监听挂一次就够；原先是每次渲染都挂一个、且从不卸载
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 稳定的回调，配合 Row 的 memo：切筛选时没变的行不再重渲染
  const handlePick = useCallback((user: string) => setQuery(user), []);

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
            <Row
              key={o.id}
              order={o}
              name={nameById.get(o.user) ?? o.user}
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
  onPick: (user: string) => void;
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
