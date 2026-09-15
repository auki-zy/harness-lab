/**
 * 内部运营看板（评测用例的输入文件，故意留着几处性能问题给人优化）。
 *
 * 这份文件是 ask 用例 `ask-<id>` 的工作区输入（`context.repo_fixture`），
 * 不是仓库自己的产品代码——改它之前先看 `candidates/skills/react-best-practices/evals/cases/` 下的用例。
 *
 * 本次性能改动的逐条说明见 docs/notes.md。
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

/**
 * 行的样式提到模块作用域：内联写成 `style={{ padding: 8 }}` 的话每次渲染都是新对象，
 * 引用比较永远不等，Row 的 memo 会被这一项白白打穿。视觉与原来完全一致。
 */
const ROW_STYLE: React.CSSProperties = { padding: 8 };

export function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Order['status']>('all');
  // 惰性初始化：原写法每次渲染都要读一次 window.innerWidth
  const [width, setWidth] = useState(() => window.innerWidth);

  // 三份数据互不依赖，并行取：耗时从 600+650+550≈1800ms 降到 max(600,650,550)≈650ms。
  // 代价是三个 setState 同一批落地，不再像原来那样指标先于表格逐步出现。
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

  // 排序只取决于 orders，算一次就够：筛选是保序的，不会破坏已经排好的降序，
  // 所以不用像原来那样每敲一个字就把 480 条重排一遍。
  // 用 [...orders] 而不是 toSorted()，是为了不依赖调用方的 tsconfig lib 是否到 ES2023。
  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => b.amount - a.amount),
    [orders],
  );

  // 成员 id -> 成员 的索引表。原来是每行调一次 users.find()，480 行 × 60 人 ≈ 每次渲染 2.9 万次比较，
  // 建表后每行都是 O(1)。
  const userById = useMemo(() => {
    const byId = new Map<string, User>();
    for (const u of users) byId.set(u.id, u);
    return byId;
  }, [users]);

  // query 保持紧急更新（输入框必须跟手），列表用延迟值跟上：
  // 打字时输入框不再被「480 行重渲染」卡住，列表稍晚一帧追上来。
  const deferredQuery = useDeferredValue(query);

  // 原来「筛选结果存进 state、再用 useEffect 回写」是典型的派生状态：
  // 每次筛选都要多跑一整轮渲染（先渲染旧 rows，effect 再 setRows 触发第二次）。
  // 现在在渲染期直接算，一轮渲染出结果。
  const rows = useMemo(() => {
    const q = deferredQuery.toLowerCase();
    // 无条件时直接复用同一个数组引用，父组件因其它原因重渲染（比如宽度变化）时
    // rows 引用不变，memo 过的 Row 全部跳过。
    if (status === 'all' && q === '') return sortedOrders;
    return sortedOrders.filter(
      (o) => (status === 'all' || o.status === status) && (q === '' || o.user.toLowerCase().includes(q)),
    );
  }, [sortedOrders, deferredQuery, status]);

  // 原来这行直接写在渲染体里：每次渲染都新挂一个监听，而且从不摘除。
  // 结果监听器无限增长（打字一次多一个），resize 时全部触发。
  // 现在只挂一次并在卸载时清理；另外拖动窗口时 resize 触发极密，用 rAF 合并成每帧最多一次。
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

  // 稳定引用，配合 Row 的 memo 生效
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
            // 原来用数组下标做 key：筛选后下标整体前移，React 会认为「第 3 行还是第 3 行」
            // 而把内容逐个改一遍，既慢又可能把行内状态错配到别的订单上。用订单 id 才能让
            // 存活的行被复用、消失的行被整行移除。
            <Row
              key={o.id}
              order={o}
              name={userById.get(o.user)?.name ?? o.user}
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

// memo 包一层：原来每行都要接收新建的 style 对象和新建的 onPick 闭包，Props 永远不等，
// 400 多行的函数体每次筛选都被全部重跑。现在回调把 user 传给父级（而不是父级为每行生成闭包），
// 配合稳定的 ROW_STYLE，只有真正变化的行才重渲染。
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
