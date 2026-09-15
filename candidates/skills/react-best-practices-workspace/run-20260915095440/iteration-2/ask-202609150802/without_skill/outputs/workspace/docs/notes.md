# Dashboard.tsx 性能优化说明

优化对象：`src/Dashboard.tsx`。症状是「打开要好几秒」「切筛选卡」。
下面每处改动都标明它针对的是哪个问题。

> 说明：本工作区只有 `src/Dashboard.tsx` 一个文件，没有 `package.json` / tsconfig / 测试，
> 因此改动只做了静态审查，没能跑类型检查或测试。

## 一、首屏慢（打开要好几秒）

### 1. 三个接口从串行改并发

**问题**：原来的 effect 里是 `await fetchOrders()` → `await fetchMetrics()` → `await fetchUsers()` 依次 await。
三个接口互不依赖，但耗时被相加：600 + 650 + 550 ≈ **1800ms**，这是首屏白屏的主因。

**改法**：`Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()])`。
总耗时变成最慢的那个（≈650ms），一次拿到三份数据后统一 `setState`
（React 18 里同一轮里的三次 setState 会批处理，只多一轮渲染）。

顺带加了 `alive` 标志，组件在请求返回前卸载就不再 setState。

### 2. `window.innerWidth` 改惰性初始化

**问题**：`useState(window.innerWidth)` 每次渲染都会求值一次 `window.innerWidth`（虽然只有首次用作初始值），白白触发一次布局读取。

**改法**：`useState(() => window.innerWidth)`，只在首次渲染读一次。

## 二、切筛选卡

### 3. 筛选 + 排序从 effect + state 改成 useMemo 派生

**问题**：`rows` 被存成了 state，靠 `useEffect` 在 `orders/query/status` 变化时重算再 `setRows`。代价是：
- 每次切筛选都要多一整轮渲染（第一轮渲染旧的 rows，effect 跑完再渲染新的）；
- `orders` 和 `rows` 是两份副本，存在不同步的空间。

**改法**：用 `useMemo` 在渲染期直接算出 `rows`，依赖数组不变（语义一致）。
少一轮渲染，也少一份状态。

### 4. `query.toLowerCase()` 提到循环外

**问题**：原来在 `filter` 里对每一行都算一次 `query.toLowerCase()`，480 行就是 480 次重复计算。

**改法**：算一次存进 `q` 复用。（排序仍是 `b.amount - a.amount`，行序与原来一致；
`.sort` 作用在 `.filter()` 产出的新数组上，不会改动 `orders`。）

### 5. 成员查找从 `users.find` 改成 Map

**问题**：`userOf` 对每一行做一次 `users.find`，即 O(行数 × 成员数) = 480 × 60 ≈ **28800 次比较**，且每次渲染都重来一遍。

**改法**：用 `useMemo` 建 `Map<id, User>`，每行的查表变成 O(1)，Map 也只在 `users` 变化时重建。

### 6. `Row` 加 `memo`，并把它的 props 稳定下来

**问题**：`Row` 没有 memo，任何一点状态变化（包括 resize 改 `width`）都会让 480 行全部重渲染。
而且即使加了 memo 也没用，因为两个 prop 每次渲染都是新引用：
- `style={{ padding: 8 }}` —— 每渲染新建对象；
- `onPick={() => setQuery(o.user)}` —— 每渲染新建闭包。

**改法**：
- `style` 提成模块级常量 `ROW_STYLE`；
- `onPick` 改成 `useCallback` 包过的 `handlePick(userId)`，由 `Row` 内部用 `order.user` 调用；
- `Row` 用 `memo` 包裹，并给 `order`/`name`/`style`/`onPick` 都提供稳定引用（`order` 来自 `orders` state，`name` 是字符串）。

效果：切筛选/输入时，只有真正受影响的行走重渲染，而不是 480 行全量重渲染。

### 7. 列表 key 从下标改成 `o.id`

**问题**：`key={i}` 用数组下标。排序和筛选都会重排行序，用下标做 key 会让 React 按位置复用 DOM 和内部状态，容易张冠李戴。

**改法**：`key={o.id}`（订单 id 唯一）。

## 三、顺带修掉的 bug

### 8. resize 监听改成挂载一次 + 卸载时移除

**问题**：`window.addEventListener('resize', ...)` 直接写在组件函数体里，**每次渲染都新挂一个**，而且从不移除。后果：
- 监听器无限累积，内存泄漏；
- 一次缩放会触发 N 个监听器、N 次 `setWidth`；
- 每次 setWidth 又触发渲染，又一次挂新监听器，形成放大循环——切筛选时的高频重渲染会持续加剧这个问题。

**改法**：放进 `useEffect(..., [])`，并在 cleanup 里 `removeEventListener`。

### 9. `React.CSSProperties` 改成显式类型导入

**问题**：文件只 `import { useEffect, useState } from 'react'`，却用了 `React.CSSProperties` 命名空间。在模块里引用 UMD 全局 `React`，在部分 tsconfig 下会报 "refers to a UMD global"。

**改法**：`import { ..., type CSSProperties } from 'react'`，用 `CSSProperties` 替代。

## 四、没有改的地方（以及原因）

- **列表虚拟化**：480 行 DOM 本身不算大，瓶颈在重渲染而不是 DOM 数量（见第 6 条）。加虚拟滚动会显著增加复杂度，收益不确定，先不做；如果以后行数上千再说。
- **输入框防抖 / `useDeferredValue`**：筛选本身是 480 个元素的过滤，开销很小；输入卡顿的根源是 480 行全量重渲染，第 6 条已经解决。防抖还会让筛选结果滞后于输入，反而改变交互手感。
- **格式化的数字（`m.value`、`amount`）**：属于展示问题，与性能无关，不动。
