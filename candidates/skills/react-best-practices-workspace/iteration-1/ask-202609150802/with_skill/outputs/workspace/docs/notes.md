# Dashboard 性能优化说明

改动文件：`src/Dashboard.tsx`（仅此一个文件，未新增依赖）。

对应两个现象：

- **打开要好几秒** → 由改动 1（请求瀑布）导致。
- **切筛选/打字卡** → 由改动 2–7 共同导致。

---

## 打开慢

### 改动 1：三份数据改并行取（`Promise.all`）

- **原代码**：`useEffect` 里 `await fetchOrders()` → `setOrders` → `await fetchMetrics()` → … 三个互不依赖的接口串成链。
- **问题**：耗时是相加的，600 + 650 + 550 ≈ **1800ms**，而且首个接口不返回，后面两个根本不会发出。这是首屏慢的主因。
- **改法**：`Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()])`，耗时变成三者最大值 ≈ **650ms**。
- **顺带**：加了 `cancelled` 标志，组件卸载后不再 `setState`。
- **副作用（需要知情）**：原来三个 `setState` 是陆续落地的，指标卡、成员数、表格会先后出现；现在同一批落地，一起出现。如果希望保留渐进渲染，正确做法是拆成三个独立的 `useEffect` 各自 `fetch`——仍然是并行的，只是完成时间不同。当前实现选了"整体更快"。

---

## 切筛选卡

### 改动 2：`rows` 从「派生 state + effect 回写」改成渲染期 `useMemo`

- **原代码**：`const [rows, setRows] = useState([])`，再在 `useEffect` 里筛选排序后 `setRows(next)`。
- **问题**：这是典型的派生状态反模式，每次筛选都要跑**两轮**渲染——第一轮用旧的 `rows` 渲染一遍完整表格，effect 跑完 `setRows` 再渲染一遍。等于每次筛选白干一倍的活。
- **改法**：删掉 `rows` state 和那个 effect，`rows` 用 `useMemo` 在渲染期算出来，一轮渲染出结果。

### 改动 3：排序只算一次

- **原代码**：`.sort((a, b) => b.amount - a.amount)` 挂在筛选链末尾，每次 query/status 变化都对结果重排。
- **问题**：`orders` 只在加载时变一次，排序却是每次筛选都做的 **O(n log n)**。
- **改法**：`sortedOrders = useMemo(() => [...orders].sort(...), [orders])`。**筛选是保序的**，不会破坏已排好的降序，所以 memo 里只剩 filter，降到 **O(n)**。
- **说明**：用 `[...orders].sort()` 而不是技能里推荐的 `toSorted()`，是因为这个文件没有配套的 `tsconfig.json`，无法确认 `lib` 是否到了 ES2023；展开后排序同样不修改原数组，兼容性更稳。若确认构建目标支持，换成 `orders.toSorted(...)` 可以省一次数组拷贝。

### 改动 4：输入框走紧急更新，列表用 `useDeferredValue` 跟上

- **问题**：`query` 一变，480 行的筛选 + 重渲染全部同步发生，打字被表格重渲染拖住。
- **改法**：`query` 仍是普通 state（输入框必须跟手），列表消费 `useDeferredValue(query)`。打字时输入框立刻响应，列表晚一帧追上来。
- **要求**：`useDeferredValue` 需要 React 18+。
- **可选后续**：React 官方模式下可以给表格加个变灰提示（`opacity` 随 `query !== deferredQuery` 变化），让"列表暂时落后"看得出来。这次没加，因为属于视觉改动、超出了性能范围。

### 改动 5：成员查找建索引表，替掉每行一次 `users.find`

- **原代码**：`const userOf = (id) => users.find(u => u.id === id)`，在 `rows.map` 里每行调一次。
- **问题**：480 行 × 60 人 ≈ 每次渲染 **2.9 万次**比较，纯粹白烧。
- **改法**：`userById` 用 `useMemo` 建一次 `Map`，每行查询降到 **O(1)**。

### 改动 6：`Row` 用 `memo` 包住，并让它的 props 真正稳定

这一步单独拆开看有三个问题，缺一个 memo 都不生效：

1. `style={{ padding: 8 }}` 内联 —— 每次渲染新对象。→ 提到模块作用域的 `ROW_STYLE` 常量，视觉不变。
2. `onPick={() => setQuery(o.user)}` —— 父组件为每一行新建一个闭包。→ 改成父组件用一个 `useCallback` 的稳定回调，行内自己把 `order.user` 传上去。
3. 组件本身没包 `memo`。→ `const Row = memo(function Row(...))`。

- **效果**：只有真正变化的行重渲染。顺带一个好处：宽度变化等和表格无关的重渲染，不再连带重跑 480 行。
- **保留原样**：`<tr>` 上的 `padding` 浏览器本来就不生效（`padding` 对 table row 无效）。这是原有写法，我把它原样搬进常量，没有顺手"修"样式——那是视觉改动，不是这次的范围。

### 改动 7：`key={i}` 改成 `key={o.id}`

- **问题**：用数组下标做 key，筛选后下标整体前移，React 会认为"第 3 行还是第 3 行"而把内容逐行改一遍；同时行内状态会错配到别的订单上。
- **改法**：`key={o.id}`，被筛掉的行整行移除、存活的行复用 DOM 节点。

---

## 另外修掉的一个真实缺陷

### 改动 8：`resize` 监听器泄漏

- **原代码**：`window.addEventListener('resize', () => setWidth(window.innerWidth))` **直接写在渲染体里**，且从不 `removeEventListener`。
- **问题**：每次渲染都新挂一个监听器，且永久残留。打字几次就积累几十上百个，拖动窗口时全部触发、全部 `setState`。这是"越用越卡"的元凶，也算个内存泄漏。
- **改法**：移进 `useEffect`，只挂一次，卸载时清理。
- **顺带**：拖动窗口时 `resize` 触发极密，用 `requestAnimationFrame` 合并成每帧最多一次。

### 改动 9：`useState(window.innerWidth)` 改惰性初始化

- `useState(() => window.innerWidth)`，避免每次渲染都读一次 `window.innerWidth`。改动很小，顺手做掉。

---

## 我没有动的地方（避免超出范围）

1. **筛选字段仍然是 `o.user`（如 `u-12`），不是显示出来的成员名**。输入框提示是"按成员筛选"，但用户看到的表格列是"成员 1"这类名字，打字搜"成员"其实匹配不到任何东西。**这是一个真实的功能 bug，不是性能问题**，修它会改变筛选语义，所以留给你决定。
2. **没上虚拟滚动**。480 行的量级，在 memo + 稳定 key 之后切筛选已经够快。如果行数会涨到几千，再引入 `react-window` 之类的虚拟列表；也可以先用 `content-visibility: auto` 试，但把它加在 `<tr>` 上会影响表格列宽计算，需要实测，这次没冒险加。
3. **`<select>` 的 `onChange` 仍是内联箭头函数**。它没有配 `memo`，新函数不会导致额外重渲染，包 `useCallback` 属于没有收益的噪音。

---

## 遗留提示

文件头注释提到的 `candidates/skills/react-best-practices/evals/cases/` 在当前工作区里不存在（工作区只有 `src/Dashboard.tsx` 和 `.claude/skills/`），所以没能按注释说的先去读用例。如果那个路径在别处有意义，值得回头确认一下这次改动是否覆盖了用例的预期点。

另外，`.claude/skills/react-best-practices/` 这份技能只有 `SKILL.md`，其正文引用的 `references/react-performance-guidelines.md` 并没有随技能一起提供（技能来自 `davila7/claude-code-templates`）。本次改动依据的是 `SKILL.md` 里的规则摘要。
