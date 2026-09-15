# Dashboard.tsx 性能优化说明

日期：2026-09-15
文件：`src/Dashboard.tsx`（已直接写回）
参考：`.claude/skills/react-best-practices/SKILL.md`

## 一句话结论

打开慢的主因是**三个接口串行 await**（约 1800ms → 约 650ms）；切筛选卡的主因是**筛选结果被放进 state 再用 effect 回写**、**每敲一个字就全表重算**、以及**每行都做一次线性查找**。

## 逐条改动：问题 → 改动

### 1. 三个接口串行请求（对应「打开要好几秒」）

- **问题**：`useEffect` 里 `await fetchOrders()` → `setOrders` → `await fetchMetrics()` → `await fetchUsers()`，一个接一个。三次耗时相加：600 + 650 + 550 ≈ **1800ms**。这是 SKILL.md 里列为 CRITICAL 的 request waterfall。
- **改动**：三个请求互不依赖，改成 `Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()])` 并行发出，全部返回后一次性 `setState`。
- **效果**：理论等待时间从「三者之和」降到「三者最大值」，约 **1800ms → 650ms**。

### 2. 派生值放进 state + effect（切筛选卡顿主因之一）

- **问题**：`rows` 是 `orders`/`query`/`status` 的派生值，却被存进 `useState`，再由一个 `useEffect` 监听依赖后 `setRows`。这造成每次筛选都多一轮「渲染 → effect → setState → 再渲染」的往返，且 `rows` 有第二份真相，容易不同步。
- **改动**：删掉 `rows` state 和那个 effect，改为在渲染期用 `useMemo` 直接算派生结果。
- **效果**：少一轮渲染往返；筛选结果与数据源天然一致。

### 3. 输入框每个字符都触发全表重算（对应「切筛选也卡」）

- **问题**：原注释自己指出了「每敲一个字就重算一遍」。输入框的 `query` 同时驱动筛选和排序，每次按键都在同一帧里做 480 条的过滤 + 排序，输入本身被拖慢。
- **改动**：用 `useDeferredValue(query)` 拿到 `deferredQuery`，输入框仍绑即时值（保证按键不卡），筛选/排序用 deferred 值。
- **效果**：输入响应与列表重算解耦，打字优先级高于列表刷新。

### 4. 渲染期挂 resize 监听且从不清理（隐性泄漏，非本次报的两个症状，但同源）

- **问题**：`window.addEventListener('resize', ...)` 写在组件函数体里，**每次渲染都执行一次**且没有 `removeEventListener`。渲染 N 次就累积 N 个监听器，之后每次窗口变化都会触发 N 次 `setWidth`，越用越卡，同时持有已卸载组件的引用。
- **改动**：改用 `useSyncExternalStore(subscribeToResize, ...)` 订阅窗口宽度，`subscribe`/`getSnapshot` 提到模块作用域保证引用稳定，由 React 负责订阅与清理。
- **效果**：监听器恒为 1 个，卸载自动清理；顺带避免了 SSR/首屏的 hydration 不一致（提供了 `getServerSnapshot`）。

### 5. 每行一次线性查找（×480 行）

- **问题**：`userOf` 用 `users.find(...)` 逐行查找，单次渲染约 **480 × 60 ≈ 2.9 万次**比较；且它是在 `map` 内调用的，每次渲染都重来。
- **改动**：用 `useMemo` 把 `users` 建成 `Map<id, User>`，行内改成 `userMap.get(...)`，O(n·m) → O(n)。
- **效果**：查找次数从约 2.9 万降到 480 次，且只在 `users` 变化时重建索引。

### 6. 长列表整表重渲染

- **问题**：`Row` 未 memo，且每行都新建 `style={{padding: 8}}` 和 `onPick={() => ...}` 闭包，浅比较必然失败；`key={i}` 用数组下标，在筛选/排序会改变顺序的场景下会让 React 复用错行。
- **改动**：
  - `Row` 用 `memo` 包裹；
  - 静态样式提为模块级常量 `ROW_STYLE`；
  - 回调改为稳定的 `handlePick`（`useCallback`），行内只传 `userId`；
  - `key` 改用 `o.id`。
- **效果**：切换筛选、打字、缩放窗口时，未变化的行不再重渲染；行复用按身份而非下标。

### 7. 查询串重复规整

- **问题**：`query.toLowerCase()` 写在 filter 回调里，每个元素都算一次。
- **改动**：在 `useMemo` 顶部算一次 `const q = deferredQuery.trim().toLowerCase()` 再复用（SKILL.md「Cache repeated function calls」）。
- **效果**：每轮筛选少约 480 次 `toLowerCase` + 480 次 `trim`；顺带让筛选对首尾空格更宽容。

### 8. 其他小改动

- 异步 effect 加了 `cancelled` 标志，避免请求返回时组件已卸载仍 `setState`。
- 原文顶部注释引用的 `candidates/skills/react-best-practices/evals/cases/` 在当前工作区不存在，已在注释里注明实际依据是 `SKILL.md`。

## 评估过但没改的（含理由）

- **`.sort()` 改成 `.toSorted()`**：SKILL.md 把「用 `.sort()` 而非 `.toSorted()`」列为 pitfall，但这里 `.sort()` 是接在 `.filter()` 之后、作用于 filter 新建的数组，**不会**改动 `orders` state，无副作用；且 `toSorted()` 需要 ES2023 目标，当前工作区没有 `tsconfig` 无法确认 lib 配置。故保持原样。
- **给 `<tr>` 加 `content-visibility: auto` 跳过视口外行的布局与绘制**：本来是最贴合 SKILL.md「CSS content-visibility for long lists」的低成本做法，我加完又撤掉了 —— CSS Containment 规定 size containment 对「内部表格盒」（`table-row`/`table-cell` 等）**不生效**，而 `content-visibility` 的适用性跟随 `contain: size`，Chromium 和 Firefox 都已明确**不对内部表格盒应用 `content-visibility`**。加在 `<tr>` 上是空操作，只会留下一条误导性注释。要真正生效需要把表格改成 div 列表或引入虚拟滚动，属于结构改动，未纳入本次范围。
- **虚拟滚动（react-window 等）**：480 行配合 memo 已经够用，引入依赖的收益不划算，且会改动 DOM 结构。

## 验证情况（请留意）

- 本工作区**没有** `package.json` / `tsconfig.json` / `node_modules`，无法 `tsc` 类型检查，也无法起应用实测。上面所有耗时数字都是依据 fixture 里 `sleep()` 的固定值做的**算术推算**，不是实测结果。
- 实际能做的验证：用 `bun build` 转译该文件通过（`--external react`），确认**无语法错误**。类型层面未验证。
- 兼容性前提：`useDeferredValue` 和 `useSyncExternalStore` 都需要 **React 18+**。原文件用的是 React Hooks 写法，但没能确认实际安装的 React 版本，升级前请确认。
- 建议在真实环境用 React DevTools Profiler 复核筛选交互的渲染次数，并按需调整。
