/**
 * 内部运营看板（评测用例的输入文件，故意留着几处性能问题给人优化）。
 *
 * 这份文件是 ask 用例 `ask-<id>` 的工作区输入（`context.repo_fixture`），
 * 不是仓库自己的产品代码——改它之前先看 `candidates/skills/react-best-practices/evals/cases/` 下的用例。
 */
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';

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

// 静态样式提到模块级：原来写在 JSX 里，每次渲染都是新对象，
// 会直接让下面 Row 的 memo 失效（props 浅比较永远不相等）。
const ROW_STYLE: React.CSSProperties = { padding: 8 };
const METRIC_STYLE: React.CSSProperties = { padding: 12 };

export function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Order['status']>('all');
  // window 只在浏览器里存在，惰性初始化顺便规避 SSR 直接读 window 报错
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth));

  // 三份数据互不依赖，并行取：原来一个 await 接一个要 600 + 650 + 550 ≈ 1.8s，
  // 现在只等最慢的那个，约 650ms。cancelled 用来避免卸载后还 setState。
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

  // resize 监听：只注册一次、卸载时移除（原来写在渲染体里，每次渲染加一个且从不解绑，
  // 既漏内存又会让一次 resize 触发 N 次 setState）；用 rAF 把同一帧的连续事件合并成一次。
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // 宽度没变就不更新 state，省掉一次整树重渲染
        setWidth((prev) => (prev === window.innerWidth ? prev : window.innerWidth));
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  // 输入框用实时值保持跟手，重的筛选/排序读延迟值，
  // 这样敲字和切筛选时的长任务可以被 React 打断，不阻塞输入。
  const deferredQuery = useDeferredValue(query);

  // 派生数据直接在渲染期算：原来靠 state + effect 兜一圈，会先渲染一帧旧 rows
  // 再 setRows 触发第二遍渲染；现在一步到位，也避开了中间的过期状态。
  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    // 两个 filter 合成一趟遍历，并且 toLowerCase 提到循环外，别每行重算一次
    return orders
      .filter((o) => (status === 'all' || o.status === status) && (q === '' || o.user.toLowerCase().includes(q)))
      .sort((a, b) => b.amount - a.amount); // filter 返回的是新数组，排序不会污染 orders
  }, [orders, deferredQuery, status]);

  // 原来每行都 users.find 一次，480 × 60 = 28800 次比较；改成按 id 建一次索引
  const nameById = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

  // 稳定的回调引用，配合 Row 的 memo 生效
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
          {/* key 用订单 id：原来用下标，排序/筛选后 React 只能按位置复用节点，
              等于每次都要把每一行的内容重写一遍 */}
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

interface RowProps {
  order: Order;
  name: string;
  onPick: (user: string) => void;
}

// memo：筛选/排序后 order 引用没变的行直接跳过重渲染。
// 组件里所有 props 现在都是稳定的（order 来自 state、name 是字符串、onPick 已 useCallback、
// style 已提到模块级），所以这层比较真的能挡住大部分行。
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
