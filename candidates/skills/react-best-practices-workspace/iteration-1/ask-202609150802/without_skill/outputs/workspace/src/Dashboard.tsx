/**
 * 内部运营看板（评测用例的输入文件，故意留着几处性能问题给人优化）。
 *
 * 这份文件是 ask 用例 `ask-<id>` 的工作区输入（`context.repo_fixture`），
 * 不是仓库自己的产品代码——改它之前先看 `candidates/skills/react-best-practices/evals/cases/` 下的用例。
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

/** 提到模块级：Row 每次渲染都新建 style 对象会让 React.memo 的浅比较永远失败 */
const ROW_STYLE: CSSProperties = { padding: 8 };

interface RowProps {
  order: Order;
  name: string;
  onPick: (userId: string) => void;
}

// 定义在 Dashboard 之前：memo() 返回的是 const，没有函数声明那样的提升
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

export function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Order['status']>('all');
  const [width, setWidth] = useState(window.innerWidth);

  // 三份数据并发取，而不是一个接一个地等
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

  // 筛选 + 排序改成渲染期派生：不再经过 state，省掉一次多余渲染，也不会先闪一帧旧数据
  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return orders
      .filter((o) => (status === 'all' ? true : o.status === status))
      .filter((o) => (q ? o.user.toLowerCase().includes(q) : true))
      .sort((a, b) => b.amount - a.amount);
  }, [orders, query, status]);

  // 原来每行都 users.find 一次（480 × 60 次比较），换成一次建表 O(n+m)
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) map.set(u.id, u.name);
    return map;
  }, [users]);

  // 原来在渲染函数体里 addEventListener：每渲染一次就多挂一个且从不卸载
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 稳定引用，配合 memo(Row) 让行组件在无关渲染中跳过
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
          <div className="metric" key={m.key} style={{ padding: 12 }}>
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
              onPick={handlePick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
