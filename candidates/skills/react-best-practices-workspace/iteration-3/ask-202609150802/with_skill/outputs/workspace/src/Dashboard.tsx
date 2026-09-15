/**
 * 内部运营看板（评测用例的输入文件，原文件里故意留着几处性能问题）。
 *
 * 2026-09-15 已按 react-best-practices 做了一轮优化，逐条改动与对应的问题见 `docs/notes.md`。
 *
 * 注：原注释里引用的 `candidates/skills/react-best-practices/evals/cases/` 在当前工作区
 * 并不存在（这里只有 .claude/skills/react-best-practices/SKILL.md），所以按 SKILL.md 的规则改的。
 */
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

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

// --- 窗口宽度订阅 -----------------------------------------------------------
// 提到模块作用域：函数引用稳定，useSyncExternalStore 才不会每次渲染都重订阅。

function subscribeToResize(onStoreChange: () => void) {
  window.addEventListener('resize', onStoreChange);
  return () => window.removeEventListener('resize', onStoreChange);
}

const getWidthSnapshot = () => window.innerWidth;
/** SSR / 首屏兜底宽度，避免 hydration 不一致 */
const getWidthServerSnapshot = () => 1024;

// --- 静态样式 ---------------------------------------------------------------
// 提为常量：原来每行都新建一个 `{ padding: 8 }`，会白白打断 memo 的浅比较。

// 注：别在这里加 content-visibility:auto —— 内部表格盒（table-row/table-cell）
// 不适用 size containment，各浏览器对它不生效，加了是空操作（见 docs/notes.md）。
const ROW_STYLE: React.CSSProperties = { padding: 8 };

const METRIC_STYLE: React.CSSProperties = { padding: 12 };

export function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Order['status']>('all');
  // 宽度用外部订阅：不再在渲染期 addEventListener，也就没有监听器泄漏
  const width = useSyncExternalStore(subscribeToResize, getWidthSnapshot, getWidthServerSnapshot);

  // 三份数据并行取；原来是一个接一个 await，总耗时是三者之和
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [o, m, u] = await Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()]);
      if (cancelled) return;
      setOrders(o);
      setMetrics(m);
      setUsers(u);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 输入框保持即时响应，筛选（派生值）用 deferred 值，敲字时不再每个字符都阻塞一次
  const deferredQuery = useDeferredValue(query);

  // 成员建索引：原来每行都 users.find，单次渲染是 O(行数 × 成员数)
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // 筛选 + 排序是派生值，直接在渲染期算，不再进 state、不再走 effect 兜一圈
  const rows = useMemo(() => {
    // 查询串只规整一次，不再在每个 filter 回调里重复 toLowerCase()
    const q = deferredQuery.trim().toLowerCase();
    return orders
      .filter((o) => (status === 'all' ? true : o.status === status))
      .filter((o) => (q ? o.user.toLowerCase().includes(q) : true))
      .sort((a, b) => b.amount - a.amount);
  }, [orders, status, deferredQuery]);

  // setQuery 本身稳定，这里包一层是为了把「按 id 回填」变成稳定回调，配合 Row 的 memo
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
            <Row
              key={o.id}
              order={o}
              name={userMap.get(o.user)?.name ?? o.user}
              userId={o.user}
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
  userId: string;
  onPick: (userId: string) => void;
}

// memo：480 行在切筛选 / 输入 / 缩放窗口时不再整表重渲染
const Row = memo(function Row({ order, name, userId, onPick }: RowProps) {
  return (
    <tr style={ROW_STYLE} onClick={() => onPick(userId)}>
      <td>{order.id}</td>
      <td>{name}</td>
      <td>{order.amount}</td>
      <td>{order.status}</td>
      <td>{order.region}</td>
    </tr>
  );
});
