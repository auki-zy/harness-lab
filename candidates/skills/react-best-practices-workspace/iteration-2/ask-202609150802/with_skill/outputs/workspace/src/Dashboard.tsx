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

// 静态样式提到模块作用域。写成内联字面量的话每次渲染都是新对象，
// 会让下面 memo 过的 Row 永远判定 props 变化，memo 直接失效。
const ROW_STYLE: CSSProperties = { padding: 8 };
const METRIC_STYLE: CSSProperties = { padding: 12 };

export function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Order['status']>('all');
  // 惰性初始化：useState(window.innerWidth) 每次渲染都会求值一次，虽然只有首次生效
  const [width, setWidth] = useState(() => window.innerWidth);

  // 三个接口互不依赖，改成并行。原来一个接一个 await，
  // 首屏要等 600 + 650 + 550 ≈ 1.8s；并行后只等最慢的那个 ≈ 650ms。
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
    // 组件卸载后不再 setState，避免卸载后才回来的请求白白触发一次渲染
    return () => {
      cancelled = true;
    };
  }, []);

  // 派生数据在渲染期用 useMemo 算，不再往 state 里塞一份。
  // 原来是 effect 里 setRows：渲染 → effect → setState → 再渲染，每次筛选至少两轮渲染，
  // 且多存了一份完全可以推导出来的状态。
  const rows = useMemo(() => {
    const q = query.toLowerCase();
    // 两个 filter 合成一趟遍历
    const filtered = orders.filter(
      (o) => (status === 'all' || o.status === status) && (!q || o.user.toLowerCase().includes(q)),
    );
    // filter 已经返回新数组，这里的 sort 不会改动 orders
    return filtered.sort((a, b) => b.amount - a.amount);
  }, [orders, query, status]);

  // 成员 id → 成员 的索引，只建一次。
  // 原来是每行都 users.find(...)：480 行 × 最多 60 次比较 = 每次渲染上万次比较。
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // resize 监听放进 effect 并清理。原来直接写在渲染体里：
  // 每次渲染都注册一个新的匿名监听且永不注销，监听器越堆越多，
  // 之后每次拖窗口都会触发 N 次 setWidth → N 次全量重渲染。
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 稳定引用：配合下面的 memo，切筛选/输入时无关的行才能跳过重渲染
  const pickUser = useCallback((userId: string) => setQuery(userId), []);

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
            // key 用订单 id。原来用数组下标，筛选后下标会跟数据错位，
            // 导致 React 复用错行的 DOM、memo 也很难命中。
            <Row
              key={o.id}
              order={o}
              name={usersById.get(o.user)?.name ?? o.user}
              style={ROW_STYLE}
              onPick={pickUser}
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

// memo 包一层：每次输入/切筛选原来会把 480 行全部重画，现在只有 props 真变了的行才重渲染。
// 配合 Row 自身不再接收内联 style / 内联箭头函数，以及 key 用 id，memo 才真正生效。
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
