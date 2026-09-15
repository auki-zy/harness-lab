# Dashboard 性能优化说明

日期：2026-09-15
文件：`src/Dashboard.tsx`

两个症状：**打开要好几秒**（首屏慢）、**切筛选卡**（交互卡）。下面每处改动都标了它针对的是哪一个。

---

## 一、首屏慢（打开好几秒）

### 1. 三份数据串行请求 → 并行

**改前**（`useEffect` 里）：

```ts
const o = await fetchOrders();   // 600ms
setOrders(o);
const m = await fetchMetrics();  // 650ms
setMetrics(m);
const u = await fetchUsers();    // 550ms
setUsers(u);
```

三个接口各自 `await` 完才发下一个，总耗时是三者相加 ≈ **1800ms**，而且中间两个接口本来跟第一个没有任何依赖关系，纯粹是被写成了串行。

**改后**：`Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()])`，总耗时降到最慢的那个 ≈ **650ms**。首屏时间砍掉约 2/3，这是打开慢的最大一块。

顺带加了 `alive` 标志位做卸载保护：请求返回时组件可能已经卸载，避免往已卸载组件里写 state。

### 2. 成员查找 O(行数 × 成员数) → O(1)

**改前**：`const userOf = (id) => users.find(u => u.id === id)`，在渲染 480 行时每行调一次，即 480 × 60 = **28800 次比较**，而且每次重渲染都重来一遍。

**改后**：`useMemo` 建一个 `Map<id, User>`，每行 `userMap.get(o.user)` 是 O(1)。只在 `users` 变化时重建一次。

---

## 二、切筛选卡

### 3. 派生数据用 `useState` + `useEffect` → `useMemo`

**改前**：

```ts
const [rows, setRows] = useState<Order[]>([]);
useEffect(() => {
  const next = orders.filter(...).filter(...).sort(...);
  setRows(next);
}, [orders, query, status]);
```

`rows` 完全是从 `orders` / `query` / `status` 推出来的，却存了一份 state。代价是每次筛选都要**多跳一次渲染**（effect 跑完 setState 再渲染一遍），中间还有一帧 `rows` 与 `orders` 不一致的中间态。

**改后**：`useMemo` 在渲染期直接算出来，少一跳渲染，也不存在中间态。

> 这里有个坑：`useMemo` 里如果写成 `status === 'all' ? orders : orders.filter(...)`，那么"全部 + 无关键字"时拿到的是 `orders` **本身**，后面直接 `.sort()` 会**原地改掉 state 数组**。所以补了 `.slice()` 再排序。原来的双重 `.filter()` 每次都返回新数组，恰好没这个问题，改成短路写法后反而必须显式拷贝。

### 4. 输入防抖

**改前**：`query` 一变就重算，注释里也点明了"每敲一个字就重算一遍"。全部 480 行都会被重新过滤、排序、重渲染。

**改后**：新增 `useDebounced`，输入框的 `value` 仍然即时更新（打字不丢手感），但过滤用的是防抖 200ms 后的 `debouncedQuery`。打字过程中重算次数从"每字符一次"降到"停顿后一次"。

`status` 下拉**不**防抖，仍然立即生效——切筛选是明确的离散操作，加延迟只会显得卡。

> 如果后续确认运行在 React 18，`useDeferredValue` 是比手写防抖更贴合的替代方案（不引入固定延迟，靠优先级让输入先渲染）。当前没看到 `package.json`，无法确认版本，所以选了版本无关的写法。

### 5. 行组件 `memo` + 稳定 props

**改前**：`Row` 没有 `memo`，且三个 prop 每次渲染都是新的：

- `style={{ padding: 8 }}` —— 每次新建对象字面量
- `onPick={() => setQuery(o.user)}` —— 每行每次新建闭包

所以即使加了 `memo` 也没用，480 行照样全量重渲染。

**改后**：

- `style` 提到模块级常量 `ROW_STYLE` / `METRIC_STYLE`，引用恒定
- `onPick` 改成 `useCallback` 包一个接收 `userId` 的稳定函数，`Row` 内部自己取 `order.user` 调用
- `Row` 用 `memo` 包起来

这样 480 行的渲染只在数据真的变了时发生。

### 6. `key={i}` → `key={o.id}`

**改前**用数组下标当 key。筛选和排序之后同一个下标对应的订单完全变了，React 会按位置复用 DOM 节点、把内容全量改一遍，丢失复用意义。

**改后**用 `order.id`，节点身份跟数据走，筛选/排序时只动真正增删的那部分。

### 7. resize 监听泄漏

**改前**：

```ts
window.addEventListener('resize', () => setWidth(window.innerWidth));
```

直接写在渲染体里——**每次渲染挂一个新监听，且从不移除**。重渲染越多次，监听器堆得越多；每次 resize 又触发一次 `setWidth` → 重渲染 → 再挂一个，恶性循环。

**改后**：放进 `useEffect`，带 cleanup 正确 `removeEventListener`；并且用 `requestAnimationFrame` 合并同一帧内的多次 resize 事件，避免拖拽窗口时每个事件都触发一次全量重渲染。

---

## 三、顺带的小清理

- `React.CSSProperties` 改成 `import type { CSSProperties } from 'react'`——原文件只 import 了 `useEffect, useState`，`React` 命名空间是靠 UMD 全局类型声明才没报错，显式 import 更稳。
- 文件头注释里"故意留着几处性能问题给人优化"这句已经过时，改成了指向本文档的说明。

---

## 四、没有动、但值得记一笔的

- **480 行没有虚拟滚动**。现在每行都 memo 了，实际渲染量可以接受。如果行数再涨一个量级（几千行），应该上 `react-window` 之类的虚拟列表，而不是继续在 memo 上抠。当前没引入依赖，因为 480 行还不值得。
- **`width - 32` 这个 JS 尺寸计算**：其实可以用 CSS `width: calc(100% - 32px)` 完全替掉 `width` state 和整个 resize 监听，代码更少、连 rAF 都省了。没这么改是因为它会改变 DOM 上的实际宽度语义（跟父容器走 vs 跟视口走），属于行为变更而不只是性能优化，先按原语义修好监听器。
- **导出的模拟接口签名没变**：`fetchOrders` / `fetchMetrics` / `fetchUsers` 以及 `Order` / `Metric` / `User` 三个类型都保持原样，外部若有引用不受本次改动影响。

---

## 五、验证情况

工作区里只有 `src/Dashboard.tsx` 一个文件，没有 `package.json`、构建配置或测试，**本次改动没有实际跑过构建或测试**。上面 1/3/7 的耗时数字是按文件里标注的 `sleep` 时长推算的，不是实测。如果要落地，建议在有构建环境的地方跑一遍类型检查和现有用例。
