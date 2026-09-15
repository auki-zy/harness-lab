# Skill Benchmark: react-best-practices

**Date**: 2026-09-15T09:57:25Z
**Evals**: src/Dashboard.tsx 打开要好几秒，切筛选也卡，帮我优化一下。改完直接写回这个文件，改动说明放 docs/… (1 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|-----------|--------------|-------|
| Pass Rate | 100% ± 0% | 100% ± 0% | +0.00 |

## Per-Case Results

### src/Dashboard.tsx 打开要好几秒，切筛选也卡，帮我优化一下。改完直接写回这个文件，改动说明放 docs/… (with_skill)

- **Pass Rate**: 100% (4/4)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| 只按用户给出的这条任务要求评判：任务里明确要的东西都在，就算做到了；任务没要求的，不许拿来扣分（也别用别的标准） | ✅ | 任务三项要求逐条对照：第一，优化 src/Dashboard.tsx 的两个症状（首屏慢、切筛选卡）——已做；第二，改完直接写回原文件——工具结果确认 The file ... Dashboard.tsx has been updated successfully，磁盘上 src/Dashboard.tsx 已变为 7220 字节（原 4726 字节）；第三，改动说明放 docs/notes.md 并写清每处改动想解决哪个问题——docs/notes.md 已创建（8018 字节），开头即写明针对两个症状：首屏打开要好几秒、切换筛选/输入时卡顿，并按『改动 → 想解决的问题』逐条对应。; 未对任务未要求的事项扣分依据：任务未要求虚拟滚动、未要求把 sort 换成 toSorted、未要求跑基准或性能量化；agent 对这两项未做的事只在 notes.md 的『有意没做的事』一节说明，属额外交代而非遗漏交付。; 任务未要求额外文件、git 提交或构建脚本，交付范围与任务描述一致，无超范围扣分点。 |
| 产出要能用：交付物在、能跑起来 / 能打开、格式没错；跑不起来、交付物缺失、输出对不上任务要求的格式，才算没做到 | ✅ | 两个交付物均存在且非空：src/Dashboard.tsx（7220 字节，mtime Sep 15 09:55）、docs/notes.md（8018 字节）。; 写回的文件是合法 TSX：第 7 行为 import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'; 导出接口 Order/Metric/User 与 fetchOrders/fetchMetrics/fetchUsers 三个模拟接口原样保留，Dashboard 组件结构（header、input、select、metrics、table）完整，末尾 const Row = memo(function Row({ order, name, onPick }: RowProps) { ... }); 闭合正确，未发现语法残缺。; docs/notes.md 格式与任务要求一致：按『首屏慢』『切筛选卡』『顺手修掉的 bug』『有意没做的事』『验证情况』分节，每条含原代码、问题、改法、效果并标注改动前行号，符合写清每处改动想解决哪个问题的要求。; 可运行性风险被如实披露：工作区无 package.json 与 tsconfig.json（agent 用 find 确认仅有 .claude/skills/react-best-practices 下文件与 src/Dashboard.tsx），不存在可执行的构建或测试链路；agent 在 notes.md 的『验证情况』与 final_message 中明确写明未经编译或运行时验证，并提示 useDeferredValue 需 React 18+、若为 React 17 需改防抖，未把未验证说成已验证。; 所用 React API 在 React 18+ 下语义正确（Promise.all 并行取数、useMemo 派生 rows、useDeferredValue 降级更新、memo 配 useCallback 与模块级 ROW_STYLE 常量、key 改用订单 id），未发现会导致运行报错的调用；React.CSSProperties 类型引用沿用原文件既有写法（原 RowProps 同样直接使用而未 import React），不是本次引入的新问题。 |
| 针对用户说的两个症状（首次打开慢、切筛选卡）在代码里有对应改动，而不是只做了无关的清理 | ✅ | 症状一首屏打开要好几秒有直接对应改动：src/Dashboard.tsx 第 76 行 const [o, m, u] = await Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()]); 替换了原第 67-77 行 600+650+550ms 的串行 await 瀑布，并加了 cancelled 标志与卸载 cleanup；notes.md 第 1 条给出改动前后代码对比与 1800ms 到 650ms 的估算。; 症状二切筛选卡有多处对应改动：（a）删除 rows state 加 effect，改为渲染期派生，src/Dashboard.tsx 第 113 行 const rows = useMemo(...)，原第 80-86 行每次筛选多走一轮渲染；（b）第 109 行 const deferredQuery = useDeferredValue(query); 输入框读实时 query、筛选排序读延迟值；（c）第 125 行 const handlePick = useCallback(...) 配合第 59 行模块级 const ROW_STYLE: React.CSSProperties = { padding: 8 }; 与第 193 行 const Row = memo(function Row(...))，消除原内联 style 与内联 onPick 箭头函数导致 memo 失效的问题；（d）第 172 行 key={o.id} 替换原第 136 行 key={i}；（e）第 122 行 const nameById = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]); 替换原第 91 行逐行 users.find。; notes.md 的『切筛选卡』一节以编号 3/4/5/6/7 逐条对应上述改动，每条标注原代码行号与想解决的问题，说明改动确实针对症状而非无关清理。; 顺带修复的 resize 监听（第 100/102 行 addEventListener 与 removeEventListener 移入 useEffect，加 rAF 合并与 cleanup）虽被标注为顺手修掉的 bug，但原第 89 行写在渲染体内会使一次 resize 触发 N 轮全量渲染，同样直接服务于卡顿症状，不属于与两个症状无关的清理。 |

### src/Dashboard.tsx 打开要好几秒，切筛选也卡，帮我优化一下。改完直接写回这个文件，改动说明放 docs/… (without_skill)

- **Pass Rate**: 100% (4/4)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| 只按用户给出的这条任务要求评判：任务里明确要的东西都在，就算做到了；任务没要求的，不许拿来扣分（也别用别的标准） | ✅ | 任务三项要求：(1) 优化 src/Dashboard.tsx 打开慢/切筛选卡；(2) 改完直接写回这个文件；(3) 改动说明放 docs/notes.md，写清每处改动对应解决哪个问题。; (1) 性能优化已做：Promise.all 并行取数、useMemo 派生 rows、Map 预建成员索引、Row memo、key 改 o.id、toLowerCase 提出循环、resize 监听改 useEffect+清理（transcript 中 Write 调用对 src/Dashboard.tsx 的完整内容）。; (2) 改动确实写回同一个文件：Write 工具调用 file_path 为 C:\Users\yu.zhao\AppData\Local\Temp\skill-up-3445873044\src\Dashboard.tsx，工具返回 "has been updated successfully"；磁盘上 src/Dashboard.tsx 由 4726 字节变为 5671 字节。; (3) docs/notes.md 已创建（工具返回 "File created successfully"，磁盘 6303 字节），且按改动逐条写明了对应症状，例如「### 1. 三个接口从串行改成并行」下明写「**症状**：打开要好几秒」，「### 5. 筛选 + 排序从 state + useEffect 改成 useMemo 派生值」下明写「**症状**：切筛选卡」。; 未发现应扣分项：任务没有要求跑测试、跑浏览器、加防抖或虚拟化，这些属于任务外内容，agent 也在 notes.md 第四节明确列出「这次没有做的事」，不据此扣分。 |
| 产出要能用：交付物在、能跑起来 / 能打开、格式没错；跑不起来、交付物缺失、输出对不上任务要求的格式，才算没做到 | ✅ | 两个交付物都在磁盘上：src/Dashboard.tsx（5671 字节，09:56）与 docs/notes.md（6303 字节，09:57），路径与任务要求一致。; 格式正确：Dashboard.tsx 仍是 TS/TSX 模块，保留了原有 export interface Order / Metric / User 与 fetchOrders / fetchMetrics / fetchUsers / Dashboard 导出，仅新增 memo、useCallback、useMemo、CSSProperties 导入，未改变对外接口形状。; 可编译：agent 在工作区外临时目录用 typescript + @types/react，strict: true / jsx: react-jsx 单编该文件，Bash 返回 "TSC EXIT: 0"（无报错）。; 任务未要求可运行的应用或测试通过；工作区内没有 package.json/tsconfig/测试，agent 在 final_message 与 notes.md 中如实说明「没跑过测试、没在浏览器里跑过」，未把未做的验证谎报成已完成。; notes.md 内容与任务要求的格式吻合：按「一、打开慢 / 二、切筛选卡 / 三、顺带修的 bug / 四、没有做的事 / 五、需要确认的事」分节，每条改动都带症状标注与原因解释。 |
| 针对用户说的两个症状（首次打开慢、切筛选卡）在代码里有对应改动，而不是只做了无关的清理 | ✅ | 症状一「首次打开慢」有对应代码改动：useEffect 内改为 `const [o, m, u] = await Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()])`，替代原先 600ms→650ms→550ms 的串行 await（原文件 67-77 行），消除约 1150ms 的无效等待。; 症状一「首次打开慢」另有：`userOf`（每行一次 `users.find`）改为 `const nameById = useMemo(() => new Map(users.map(u => [u.id, u.name])), [users])`，并在渲染中用 `nameById.get(o.user) ?? o.user`，把 480×60 次线性查找降为 O(1)。; 症状一/二共同相关：`const Row = memo(function Row(...))`，同时把 `style={{padding:8}}` 提到模块级常量 `ROW_STYLE`/`METRIC_STYLE`，并把 `onPick={() => setQuery(o.user)}` 换成 `handlePick = useCallback((user: string) => setQuery(user), [])` + 行内 `onClick={() => onPick(order.user)}`，使 memo 的比较真正生效。; 症状一：列表 key 由 `key={i}` 改为 `key={o.id}`，避免筛选后数组长度变化导致的下标错配复用。; 症状二「切筛选卡」有对应代码改动：`rows` 由 `useState<Order[]>` + `useEffect(() => {...setRows(next)}, [orders, query, status])` 的双渲染流程，改为 `const rows = useMemo(() => {...}, [orders, query, status])` 派生值，去掉中间态与多出的一轮渲染。; 症状二：`query.toLowerCase()` 由 filter 回调内（480 次迭代各算一遍）提到 useMemo 顶部 `const q = query.trim().toLowerCase()`，循环内只用 `q`。; 两处症状之外还修了会放大卡顿的 resize 监听 bug：由组件函数体内的 `window.addEventListener('resize', () => setWidth(window.innerWidth))`（每次渲染挂一个且不解绑）改为带有 `removeEventListener` 清理的 `useEffect(..., [])`；此改动在 notes.md 第三节标题即写明「顺带修掉的一个 bug（不是性能问题，但会放大卡顿）」，属于加成而非偏题。 |

