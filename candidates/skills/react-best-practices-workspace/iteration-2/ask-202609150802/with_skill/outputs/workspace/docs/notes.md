# Dashboard 性能优化说明

优化对象：`src/Dashboard.tsx`

反馈的两个症状：

1. **打开要好几秒** —— 首屏白等，数据要过一会儿才出来。
2. **切筛选也卡** —— 改输入框或切状态下拉时明显掉帧。

下面按「问题 → 原因 → 改动」逐条对应。文件里没有 package.json / 测试，改动只依赖 React 自带 API（`useMemo` / `useCallback` / `memo` / `useEffect`），行为与原来保持一致。

---

## 一、首屏慢（打开要好几秒）

### 1. 三个接口串行请求 → 改并行

**问题症状**：打开看板要等大约 1.8 秒才有内容。

**原因**：`useEffect` 里三个接口一个接一个 `await`：

```ts
const o = await fetchOrders();   // 600ms
setOrders(o);
const m = await fetchMetrics();  // 650ms，要等上面跑完才开始
setMetrics(m);
const u = await fetchUsers();    // 550ms，再等上面跑完
setUsers(u);
```

三个请求之间没有任何依赖关系，却排成了一条队，总耗时是三者之和 ≈ 600 + 650 + 550 = **1800ms**。

**改动**：换成 `Promise.all` 并发发起，总耗时变成最慢的那个 ≈ **650ms**，首屏大约快 1.1 秒。

```ts
const [o, m, u] = await Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()]);
```

顺带一个副作用上的好处：三次 `setState` 现在挨在一起调用，React 会合并成一次渲染，看板一次性完整出现，而不是先出现订单、再蹦出指标、最后补上成员名。

同一处还补了 `cancelled` 标记：组件卸载后不再 `setState`，避免请求回来时对已卸载组件做一次无意义的渲染。

---

## 二、切筛选卡

### 2. 筛选结果存在 state 里 → 改成渲染期 `useMemo` 派生

**问题症状**：改输入框 / 切状态时反应慢，且每次操作都会有一下多余的闪烁。

**原因**：筛选和排序被放在 `useEffect` 里，结果通过 `setRows` 写回 state：

```ts
useEffect(() => {
  const next = orders.filter(...).filter(...).sort(...);
  setRows(next);
}, [orders, query, status]);
```

这条链路是「渲染 → effect 执行 → setState → 再渲染一遍」，**每次筛选固定多一轮渲染**。而且 `rows` 本来就是能从 `orders` + `query` + `status` 完全推导出来的值，把它存成 state 属于典型的派生状态冗余，多一份状态就多一次同步和一次重渲染的机会。

**改动**：删掉 `rows` 这个 state，改为在渲染期用 `useMemo` 直接算。渲染链路从两轮变成一轮。

```ts
const rows = useMemo(() => {
  const q = query.toLowerCase();
  const filtered = orders.filter(
    (o) => (status === 'all' || o.status === status) && (!q || o.user.toLowerCase().includes(q)),
  );
  return filtered.sort((a, b) => b.amount - a.amount);
}, [orders, query, status]);
```

### 3. 一行一行查成员 → 建 Map 索引

**问题症状**：上面那条卡顿的主要来源。

**原因**：

```ts
const userOf = (id: string) => users.find((u) => u.id === id);
```

这个函数在 `rows.map()` 里对 480 行各调用一次，每次都要在最多 60 个成员里线性扫一遍，**每次渲染最多上万次字符串比较**。

**改动**：用 `useMemo` 建一次 `id → 成员` 的 Map，查询降到 O(1)。

```ts
const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
```

### 4. 480 行每次全量重画 → `memo` + 稳定 props

**问题症状**：切筛选时整张表 480 行全部重渲染。

**原因**：`Row` 是个普通函数组件，没有 `memo`，父组件一渲染 480 行全部重画。而且即便加上 `memo` 也会失效，因为传下去的三个 props 每次都是新的：

```tsx
<Row
  key={i}
  style={{ padding: 8 }}          // 每次渲染新建的对象字面量
  onPick={() => setQuery(o.user)} // 每次渲染新建的箭头函数
/>
```

`memo` 是浅比较，这两项每次渲染引用都不同，等于没包。

**改动**（三处配套，缺一不可）：

- `Row` 用 `memo` 包起来；
- `style` 提到模块作用域复用一个常量 `ROW_STYLE`（`metric` 那块的 `{ padding: 12 }` 同理，抽成 `METRIC_STYLE`）；
- `onPick` 改成 `useCallback` 包一个稳定的 `pickUser`，把「点击哪一行」的信息通过参数传入而不是靠闭包捕获，`Row` 内部再调 `onPick(order.user)`。

改完之后，切筛选时只有 props 真正变化的行才重渲染，没变动的行直接跳过。

### 5. `key` 用数组下标 → 改用订单 id

**问题症状**：筛选后列表复用错位，`memo` 也难命中。

**原因**：`key={i}` 用的是 `map` 的下标。筛选一变化，下标和数据就错位了——同一个 key 对应的订单可能换了一个，React 会按位置复用 DOM 节点，既影响渲染效率，也让上面 `memo` 的比较失去意义。

**改动**：`key={o.id}`，订单 id 本身稳定唯一。

### 6. 循环里重复调用 `toLowerCase()` → 提到循环外

**原因**：原来的筛选条件 `o.user.toLowerCase().includes(query.toLowerCase())` 里，`query.toLowerCase()` 每比较一行都要重算一次。

**改动**：提到 `useMemo` 开头算一次 `const q = query.toLowerCase()`。同时把原来的两个 `.filter()` 合并成一趟遍历，少扫一遍数组。

---

## 三、顺手修掉的一个泄漏

### 7. `resize` 监听写在渲染体里且从不清理

**问题症状**：拖窗口越来越卡，且切走页面后监听器还在。

**原因**：

```ts
window.addEventListener('resize', () => setWidth(window.innerWidth));
```

这行直接写在组件函数体里，意味着**每次渲染都会注册一个新的匿名监听器，而且永远无法注销**（连引用都没保存）。渲染 N 次就有 N 个监听器，之后每次拖窗口都会触发 N 次 `setWidth`，每次又是一轮全量重渲染，卡顿被成倍放大。

**改动**：移进 `useEffect`，用同一个函数引用注册并在清理函数里注销，保证全生命周期只有一个监听。同时把 `useState(window.innerWidth)` 改成惰性初始化 `useState(() => window.innerWidth)`——原来的写法每次渲染都会多求值一次 `window.innerWidth`（虽然只有首次生效）。

---

## 四、预期效果

| 场景 | 改动前 | 改动后 |
| --- | --- | --- |
| 首屏数据到位 | ≈1800ms（三段串行相加） | ≈650ms（并发取最慢的一段） |
| 每次筛选的渲染轮次 | 2 轮（effect + setState） | 1 轮 |
| 每次渲染的成员查找 | 最多上万次比较，O(行数 × 成员数) | O(1) 查表 |
| 输入/切筛选时的重渲染行数 | 480 行全量 | 仅 props 变化的那几行 |
| `resize` 监听器数量 | 随渲染次数线性增长 | 恒为 1 个 |

---

## 五、刻意没有改的地方

- **`.sort()` 没有换成 `toSorted()`**：前面的 `.filter()` 已经返回新数组，这里的 `sort` 排的是那个新数组，不会改动 `orders`，不存在原地修改的问题；`toSorted` 还要求 ES2023 的 lib 配置，这仓库没有 `package.json`、无法确认目标环境，不引入这个风险。
- **没有加 `useDeferredValue` / `useTransition`**：输入卡顿的根因是 480 行全量重渲染，第 4 条已经解决。480 条的筛选排序本身是微秒级，再加并发特性只会让表格显示滞后于输入框，收益为负。
- **没有加 loading 骨架屏**：属于观感优化而非性能问题，且要新增 UI，超出这次改动范围。如果还想让"打开时感觉更快"，这是下一步性价比最高的做法——首屏 650ms 内先渲染指标区骨架，比留一张空表格观感好得多。
- **接口本身没有动**：`fetchOrders` / `fetchMetrics` / `fetchUsers` 是模拟接口，延迟是刻意设定的，本次只调整调用方式。
