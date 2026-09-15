# Dashboard.tsx 性能优化说明

优化对象：`src/Dashboard.tsx`
报告的两个症状：**打开要好几秒**、**切筛选/输入时卡顿**。

> 说明：这个工作区里只有 `src/Dashboard.tsx` 和 `.claude/skills/`，没有 `package.json`、
> `tsconfig.json`，也没有对应 CSS。所以下面的结论全部来自代码走查，**没有跑过构建、类型检查
> 或 Profiler 实测**。改动都保持了原有对外行为，建议合入前在有构建环境的地方过一遍 `tsc` 和实机验证。

---

## 一、「打开要好几秒」

### 1. 三个接口串行请求 → 改并行（主要瓶颈）

**问题**：`load()` 里 `fetchOrders()` → `fetchMetrics()` → `fetchUsers()` 是一个接一个 `await` 的。
三个接口各要 600 / 650 / 550ms，且互相没有数据依赖，但串起来首屏要等
`600 + 650 + 550 = 1800ms`。

**改法**：改成 `Promise.all([...])`，总耗时从「三者之和」降到「三者最大值」，约 650ms。
这一处基本就是「打开要好几秒」的主因。

顺带加了 `cancelled` 标志位，卸载后不再 `setState`；同时也挡住 React StrictMode 下的二次执行。

### 2. `useState(window.innerWidth)` → 惰性初始化

**问题**：`useState(window.innerWidth)` 的初值每次渲染都会求值一次（虽然只有首次生效，
但读 `window` 放在渲染期本身是浪费）。

**改法**：`useState(() => window.innerWidth)`。收益很小，属于顺手清理。

---

## 二、「切筛选也卡」

卡顿不是一个原因造成的，是下面几处叠加。按影响从大到小：

### 3. resize 监听挂在渲染体里，且从不清理（最严重）

**问题**：`window.addEventListener('resize', ...)` 直接写在组件函数体里，既没有放进
`useEffect`，也没有 `removeEventListener`。**每渲染一次就多挂一个监听，一个都不移除。**
输入几个字符、切几次筛选之后，页面上就叠了几十个监听，之后每次窗口尺寸变化都要触发几十遍
`setWidth` → 全量重渲染。这既是内存泄漏，也是卡顿的一大来源。

**改法**：移入 `useEffect`，并在清理函数里 `removeEventListener`。现在无论渲染多少次，
始终只有一个监听。

### 4. 筛选+排序放进 effect 且写回 state → 改为渲染期 `useMemo` 派生

**问题**：`rows` 是派生数据，却用 `useState` 存、用 `useEffect` 算。
每次筛选变化都要：渲染 → effect 执行 → `setRows` → 再渲染一轮，白跑一轮渲染，
并且表格内容比输入框慢一帧。

**改法**：删掉 `rows` state 和那个 effect，改成渲染期直接 `useMemo` 计算。
仅更新派生值不应该驱动额外一轮渲染，`useEffect` 只该用于同步外部系统，不该用来算派生状态。

### 5. `userOf()` 每人一次线性查找 → 建 Map 索引

**问题**：`userOf(id)` 内部是 `users.find(...)`，而它在表格里**每一行调用一次**。
480 行 × 60 个用户 ≈ **每次渲染 28,800 次比较**，而且这还在每次输入时重跑。

**改法**：`useMemo` 建一张 `Map<id, User>`，查表 O(1)。这里用了「为重复查找建索引」这个模式。

### 6. `key={i}` → `key={o.id}`

**问题**：用数组下标当 key。筛选一变，列表增删会让 React 按位置复用 DOM 节点，
导致复用到错误行上、该复用的又重建，既浪费渲染又可能出现行内容错位。

**改法**：改用稳定的 `o.id`，让 React 能准确识别行的增删与移动。

### 7. `Row` 没 memo，且每行的 props 每次都是新引用

**问题**：三个叠加点让 `Row` 完全无法复用：
- `style={{ padding: 8 }}` —— 每行每次渲染都新建一个对象字面量；
- `onPick={() => setQuery(o.user)}` —— 每行每次渲染都新建一个闭包；
- `Row` 本身没有 `memo`。

结果是任何一次输入/筛选变化都会重渲染全部 480 行。

**改法**：
- `ROW_STYLE` 提到模块级常量，引用恒定；
- 把 `onPick` 换成稳定的 `setQuery`（`useState` 的 setter 引用天然稳定），
  由 `Row` 内部调用 `onPick(order.user)`；
- `Row` 用 `memo` 包起来。

这样 props 引用稳定后 memo 才真正生效，筛选变化时只有真正增删的行会重渲染。

> 附带：`Row` 的 `style` prop 直接删掉了（它永远等于同一个常量），
> 因此 `React.CSSProperties` 的引用从原先的 props 类型移到了 `ROW_STYLE` 上——
> 沿用文件原本的写法，没有新引入 React 命名空间 import。

### 8. 输入用 `useDeferredValue` 降级（可选加固）

**问题**：每敲一个字都立刻触发一遍全表筛选+重渲染。480 行的量级下即使上面都优化完，
输入仍可能偶发掉帧。

**改法**：`useDeferredValue(query)`，输入框走紧急更新保持即时响应，
列表这份重活降级为可中断的低优先级更新。

**取舍**：表格内容和「共 N 条」的计数会比输入框**慢一拍**。这是这个方案的预期行为，
不是 bug；换来的是输入框永不卡顿。如果不能接受，去掉这一处即可，其余优化独立成立。

### 9. 两次 `filter` 合并为一次，`toLowerCase()` 提出循环

**问题**：原先是 `.filter(状态).filter(关键字)` 两趟数组遍历；
且 `query.toLowerCase()` 在每行的回调里被重复计算了 480 遍。

**改法**：合并成一个 `filter`，`toLowerCase` 提到循环外算一次。
在 480 行这个量级收益很小，属于顺手清理。

---

## 三、评估过但**没有**改的点

### `.sort()` 保留，没换成 `toSorted()`

最佳实践里有一条「用 `toSorted()` 代替 `sort()`」——是为了避免就地修改原数组。
但这里 `.sort()` 是接在 `.filter()` 后面的，**`filter()` 本来就返回新数组**，
排序动的是这个临时数组，`orders` 不会被改到。**这里不存在就地修改的问题。**

而 `toSorted()` 需要 ES2023，依赖 `tsconfig` 的 `lib` 设置和浏览器版本
（Safari 16 以下不支持）。这个工作区没有 `tsconfig.json`，我无法确认编译目标，
贸然替换有编译失败的风险，而收益为零。故保留 `.sort()`。

如果确认目标环境支持 ES2023，可以换，但那属于统一代码风格，不是性能优化。

### `.metrics` 里的 `style={{ padding: 12 }}` 没提

同样的「内联对象字面量」问题，但它只有 **3 个**元素，且不参与 memo，
开销可以忽略。提出来只会增加噪音，不值得。

### `width` 状态没删掉改用 CSS

`width: width - 32` 本质是纯样式，完全可以用 CSS `width: calc(100% - 32px)` 表达，
那样连 `width` state 和 resize 监听都可以整个删掉，是最彻底的解法。

但这取决于 `.dashboard` 的父容器宽度是否等于视口宽度，而这个工作区里**没有对应的 CSS 文件**，
改了有改变布局的风险。所以这次只修了监听的泄漏问题（第 3 条），
把 CSS 方案留作后续：确认 `.dashboard` 充满视口后，可以直接换成 `calc(100% - 32px)`，
并删掉 `width` state 与 resize effect。

---

## 四、还没做 / 建议后续验证

- **没有实测**：缺少构建环境，以上都是静态分析结论。建议用 React DevTools Profiler
  对比改动前后的 commit 耗时，确认 4/5/7 三条的实际收益。
- **没有实现分页或虚拟滚动**：480 行全量渲染本身仍是线性成本。若行数继续增长
  （比如上千），`memo` 也救不了，届时需要虚拟列表（如 `react-window`）
  或给表格加 CSS `content-visibility: auto`。
- **`useDeferredValue` 需要 React 18+**：这个工作区没有 `package.json`，无法确认 React 版本。
  若项目仍在 React 17，第 8 条需要换成防抖实现或直接去掉。
- **接口层没有缓存**：每次进页面都重新拉三份数据。如果这是真实业务，可以考虑 SWR/React Query
  做请求去重与缓存，这属于另一个层面的优化，不在本次范围内。
