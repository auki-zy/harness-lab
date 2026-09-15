改完了，两处文件都已写回。

## 主要改动

**首屏慢（~1.8s）的根因是请求瀑布**，不是渲染：三个互不依赖的接口被 `await` 串成了 600+650+550ms，改成 `Promise.all` 后只等最慢的一个，约 **650ms** — 这是感知上最大的一笔。

**切筛选卡**是三件事叠加：
- `rows` 存在 state 里靠 effect 推导，每次筛选白走两轮渲染 → 改成渲染期 `useMemo`
- 每次按键同步跑"过滤 480 + 排序 480 + 重渲染 480 行" → `useDeferredValue` 把重活降级成可中断更新，输入框保持跟手
- `Row` 没 memo，而且 `style={{padding:8}}` 和 `onPick={() => ...}` 这两颗内联地雷让 memo 加了也没用 → 样式提到模块级常量、`useCallback` 固定回调、再包 `memo`；`key` 从下标换成订单 id

还有一处**顺手修的真 bug**：`window.addEventListener('resize', ...)` 写在渲染体里（旧 89 行），每次渲染挂一个且从不解绑 — 既漏内存，又让一次 resize 触发 N 轮全量渲染。已挪进 effect 并加了 rAF 合并和 cleanup。

`users.find` 逐行查找（单次渲染 28800 次比较）换成了 Map 索引。

## 需要你确认的两点

1. **`useDeferredValue` 需要 React 18+**。工作区里没有 `package.json`，我无法确认版本 — 如果项目还是 React 17，这行会直接报错，需要换成防抖。
2. **我无法做编译验证**：工作区只有 `src/Dashboard.tsx` 和 skill 目录，没有 `package.json`/`tsconfig.json`/测试。改动是纯静态的，建议接入后跑一次类型检查。

同理，我**没有**改 `sort` → `toSorted()`（skill 里有这条规则）：它针对的是原地排序 state 数组的坑，而这里 `sort` 作用在 `filter` 返回的新数组上，语义已经安全；`toSorted` 需要 ES2023 lib，没有 tsconfig 的情况下贸然用有编译风险。这一点和"虚拟滚动留作后续"都写在 `docs/notes.md` 的「有意没做的事」里了。

详细逐条对应（含改动前后的代码对比）都在 `docs/notes.md`。
