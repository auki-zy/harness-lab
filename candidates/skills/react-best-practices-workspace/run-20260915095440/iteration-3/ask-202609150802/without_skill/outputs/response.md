改完了，写回 `src/Dashboard.tsx`，说明在 `docs/notes.md`。

**打开慢（≈1800ms 的首屏）**
1. 三个接口串行 `await` → `Promise.all`,首屏降到最慢的那个 ≈650ms。这是最大一块,且三个请求本来互不依赖。
2. `users.find` 每行调一次(480×60=28800 次比较)→ `useMemo` 建 `Map`,O(1)。

**切筛选卡**
3. `rows` 从 `useState`+`useEffect` 改成 `useMemo` —— 它是纯派生数据,原来每次筛选多跳一次渲染,还有一帧不一致的中间态。
4. 输入加 200ms 防抖(下拉不防抖,立即生效)。
5. `Row` 加 `memo` + 稳定 props:原来 `style={{padding:8}}` 和 `onPick={() => ...}` 每次渲染都是新引用,单加 memo 也没用。
6. `key={i}` → `key={o.id}`,筛选排序后下标不再对应同一订单。
7. resize 监听写在渲染体里,每次渲染挂一个且从不移除 → 放进 `useEffect` 带 cleanup,并用 rAF 合并同帧事件。

**一处需要你注意的坑**:改为短路写法 `status === 'all' ? orders : orders.filter(...)` 后,「全部+无关键字」时拿到的是 `orders` 本身,直接 `.sort()` 会原地改掉 state,所以补了 `.slice()`。原来的双重 `.filter()` 每次都返回新数组,恰好掩盖了这个问题。

**两点如实说明**:
- 工作区里只有 `Dashboard.tsx` 一个文件,没有 `package.json`/构建配置/测试,所以**改动没有实际跑过构建或类型检查**;notes 里的耗时是按代码里标注的 `sleep` 时长推算的,不是实测。
- 这个文件头部注释写明它是 eval 用例 `ask-<id>` 的工作区输入,不是产品代码,并提示改之前先看 `candidates/skills/react-best-practices/evals/cases/` 下的用例。该目录不在当前工作区里,我没能读到。如果它是每次评测重新拷贝的 fixture,原地覆盖会改掉原件——需要的话我可以把改动另存一份。

另外 notes 里记了两个没动的点:480 行没上虚拟滚动(现在 memo 后可以接受,涨到几千行再说),以及 `width - 32` 其实可以用 CSS `calc()` 整个替掉 resize 监听——没这么改是因为它会改变宽度语义(跟父容器 vs 跟视口),属于行为变更而非单纯优化。
