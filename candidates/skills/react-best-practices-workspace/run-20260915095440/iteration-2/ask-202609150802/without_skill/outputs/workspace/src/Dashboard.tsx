/**
 * 内部运营看板（评测用例的输入文件，故意留着几处性能问题给人优化）。
 *
 * 这份文件是 ask 用例 `ask-<id>` 的工作区输入（`context.repo_fixture`），
 * 不是仓库自己的产品代码——改它之前先看 `candidates/skills/react-best-practices/evals/cases/` 下的用例。
 */
import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';

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

/** 模块级常量：行样式对象不再每次渲染新建，否则 memo 永远失效 */
const ROW_STYLE: CSSProperties = { padding: 8 };

export function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Order['status']>('all');
  // 惰性初始化：window.innerWidth 只在首次渲染读一次，不再每次渲染都求值
  const [width, setWidth] = useState(() => window.innerWidth);

  // 三个接口互不依赖，并发请求。串行 await 会把耗时相加（600+650+550 ≈ 1.8s），
  // 并发后总耗时取决于最慢的那个（≈650ms）；一次 setState 批量提交，只多一轮渲染。
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [o, m, u] = await Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()]);
      if (!alive) return;
      setOrders(o);
      setMetrics(m);
      setUsers(u);
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  // 筛选 + 排序改成渲染期派生（useMemo），不再走「effect 里 setRows」：
  // 原写法每次筛选都要多一轮渲染，且 rows 与 orders 存在两份可能不同步的副本。
  // 这里的 .sort 作用在 .filter 产出的新数组上，不会改动 orders。
  const rows = useMemo(() => {
    const q = query.toLowerCase(); // 提前算一次，避免在 480 行里逐行 toLowerCase
    return orders
      .filter((o) => (status === 'all' ? true : o.status === status))
      .filter((o) => (q ? o.user.toLowerCase().includes(q) : true))
      .sort((a, b) => b.amount - a.amount);
  }, [orders, query, status]);

  // 成员 id -> 成员，O(1) 查表。原写法每行一次 users.find，480×60 = 28800 次比较/渲染
  const userMap = useMemo(
    () => new Map<string, User>(users.map((u): [string, User] => [u.id, u])),
    [users],
  );

  // resize 监听挂一次、卸载时摘掉。原写法直接写在函数体里，每次渲染都 add 一个，
  // 既泄漏又在滚动/缩放时被重复调用。
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 稳定引用，配合 memo(Row) 才能让没变化的行跳过重渲染
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

// memo：props 不变就跳过。上面已把 style（常量）和 onPick（useCallback）稳定下来，
// 所以切筛选时只有行集合本身变化，未受影响的行不重渲染。
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
