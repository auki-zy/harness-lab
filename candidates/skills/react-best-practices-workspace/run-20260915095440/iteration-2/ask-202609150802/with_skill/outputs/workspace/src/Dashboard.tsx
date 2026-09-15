/**
 * 内部运营看板（评测用例的输入文件，故意留着几处性能问题给人优化）。
 *
 * 这份文件是 ask 用例 `ask-<id>` 的工作区输入（`context.repo_fixture`），
 * 不是仓库自己的产品代码——改它之前先看 `candidates/skills/react-best-practices/evals/cases/` 下的用例。
 */
import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
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

/** 常量提到模块级别：每次渲染都新建对象会让下面 memo 的 Row 全部失效 */
const ROW_STYLE: CSSProperties = { padding: 8 };
const METRIC_STYLE: CSSProperties = { padding: 12 };

/** 静态 JSX 提到模块级别，避免每次渲染重新创建元素树 */
const TABLE_HEAD = (
  <thead>
    <tr>
      <th>订单</th>
      <th>成员</th>
      <th>金额</th>
      <th>状态</th>
      <th>区域</th>
    </tr>
  </thead>
);

export function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Order['status']>('all');
  // 惰性初始化：写成 useState(window.innerWidth) 的话，这个表达式每次渲染都会被求值一次
  const [width, setWidth] = useState(() => window.innerWidth);

  // 三份数据互不依赖，并发取：首屏从 ~1.8s（600+650+550）降到 ~650ms
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

  // 监听只在挂载时注册一次，卸载时解绑
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 输入框是紧急更新，列表重排可以晚一帧，打字不再被 480 行拖住
  const deferredQuery = useDeferredValue(query);

  // 筛选 + 排序是 orders/query/status 的纯派生值：渲染时直接算，不再多存一份 state、
  // 也不再多跑一轮 render。toSorted 不改动 orders 本身。
  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return orders
      .filter((o) => (status === 'all' ? true : o.status === status))
      .filter((o) => (q ? o.user.toLowerCase().includes(q) : true))
      .toSorted((a, b) => b.amount - a.amount);
  }, [orders, deferredQuery, status]);

  // id -> 成员 的索引表，取代每行一次的 O(users) 线性查找（480 行 × 60 人）
  const userById = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

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
        {TABLE_HEAD}
        <tbody>
          {rows.map((o) => (
            <Row
              key={o.id}
              order={o}
              name={userById.get(o.user)?.name ?? o.user}
              onPick={setQuery}
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
  /** setState 本身是稳定引用，直接传进来，父组件就不用为每行现造一个闭包 */
  onPick: (userId: string) => void;
}

const Row = memo(function Row({ order, name, onPick }: RowProps) {
  return (
    <tr style={ROW_STYLE} onClick={() => onPick(order.user)}>
      <td>{order.id}</td>
      <td>{name}</td>
      <td>{order.amount}</td>
      <td>{order.status}</td>
      <td>{order.region}</td>
    </tr>
  );
});
