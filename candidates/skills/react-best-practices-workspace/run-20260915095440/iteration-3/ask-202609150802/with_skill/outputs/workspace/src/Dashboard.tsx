/**
 * 内部运营看板。
 *
 * 本文件最初是评测用例 `ask-<id>` 的工作区输入（`context.repo_fixture`），
 * 里面故意留了几处性能问题；现已按 react-best-practices 优化。
 * 每处改动对应的原因见 `docs/notes.md`。
 */
import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';

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

/** 常量提到模块级：原先每行每次渲染都新建一个对象，让 Row 的 memo 永远失效 */
const ROW_STYLE: React.CSSProperties = { padding: 8 };

export function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Order['status']>('all');
  // 惰性初始化：避免每次渲染都求值一次 window.innerWidth
  const [width, setWidth] = useState(() => window.innerWidth);

  // 三份数据互不依赖，并行取。原先串行 await 要 600+650+550=1800ms，现在约等于最慢的那个 650ms。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [o, m, u] = await Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()]);
      if (cancelled) return; // 卸载后不再 setState（也挡住 StrictMode 的二次执行）
      setOrders(o);
      setMetrics(m);
      setUsers(u);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 索引表：原先 userOf() 每行都对 users 做一次 find，480 行 × 60 人 ≈ 28,800 次比较/渲染，现在 O(1)。
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // 输入保持即时响应，列表这份重活降级为可中断的低优先级更新。
  const deferredQuery = useDeferredValue(query);

  // 派生值直接算，不再存进 state、也不再走 effect。
  // 原来 effect + setRows 每次筛选都要多一轮渲染，而且 UI 会慢一帧。
  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase(); // 提出循环外，原先把 toLowerCase 算了 480 遍
    const filtered = orders.filter((o) => {
      if (status !== 'all' && o.status !== status) return false;
      if (q && !o.user.toLowerCase().includes(q)) return false;
      return true;
    });
    // 这里 filter() 已经返回新数组，sort() 不会碰到 orders，没有就地修改的问题。
    return filtered.sort((a, b) => b.amount - a.amount);
  }, [orders, deferredQuery, status]);

  // resize 监听放进 effect 并配好清理。
  // 原先直接写在渲染体里，每渲染一次就多挂一个监听且永不移除——输入几个字符后
  // 页面上就叠了几十个监听，这本身就是「切筛选也卡」的一大来源。
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
  onPick: (userId: string) => void;
}

/** memo + 稳定 props：筛选变化时只有真正增删的行会重新渲染 */
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
