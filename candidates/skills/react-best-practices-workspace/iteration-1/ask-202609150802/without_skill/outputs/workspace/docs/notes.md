# Dashboard.tsx 性能优化说明

优化对象：`src/Dashboard.tsx`
报的两个现象：**打开要好几秒**、**切筛选（含输入框每敲一个字）卡**。

下面每处改动对应它要解决的问题。行为（筛选语义、排序、点击行回填筛选框、DOM 结构、导出的接口）都保持不变。

---

## 一、首屏慢（打开要好几秒）

### 1. 三个接口改成并发请求

**问题**：原来三个 `await` 串行排列，总耗时是三者相加 ≈ 600 + 650 + 550 = **1800ms** 才开始有第二轮数据，用户感知的"打开要好几秒"主要来自这里。

```ts
// 之前：一个接一个地等
const o = await fetchOrders();   // 600ms
setOrders(o);
const m = await fetchMetrics();  // 再 650ms
setMetrics(m);
const u = await fetchUsers();    // 再 550ms
setUsers(u);
```

```ts
// 现在：并发，总耗时 = 最慢的那个 ≈ 650ms
const [o, m, u] = await Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()]);
setOrders(o); setMetrics(m); setUsers(u);
```

**顺带的好处**：三次 `setState` 现在落在同一个微任务里，React 会合并成一次渲染，而不是渲染三遍。

**副作用（可接受）**：原来指标区会先于订单表出现，现在要等最慢的那个接口一起出现。首屏整体时间从 ~1800ms 降到 ~650ms，这个交换是划算的。

### 2. 加载 effect 加了取消标记

异步任务回来时组件可能已卸载。加了 `cancelled` 标志，卸载后不再 `setState`。这不影响首屏速度，属于顺手补的正确性问题（也避免和下面的 StrictMode 双调用互相干扰）。

---

## 二、切筛选卡

### 3. 筛选 + 排序从 state 改成 `useMemo` 派生

**问题**：原来是 `useEffect` 里算完再 `setRows(next)`。每敲一个字要走这一整套：

```
改 query → 渲染一次（rows 还是旧数据）→ effect 跑 → setRows → 又渲染一次
```

每个按键**渲染两遍**，而且第一遍是把整个 480 行表格用**旧的筛选结果**重画一遍——白画。同时表格会先闪一帧旧数据。

**改法**：`rows` 不再是 state，改成 `useMemo` 在渲染期直接算出来。每个按键只渲染一次，且渲染的就是最终数据。

**为什么没有加 debounce**：原来的卡顿不是因为"算得慢"——480 条的 filter+sort 是亚毫秒级的——而是因为上面那个"每次按键渲染两遍 + 白画一遍 480 行"。渲染循环本身被修掉之后，debounce 只会往输入上叠加 100~300ms 的人为延迟，得不偿失。如果以后数据量涨到几万条，再考虑 `useDeferredValue` 或虚拟滚动。

### 4. 成员查表从「每行 find 一次」改成一次建 Map

**问题**：原来的 `userOf` 是 `users.find(...)`，被每一行调用一次：

```ts
const userOf = (id: string) => users.find((u) => u.id === id);
// 480 行 × 最多 60 次比较 ≈ 每次渲染 2.9 万次比较
```

**改法**：`useMemo` 建一次 `Map<userId, name>`（O(n+m)），渲染时 `nameById.get(o.user)`。数据不变时 Map 引用不变。

### 5. 输入框的小写转换提到循环外

**问题**：`o.user.toLowerCase().includes(query.toLowerCase())` 把 `query.toLowerCase()` 写在了回调里，480 行就转换 480 次。

**改法**：在 `useMemo` 开头转一次 `const q = query.toLowerCase()`。

### 6. `Row` 用 `React.memo` 包起来 + 稳定 props

**问题**：组件里有 `width` state（窗口宽度）和一堆 state，任何一次改动都会重渲染全部 480 行 `<Row>`。但往往行数据一个都没变。

**改法**：`memo(Row)`，并保证传进去的三个 props 在数据没变时引用稳定：

- `order` —— 来自 `orders` 数组，不变时引用稳定；
- `name` —— 字符串，`Map` 查出来的是同一个原始值；
- `onPick` —— 原来写的是行内箭头 `onClick={() => setQuery(o.user)}`，**每次渲染都是新函数**，会让 `memo` 的浅比较永远失败。现在改成从父组件传一个 `useCallback` 包过的 `handlePick`，由 `Row` 内部调用 `onPick(order.user)`。

这几个是配套的：只加 `memo` 而不处理 `onPick` 和下面第 7 条的 `style`，`memo` 等于没加。

### 7. `style` 对象提到模块级

**问题**：`style={{ padding: 8 }}` 写在 JSX 里，每次渲染都是新对象引用 —— 同样会让第 6 条的 `memo` 失效。

**改法**：提到模块级的 `ROW_STYLE` 常量（顺带也少建 480 个对象）。

### 8. `key` 从数组下标改成订单 id

**问题**：`key={i}`。筛选会把数组重排/变短，用下标做 key 会让 React 把行错配到别的订单上（复用错误的 DOM 节点）。虽然这个表格没有局部 state 所以肉眼不容易看出来，但它是"列表能正确复用"的前提，和 `memo` 配合也是必须的。

**改法**：`key={o.id}`，订单 id 本身唯一。

---

## 三、顺手修的 bug

### 9. resize 监听器的泄漏

**问题**：这行写在**渲染函数体里**、没有 cleanup：

```ts
window.addEventListener('resize', () => setWidth(window.innerWidth));
```

每渲染一次就多挂一个监听器，且旧的全部不摘。改一次筛选状态就多一个，窗口一 resize 就触发 N 次 `setWidth`，又触发 N 次渲染——越用越卡，稳赚的泄漏。这也是上面第 6 条 `memo` 的意义被放大的原因。

**改法**：挪进 `useEffect(..., [])`，返回 `removeEventListener` 清理。`onResize` 抽成具名函数，保证卸载时摘掉的是同一个引用。

---

## 四、没动的地方 / 后续可选

- **`width` 这个 state 本身**：它只用来算 `style={{ width: width - 32 }}`。真要从根上消掉它，可以改成 CSS `width: calc(100% - 32px)`，这样窗口缩放完全不触发 React 渲染。没做是因为这个工作区里只有 `src/Dashboard.tsx` 一个文件、看不到配套 CSS，改样式选择器有破坏布局的风险，留给你确认。
- **480 行没有做虚拟滚动**：修掉上面这些之后，480 行的一次性渲染在正常机器上是够快的。数据量再上一个数量级才需要 `react-window` 之类的方案，而那要引入依赖。
- **筛选按的是成员 id 而不是成员名**：`placeholder` 写的是"按成员筛选"，但过滤用的是 `o.user`（id），表里显示的是 `name`。点击行回填的也是 id，所以内部是自洽的，属于有意为之的设计还是漏做，我不确定，没有擅自改（改成同时匹配 name 会改变筛选语义）。

---

## 未能验证的部分

- 工作区里**没有 `package.json` / `tsconfig.json` / 测试**，只有 `src/Dashboard.tsx` 一个文件，所以我**没有跑过类型检查、构建或测试**，也没有跑起来量过实际耗时。上面的数字（1800ms → 650ms）是按 `sleep` 时长推算的，代码改的是结构、性能结论需要你在真实工程里复测。
- 文件头部注释提到的 `candidates/skills/react-best-practices/evals/cases/` 在本工作区中不存在，无法参照；注释里说这份文件是评测用例的输入（`context.repo_fixture`）而**不是仓库的产品代码**。如果它确实是要保持现状的评测夹具，这份改动会影响该用例的预期，请确认后再决定是否保留。
