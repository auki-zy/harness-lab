# Dashboard.tsx 性能优化说明

针对两个症状：**首屏打开要好几秒**、**切换筛选/输入时卡顿**。

下面按"改动 → 想解决的问题"逐条对应，行号指改动前的 `src/Dashboard.tsx`。

---

## 首屏慢（打开要好几秒）

### 1. 三个请求从串行改成并行

**原代码**（旧 67-77 行）：

```tsx
const o = await fetchOrders();     // 600ms
setOrders(o);
const m = await fetchMetrics();    // 650ms
setMetrics(m);
const u = await fetchUsers();      // 550ms
setUsers(u);
```

**问题**：三份数据互不依赖，却被 `await` 串成了一条瀑布，总耗时是三者相加
≈ 600 + 650 + 550 = **1800ms**，期间页面上什么数据都没有。

**改法**：`Promise.all` 并发取，并且一次批量 setState。

```tsx
const [o, m, u] = await Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()]);
```

**效果**：等待时间从"三者之和"变成"三者最大值" ≈ **650ms**，这是首屏感知上最大的一笔。
对应 skill 规则：*Eliminating Waterfalls → Use Promise.all() for independent operations*。

顺带加了 `cancelled` 标志（旧代码没有）：组件在请求返回前卸载就丢弃结果，避免
卸载后 setState 的警告和无效渲染。

### 2. 派生数据从 useEffect + state 改成渲染期 useMemo

**原代码**（旧 80-86 行）：

```tsx
const [rows, setRows] = useState<Order[]>([]);
useEffect(() => {
  const next = orders.filter(...).filter(...).sort(...);
  setRows(next);
}, [orders, query, status]);
```

**问题**：`rows` 完全由 `orders/query/status` 推导得出，却被存成了独立 state。
代价是每次筛选条件变化都要走**两轮渲染**——先渲染一帧（此时 `rows` 还是旧值），
effect 跑完 setRows 再渲染一遍。中间那一帧就是列表"闪一下旧数据"的来源。

**改法**：删掉 `rows` state，改成 `useMemo` 在渲染期直接算。

**效果**：少一轮渲染，也没有了中间的过期状态。对应 skill 规则：
*Re-render Optimization → Subscribe to derived state*。

---

## 切筛选卡（输入/切换时卡顿）

### 3. 用 useDeferredValue 把重活降级为可中断更新

**问题**：`query` 每敲一个字符都会同步触发"过滤 480 条 + 排序 480 条 + 重渲染 480 行"，
这是一段长任务，主线程被占满导致输入框掉字、下拉框响应迟滞。

**改法**：

```tsx
const deferredQuery = useDeferredValue(query);
```

输入框读实时的 `query`（保持跟手），筛选/排序读 `deferredQuery`（可以晚一拍）。
React 会把这次更新标记为低优先级，能被下一次按键打断。

**效果**：输入框始终即时响应，列表稍后跟上。对应 skill 规则：
*Re-render Optimization → Use transitions for non-urgent updates*。

> 注意：`useDeferredValue` 需要 **React 18+**。这个工作区里没有 `package.json`，我无法确认版本；
> 若项目仍是 React 17，需改用防抖替代（语义会略有不同）。

### 4. 合并两次 filter，循环不变量提到循环外

**原代码**（旧 81-84 行）：

```tsx
orders
  .filter((o) => (status === 'all' ? true : o.status === status))
  .filter((o) => (query ? o.user.toLowerCase().includes(query.toLowerCase()) : true))
  .sort((a, b) => b.amount - a.amount);
```

**问题**：两趟遍历各建一个中间数组（480 条各分配两次）；
且 `query.toLowerCase()` 写在回调里，**每行都要重复算一次**，480 行就是 480 次
对同一个字符串做 lowercase。

**改法**：合成一趟 `filter`，`toLowerCase` 提到循环外算一次。

**效果**：遍历从 2 趟减到 1 趟，字符串转换从 480 次减到 1 次。对应 skill 规则：
*JavaScript Performance → Combine multiple array iterations / Cache repeated function calls*。

### 5. `users.find` 换成 Map 索引

**原代码**（旧 91 行）：

```tsx
const userOf = (id: string) => users.find((u) => u.id === id);
```

**问题**：在 480 行的 map 里逐行调用，每次都是 O(60) 的线性查找 ——
单次渲染 **28800 次比较**，而且这个函数每轮渲染都重新创建。

**改法**：按 id 建一次 Map，渲染时 O(1) 查。

```tsx
const nameById = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);
```

对应 skill 规则：*JavaScript Performance → Use Set/Map for O(1) lookups*。

### 6. Row 加 memo，并让它的 props 真的稳定

**问题**：`Row` 没有 memo，父组件任何一次重渲染（包括**窗口 resize**）都要重渲染全部 480 行。
更麻烦的是，即使加了 memo 也没用，因为 props 里有两颗"每次都是新对象"的地雷：

- `style={{ padding: 8 }}` —— 内联对象字面量，每轮渲染新建
- `onPick={() => setQuery(o.user)}` —— 内联箭头函数，每轮渲染新建

浅比较永远不相等，memo 会被完全打穿。

**改法**：

- `ROW_STYLE` 提到模块级常量（`METRIC_STYLE` 同理，旧 112 行）
- `handlePick` 用 `useCallback` 固定引用
- 用 `memo()` 包裹 `Row`，并去掉 `style` 这个 prop（改用模块常量）

**效果**：筛选/排序后引用未变的行直接跳过重渲染；resize 时 480 行全部跳过。
对应 skill 规则：*Re-render Optimization → Extract to memoized components* +
*Rendering Performance → Hoist static JSX elements*。

### 7. 列表 key 从下标改成订单 id

**原代码**（旧 136 行）：`key={i}`

**问题**：列表会被排序和筛选，位置完全不等于身份。用下标做 key，React 只能按位置
复用 DOM 节点，等于每次筛选都要把每一行的内容重写一遍，而不是复用。

**改法**：`key={o.id}`。配合第 6 条，未变化的行会真正被跳过。

---

## 顺手修掉的 bug（不直接表现为卡顿，但会越用越慢）

### 8. resize 监听泄漏

**原代码**（旧 89 行，写在组件函数体里）：

```tsx
window.addEventListener('resize', () => setWidth(window.innerWidth));
```

**问题**：这行在**每次渲染时**执行，且从不 `removeEventListener`：

- 每渲染一次就多挂一个监听器，组件活得越久积累越多
- 一次 resize 会触发 N 个监听器 → N 次 `setWidth` → N 轮全量渲染
- 典型的闭包持有 + 内存泄漏

**改法**：挪进 `useEffect`，只注册一次，卸载时移除；再用 `requestAnimationFrame`
把同一帧内的连续 resize 事件合并成一次；最后加"宽度没变就不 setState"的短路。

对应 skill 规则：*Client-Side Data Fetching → Deduplicate global event listeners*。

### 9. width 惰性初始化

**原代码**（旧 64 行）：`useState(window.innerWidth)`

**问题**：这个表达式每次渲染都会求值（只是结果被忽略，属于白算），而且在 SSR 环境
下 `window` 未定义会直接抛错。

**改法**：`useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth))`。
对应 skill 规则：*Re-render Optimization → Use lazy state initialization*。

---

## 有意没做的事

- **虚拟滚动 / `content-visibility`**：480 行确实适合虚拟化，但那要引入依赖或改写表格结构，
  会改动 DOM 语义和滚动行为。上面几条已经消掉了主要开销，这一条留作后续可选项。
- **`toSorted()` 替代 `sort()`**：skill 里有这条规则，但它针对的是"直接原地排序 state 数组"
  这个坑。这里 `sort` 作用在 `filter` 返回的**新数组**上，不会污染 `orders`，所以语义上已经安全；
  同时 `toSorted` 需要 ES2023 lib，而本工作区没有 `tsconfig.json`，贸然使用有编译失败的风险。

## 验证情况

本工作区只有 `src/Dashboard.tsx` 和 skill 目录，**没有 `package.json` / `tsconfig.json` / 测试**，
因此以上改动**未经编译或运行时验证**，仅按 skill 规则做静态修改。
接入真实项目后建议：跑一次类型检查，并用 React DevTools Profiler 对比筛选操作前后的提交耗时。
